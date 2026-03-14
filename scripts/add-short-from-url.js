/**
 * YouTube 쇼츠 URL에서 영상 추가 + 설명/댓글에서 주소 추출 → 지오코딩 → 지도 표시
 * node scripts/add-short-from-url.js "https://www.youtube.com/shorts/OWnLiuJU8Ks"
 */
import { Innertube } from 'youtubei.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getBestAddressFromTexts,
  getBestLocationTextFromTexts,
  geocodeAddress,
  inferPlaceFromKeywords,
  extractAllAddressesFromTourSchedule,
  extractMultipleLocations,
} from './lib/location-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

function extractVideoId(url) {
  const match = url.match(/(?:shorts\/|v=)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const url = process.argv[2] || 'https://www.youtube.com/shorts/OWnLiuJU8Ks';
  const videoId = extractVideoId(url);
  if (!videoId) {
    console.log('영상 ID 추출 실패:', url);
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  if (db.shorts.some((s) => s.youtubeVideoId === videoId)) {
    console.log('이미 존재하는 영상:', videoId);
    process.exit(0);
  }

  console.log('영상 정보 조회:', videoId, '\n');

  const innertube = await Innertube.create();
  const info = await innertube.getInfo(videoId);
  if (!info) {
    console.log('영상 조회 실패');
    process.exit(1);
  }

  const title = info?.basic_info?.title || info?.primary_info?.title?.toString?.() || '(제목 없음)';
  const views = info?.basic_info?.view_count?.toString?.() || info?.primary_info?.view_count?.toString?.() || '조회수 확인 필요';
  let description = '';
  const descObj = info?.secondary_info?.description;
  if (descObj) {
    description = descObj?.toString?.() || descObj?.text || (descObj?.runs ? descObj.runs.map((r) => r?.text || '').join('') : '');
  }
  if (!description && info?.basic_info?.short_description) {
    description = info.basic_info.short_description || '';
  }

  const fullText = `${title}\n${description}`;
  const commentTexts = await fetchCommentTexts(innertube, videoId);
  await sleep(500);

  const tourAddresses = extractAllAddressesFromTourSchedule(description || fullText);
  let locations = [];
  let loc = null;
  let extracted = null;

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
    if (locations.length > 0) {
      loc = locations[0];
      extracted = loc.locationText;
    }
  }

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
    if (!loc || loc.lat == null) {
      extracted = getBestAddressFromTexts(fullText, commentTexts);
      if (extracted) {
        loc = await geocodeAddress(extracted);
        await sleep(1100);
      }
    }
    if (!loc || loc.lat == null) {
      const inferred = inferPlaceFromKeywords(title, fullText);
      if (inferred) loc = inferred;
    }
    if (!loc || loc.lat == null) {
      console.log('주소 추출/지오코딩 실패. 기본 위치(서울)로 추가합니다.');
      loc = {
        lat: 37.5665,
        lng: 126.978,
        place: '서울',
        placeName: extracted || title,
        address: '서울특별시, 대한민국',
      };
    }
  }

  const locationText = getBestLocationTextFromTexts(fullText, commentTexts);

  const maxId = Math.max(...db.shorts.map((s) => s.id), 0);
  const chInfo = info?.basic_info?.channel;
  const channelUrl = chInfo?.url ? (chInfo.url.startsWith('http') ? chInfo.url : `https://www.youtube.com${chInfo.url}`) : null;
  const channelName = chInfo?.name || '알 수 없음';
  let channel = null;
  if (channelUrl) {
    try {
      const pathname = new URL(channelUrl).pathname.toLowerCase();
      channel = db.channels.find((c) => c.url && (c.url === channelUrl || c.url.toLowerCase().includes(pathname)));
    } catch {}
  }
  if (!channel) {
    channel = db.channels.find((c) => (c.name || '').toLowerCase() === (channelName || '').toLowerCase());
  }
  if (!channel) {
    const maxChId = Math.max(0, ...db.channels.map((c) => c.id || 0));
    const channelId = Math.max(maxChId + 1, 1000);
    const colors = ['#e53935', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4'];
    channel = {
      id: channelId,
      name: channelName,
      subs: '조회수 확인 필요',
      initial: (channelName || '?').charAt(0),
      color: colors[db.channels.length % colors.length],
      youtubeChannelId: chInfo?.id || `channel_${channelId}`,
      url: channelUrl || `https://www.youtube.com/channel/${chInfo?.id || channelId}`,
    };
    db.channels.push(channel);
  }
  const channelId = channel.id;
  const color = channel.color || '#4CAF50';

  const shortEntry = {
    id: maxId + 1,
    title,
    views,
    growthRate: 0.8,
    color,
    youtubeVideoId: videoId,
    lat: loc.lat,
    lng: loc.lng,
    place: loc.place,
    placeName: loc.placeName,
    address: loc.address,
    locationText: locationText || null,
    channelId,
  };
  if (locations.length > 0) {
    shortEntry.locations = locations;
  }
  db.shorts.push(shortEntry);

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`\n추가 완료: ${title}`);
  if (locations.length > 0) {
    console.log(`  위치 ${locations.length}곳: ${locations.map((l) => l.placeName).join(', ')}`);
  } else {
    console.log(`  위치: ${loc.placeName} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
