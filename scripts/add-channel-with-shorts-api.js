/**
 * 채널 추가 + 주소 있는 쇼츠만 수집 API
 * POST /api/add-channel-with-shorts
 */
import { Innertube } from 'youtubei.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getBestAddressFromTexts,
  getBestLocationTextFromTexts,
  geocodeAddress,
  isCompleteAddress,
  extractAllAddressesFromTourSchedule,
  extractMultipleLocations,
} from './lib/location-utils.js';
import { extractGoogleMapsLocations } from './lib/google-maps-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');
const USER_CHANNEL_ID_START = 1000;

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

/** URL에서 채널명 추출 (@handle, /c/name 등) */
export function extractNameFromUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const m = path.match(/\/@([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    const m2 = path.match(/\/c\/([a-zA-Z0-9_-]+)/);
    if (m2) return m2[1];
    return null;
  } catch {
    return null;
  }
}

export async function addChannelWithShorts({ name, url, onProgress }) {
  if (!url) return { ok: false, error: 'url 필요' };
  const resolvedName = (name || '').trim() || extractNameFromUrl(url) || 'Unknown Channel';

  const report = (current, total) => onProgress && onProgress(current, total);

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const existingVideoIds = new Set(db.shorts.map((s) => s.youtubeVideoId));

  let channel = db.channels.find((c) => c.url?.toLowerCase().includes(new URL(url).pathname.toLowerCase()) || c.name?.toLowerCase() === resolvedName?.toLowerCase());
  let channelId;
  let isNewChannel = false;

  if (channel) {
    channelId = channel.id;
    if (!channel.addedAt) channel.addedAt = new Date().toISOString();
  } else {
    isNewChannel = true;
    const maxChannelId = Math.max(0, ...db.channels.map((c) => c.id || 0));
    channelId = Math.max(maxChannelId + 1, USER_CHANNEL_ID_START);
    const initial = (resolvedName || '?').charAt(0);
    const colors = ['#e53935', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4'];
    const color = colors[db.channels.length % colors.length];
    channel = {
      id: channelId,
      name: resolvedName,
      subs: '조회수 확인 필요',
      initial,
      color,
      youtubeChannelId: `channel_${channelId}`,
      url,
      addedAt: new Date().toISOString(),
    };
    db.channels.push(channel);
  }

  report(0, 1);
  const shortsUrl = getShortsUrl(url);
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
  const total = unique.length;
  report(0, total);

  let maxId = Math.max(0, ...db.shorts.map((s) => s.id || 0));
  const added = [];

  for (let i = 0; i < unique.length; i++) {
    const s = unique[i];
    if (existingVideoIds.has(s.youtubeVideoId)) {
      report(i + 1, total);
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
      report(i + 1, total);
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

    // 1. 투어 일정 형식 (DD Month - Venue, City, State, Country) - 완전한 주소만
    const tourAddresses = extractAllAddressesFromTourSchedule(description || fullText).filter(isCompleteAddress);
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

    // 2. 타임스탬프/번호 목록 형식 (0:00 Place - Address, 1. Place (주소)) - 완전한 주소만
    if (locations.length === 0) {
      const multiLocs = extractMultipleLocations(description || fullText, fullText).filter((m) => m.raw && isCompleteAddress(m.raw));
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

    // 3. getBestAddressFromTexts (위치:, Location: 등 - 완전한 주소만)
    if (!loc || loc.lat == null) {
      const extracted = getBestAddressFromTexts(fullText, commentTexts);
      if (extracted) {
        loc = await geocodeAddress(extracted);
        await sleep(1100);
      }
    }

    // 완전한 주소가 있는 쇼츠만 추가 (키워드 추론 제외)
    if (!loc || loc.lat == null || loc.lng == null) {
      await sleep(800);
      report(i + 1, total);
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
    report(i + 1, total);
  }

  report(total, total);

  if (added.length === 0 && isNewChannel) {
    db.channels.pop();
    return { ok: false, error: '주소가 있는 영상이 없습니다. 채널이 등록되지 않았습니다.' };
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  return {
    ok: true,
    channel: { id: channelId, name: resolvedName, url },
    shortsAdded: added.length,
    shorts: added,
  };
}
