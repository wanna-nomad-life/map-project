/**
 * 채널 쇼츠 업데이트 API - 아직 등록되지 않은 모든 쇼츠 수집 (최신순)
 * POST /api/update-channel-shorts
 * Body: { channelId: number }
 */
import { Innertube } from 'youtubei.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getBestAddressFromTexts,
  getBestLocationTextFromTexts,
  geocodeAddress,
  extractAllAddressesFromTourSchedule,
  extractMultipleLocations,
  inferPlaceFromKeywords,
} from './lib/location-utils.js';
import { extractGoogleMapsLocations } from './lib/google-maps-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

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

/** upload_date "20231215" -> Date */
function parseUploadDate(str) {
  if (!str || str.length < 8) return null;
  const y = parseInt(str.slice(0, 4), 10);
  const m = parseInt(str.slice(4, 6), 10) - 1;
  const d = parseInt(str.slice(6, 8), 10);
  const date = new Date(y, m, d);
  return isNaN(date.getTime()) ? null : date;
}

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

function getShortsUrl(channelUrl) {
  const u = (channelUrl || '').trim();
  if (u.includes('/shorts')) return u;
  if (u.includes('/@')) return u.replace(/\/?$/, '/shorts');
  if (u.includes('/channel/')) return u.replace(/\/?$/, '/shorts');
  return u ? `${u}/shorts` : '';
}

