/**
 * 뉴욕세끼 채널 쇼츠 수집 → shorts.json 병합 (중복 제외)
 * URL: https://www.youtube.com/@뉴욕세끼/shorts
 *
 * 실행: node scripts/fetch-all-nyeat-shorts.js
 */
import { Innertube } from 'youtubei.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

const SHORTS_URL = 'https://www.youtube.com/@%EB%89%B4%EC%9A%95%EC%84%B8%EB%81%BC/shorts';
const CHANNEL = {
  id: 1,
  name: '뉴욕세끼 NYeat',
  subs: '49.5만',
  initial: '뉴',
  color: '#e53935',
  youtubeChannelId: 'UCmxdQo57ptM088VXM200fGw',
  url: 'https://www.youtube.com/@%EB%89%B4%EC%9A%95%EC%84%B8%EB%81%BC',
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

async function main() {
  console.log('뉴욕세끼 쇼츠 수집 중...\n');
  console.log('URL:', SHORTS_URL, '\n');

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
  console.log(`총 ${unique.length}개 쇼츠 수집 완료`);

  // shorts.json 병합
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const existingIds = new Set(db.shorts.map((s) => s.youtubeVideoId));
  let maxId = Math.max(...db.shorts.map((s) => s.id), 0);

  const existingLocations = {};
  for (const s of db.shorts) {
    if (s.lat != null && s.lng != null) {
      existingLocations[s.youtubeVideoId] = {
        lat: s.lat,
        lng: s.lng,
        place: s.place,
        placeName: s.placeName,
        address: s.address,
      };
    }
  }

  let added = 0;
  for (const s of unique) {
    if (existingIds.has(s.youtubeVideoId)) continue;
    existingIds.add(s.youtubeVideoId);
    maxId++;

    const loc = existingLocations[s.youtubeVideoId] || {};
    db.shorts.push({
      id: maxId,
      title: s.title || '(제목 없음)',
      views: s.views || '조회수 확인 필요',
      growthRate: 0.8,
      color: CHANNEL.color,
      youtubeVideoId: s.youtubeVideoId,
      lat: loc.lat ?? null,
      lng: loc.lng ?? null,
      place: loc.place ?? null,
      placeName: loc.placeName ?? null,
      address: loc.address ?? null,
      channelId: CHANNEL.id,
    });
    added++;
    console.log(`  + ${s.title.slice(0, 50)}...`);
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`\nshorts.json 업데이트 완료. 새로 추가: ${added}개`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
