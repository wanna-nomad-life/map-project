/**
 * space_tamnik 채널 쇼츠 수집 - 설명에 장소가 있는 쇼츠만 추가
 * 설명에서 위치 추출 → 지오코딩 → 지도에 표시
 *
 * 실행: npm run fetch-space-tamnik
 */
import { Innertube } from 'youtubei.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBestAddressFromTexts, getBestLocationTextFromTexts, geocodeAddress } from './lib/location-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

const SHORTS_URL = 'https://www.youtube.com/@space_tamnik/shorts';
const CHANNEL = {
  id: 2,
  name: 'space_tamnik',
  subs: '조회수 확인 필요',
  initial: 'S',
  color: '#2196F3',
  youtubeChannelId: '', // 채널 페이지에서 가져옴
  url: 'https://www.youtube.com/@space_tamnik',
};

function extractFromRaw(obj, items = []) {
  if (!obj) return items;
  if (obj.entityId?.startsWith('shorts-shelf-item-')) {
    const m = obj.entityId.match(/shorts-shelf-item-([a-zA-Z0-9_-]{11})/);
    if (m) {
      const title = obj.overlayMetadata?.primaryText?.runs?.[0]?.text || obj.accessibilityText?.split(',')[0]?.trim() || '';
      const views = obj.overlayMetadata?.secondaryText?.runs?.[0]?.text || '';
      items.push({ youtubeVideoId: m[1], title, views });
    }
    return items;
  }
  if (obj.videoId && /^[a-zA-Z0-9_-]{11}$/.test(obj.videoId) && !obj.videoId.startsWith('UC')) {
    const title = obj.title?.runs?.[0]?.text || obj.headline || obj.accessibility?.label || '';
    const views = obj.viewCountText?.runs?.[0]?.text || obj.viewCountText?.simpleText || '';
    if (!items.some((i) => i.youtubeVideoId === obj.videoId)) {
      items.push({ youtubeVideoId: obj.videoId, title, views });
    }
    return items;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) v.forEach((i) => extractFromRaw(i, items));
      else extractFromRaw(v, items);
    }
  }
  return items;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 댓글 텍스트 배열 반환 (최상위 댓글만) */
async function fetchCommentTexts(innertube, videoId) {
  try {
    const comments = await innertube.getComments(videoId);
    const texts = [];
    for (const th of (comments?.contents || []).slice(0, 30)) {
      const cv = th?.comment;
      if (cv?.content) {
        const t = cv.content?.toString?.() || cv.content?.text || '';
        if (t.trim()) texts.push(t.trim());
      }
    }
    return texts;
  } catch {
    return [];
  }
}

async function main() {
  console.log('space_tamnik 쇼츠 수집 - 설명에 장소 있는 것만 추가\n');
  console.log('URL:', SHORTS_URL, '\n');

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const existingVideoIds = new Set(db.shorts.map((s) => s.youtubeVideoId));
  let maxId = Math.max(...db.shorts.map((s) => s.id), 0);

  // 채널 추가 (없으면)
  let channel = db.channels.find((c) => c.id === CHANNEL.id || c.url?.includes('space_tamnik'));
  if (!channel) {
    db.channels.push({
      id: CHANNEL.id,
      name: CHANNEL.name,
      subs: CHANNEL.subs,
      initial: CHANNEL.initial,
      color: CHANNEL.color,
      youtubeChannelId: CHANNEL.youtubeChannelId || `channel_${CHANNEL.id}`,
      url: CHANNEL.url,
    });
    console.log('채널 추가:', CHANNEL.name);
  } else {
    CHANNEL.youtubeChannelId = channel.youtubeChannelId || CHANNEL.youtubeChannelId;
  }

  const innertube = await Innertube.create();
  const resolved = await innertube.resolveURL(SHORTS_URL);
  if (!resolved) {
    console.log('URL resolve 실패');
    return;
  }

  const raw = await innertube.call(resolved, { parse: false });
  if (!raw?.data) {
    console.log('쇼츠 페이지 로드 실패');
    return;
  }

  const allShorts = extractFromRaw(raw.data);
  const unique = [...new Map(allShorts.map((s) => [s.youtubeVideoId, s])).values()];
  console.log(`총 ${unique.length}개 쇼츠 발견\n`);

  let added = 0;
  let skipped = 0;

  for (let i = 0; i < unique.length; i++) {
    const s = unique[i];
    if (existingVideoIds.has(s.youtubeVideoId)) {
      skipped++;
      continue;
    }

    let description = '';
    try {
      const info = await innertube.getInfo(s.youtubeVideoId);
      if (info?.secondary_info?.description) {
        description = info.secondary_info.description?.toString?.() || info.secondary_info.description?.text || '';
      }
      if (!description && info?.basic_info?.short_description) {
        description = info.basic_info.short_description || '';
      }
    } catch (e) {
      console.warn(`  [${i + 1}] ${s.title?.slice(0, 40)}... - 설명 조회 실패`);
      await sleep(800);
      continue;
    }

    const fullText = `${s.title || ''}\n${description}`;
    const commentTexts = await fetchCommentTexts(innertube, s.youtubeVideoId);
    await sleep(500);
    const extracted = getBestAddressFromTexts(fullText, commentTexts);

    if (!extracted) {
      console.log(`  [${i + 1}/${unique.length}] ${s.title?.slice(0, 45)}... - 장소 없음 (건너뜀)`);
      skipped++;
      await sleep(800);
      continue;
    }

    const loc = await geocodeAddress(extracted);
    if (!loc || loc.lat == null || loc.lng == null) {
      console.log(`  [${i + 1}/${unique.length}] ${s.title?.slice(0, 45)}... - 지오코딩 실패: ${extracted}`);
      skipped++;
      await sleep(1100);
      continue;
    }

    maxId++;
    existingVideoIds.add(s.youtubeVideoId);
    const locationText = getBestLocationTextFromTexts(fullText, commentTexts);
    db.shorts.push({
      id: maxId,
      title: s.title || '(제목 없음)',
      views: s.views || '조회수 확인 필요',
      growthRate: 0.8,
      color: CHANNEL.color,
      youtubeVideoId: s.youtubeVideoId,
      lat: loc.lat,
      lng: loc.lng,
      place: loc.place,
      placeName: loc.placeName,
      address: loc.address,
      locationText: locationText || null,
      channelId: CHANNEL.id,
    });
    added++;
    console.log(`  [${i + 1}/${unique.length}] + ${s.title?.slice(0, 45)}... → ${loc.placeName}`);
    await sleep(1100);
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`\n완료! 추가: ${added}개, 건너뜀: ${skipped}개`);
  console.log('쇼츠 클릭 시 지도에서 해당 위치로 이동합니다.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