export async function updateChannelShorts({ channelId, onProgress }) {
  if (channelId == null) {
    return { ok: false, error: 'channelId 필요' };
  }

  const report = (current, total) => onProgress && onProgress(current, total);

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const channel = db.channels.find((c) => c.id === channelId);
  if (!channel || !channel.url) {
    return { ok: false, error: '채널을 찾을 수 없습니다.' };
  }

  report(0, 1);
  const shortsUrl = getShortsUrl(channel.url);
  const innertube = await Innertube.create();
  const resolved = await innertube.resolveURL(shortsUrl);
  if (!resolved) {
    return { ok: false, error: '쇼츠 URL 조회 실패' };
  }

  const raw = await innertube.call(resolved, { parse: false });
  if (!raw?.data) {
    return { ok: false, error: '쇼츠 페이지 로드 실패' };
  }

  const allShorts = extractFromRaw(raw.data);
  const unique = [...new Map(allShorts.map((s) => [s.youtubeVideoId, s])).values()];
  const existingVideoIds = new Set(db.shorts.map((s) => s.youtubeVideoId));

  // 아직 등록되지 않은 영상만 대상 (cutoff 무시 - 모든 미등록 영상 추가)
  const toProcess = unique.filter((s) => !existingVideoIds.has(s.youtubeVideoId));

  report(0, toProcess.length + 1);

  const withDate = [];
  for (let i = 0; i < toProcess.length; i++) {
    const s = toProcess[i];
    try {
      const info = await innertube.getInfo(s.youtubeVideoId);
      const mf = info?.page?.[0]?.microformat;
      const uploadDateStr = mf?.upload_date ?? mf?.publish_date;
      const uploadDate = parseUploadDate(uploadDateStr);
      withDate.push({ ...s, uploadDate: uploadDate?.getTime() || 0, uploadDateStr });
      await sleep(400);
    } catch {
      withDate.push({ ...s, uploadDate: 0, uploadDateStr: null });
      await sleep(600);
    }
    report(i + 1, toProcess.length + 1);
  }

  withDate.sort((a, b) => b.uploadDate - a.uploadDate);

  let maxId = Math.max(0, ...db.shorts.map((s) => s.id || 0));
  const added = [];

  for (let i = 0; i < withDate.length; i++) {
    const s = withDate[i];
    if (existingVideoIds.has(s.youtubeVideoId)) {
      report(toProcess.length + 1 + i, toProcess.length + 1 + withDate.length);
      continue;
    }

    let description = '';
    try {
      const info = await innertube.getInfo(s.youtubeVideoId);
      const descObj = info?.secondary_info?.description;
      if (descObj?.runs?.length) {
        description = descObj.runs
          .map((r) => {
            const url = r?.endpoint?.payload?.url || r?.endpoint?.metadata?.url;
            if (url && typeof url === 'string') {
              try {
                const urlObj = new URL(url);
                const q = urlObj.searchParams.get('q');
                if (q) return decodeURIComponent(q);
                if (url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps')) return url;
              } catch {}
            }
            return r?.text || '';
          })
          .join('');
      }
      if (!description && descObj) {
        description = descObj?.toString?.() || descObj?.text || '';
      }
      if (!description && info?.basic_info?.short_description) {
        description = info.basic_info.short_description || '';
      }
    } catch {
      await sleep(800);
      report(toProcess.length + 1 + i, toProcess.length + 1 + withDate.length);
      continue;
    }

    const fullText = `${s.title || ''}\n${description}`;
    const commentTexts = await fetchCommentTexts(innertube, s.youtubeVideoId);
    await sleep(500);

    let locations = [];
    let loc = null;

    // 0. 구글맵 링크에서 좌표 추출 (설명/댓글, 단축 URL 포함)
    const allTextForMaps = [fullText, ...commentTexts].join('\n');
    const gmapsLocs = await extractGoogleMapsLocations(allTextForMaps);
    for (const g of gmapsLocs) {
      locations.push({
        lat: g.lat,
        lng: g.lng,
        placeName: g.placeName || `위치 (${g.lat.toFixed(4)}, ${g.lng.toFixed(4)})`,
        address: g.placeName || null,
        locationText: g.placeName || null,
      });
    }
    if (locations.length > 0) loc = locations[0];

    // 1. 투어 일정 형식
    const tourAddresses = extractAllAddressesFromTourSchedule(description || fullText);
    if (tourAddresses.length >= 2) {
      for (const addr of tourAddresses) {
        const g = await geocodeAddress(addr);
        await sleep(1100);
        if (g && g.lat != null) {
          locations.push({
            lat: g.lat,
            lng: g.lng,
            placeName: g.placeName || addr,
            address: g.address || addr,
            locationText: addr,
          });
        }
      }
      if (locations.length > 0) loc = locations[0];
    }

    // 2. 타임스탬프/번호 목록 형식
    if (locations.length === 0) {
      const multiLocs = extractMultipleLocations(description || fullText, fullText);
      if (multiLocs.length >= 2) {
        for (const { raw } of multiLocs) {
          const g = await geocodeAddress(raw);
          await sleep(1100);
          if (g && g.lat != null) {
            locations.push({
              lat: g.lat,
              lng: g.lng,
              placeName: g.placeName || raw,
              address: g.address || raw,
              locationText: raw,
            });
          }
        }
        if (locations.length > 0) loc = locations[0];
      } else if (multiLocs.length === 1 && multiLocs[0].raw) {
        loc = await geocodeAddress(multiLocs[0].raw);
        await sleep(1100);
      }
    }

    // 3. getBestAddressFromTexts
    if (!loc || loc.lat == null) {
      const extracted = getBestAddressFromTexts(fullText, commentTexts);
      if (extracted) {
        loc = await geocodeAddress(extracted);
        await sleep(1100);
      }
    }

    // 4. 키워드 추론
    if (!loc || loc.lat == null) {
      const inferred = inferPlaceFromKeywords(s.title || '', fullText);
      if (inferred) loc = inferred;
    }

    if (!loc || loc.lat == null || loc.lng == null) {
      await sleep(800);
      report(toProcess.length + 1 + i, toProcess.length + 1 + withDate.length);
      continue;
    }

    maxId++;
    existingVideoIds.add(s.youtubeVideoId);
    const locationText = getBestLocationTextFromTexts(fullText, commentTexts);
    const short = {
      id: maxId,
      title: s.title || '(제목 없음)',
      views: s.views || '조회수 확인 필요',
      growthRate: 0.8,
      color: channel.color,
      youtubeVideoId: s.youtubeVideoId,
      lat: loc.lat,
      lng: loc.lng,
      place: loc.place,
      placeName: loc.placeName,
      address: loc.address,
      locationText: locationText || null,
      channelId,
    };
    if (locations.length > 0) short.locations = locations;
    db.shorts.push(short);
    added.push(short);
    await sleep(1100);
    report(toProcess.length + 1 + i, toProcess.length + 1 + withDate.length);
  }

  channel.lastFetchedAt = new Date().toISOString();
  if (!channel.addedAt) channel.addedAt = channel.lastFetchedAt;
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  return {
    ok: true,
    channel: { id: channelId, name: channel.name },
    shortsAdded: added.length,
    shorts: added,
  };
}
