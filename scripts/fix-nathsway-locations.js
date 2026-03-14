/**
 * nathsway 채널 쇼츠 위치 재추출 - 설명/제목에서 장소 다시 찾기
 * node scripts/fix-nathsway-locations.js
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');
const CHANNEL_ID = 1005; // nathsway

// 잘못된 지오코딩 수동 수정 (영상 ID -> 올바른 위치)
const MANUAL_FIX = {
  cWf8QYkuUPM: { lat: -35.0927056, lng: 117.9965535, place: 'Bald Head Trail', placeName: 'Bald Head Trail, Albany WA', address: 'Bald Head Trail, Albany, Western Australia' },
  lgUj_jG8WZc: { lat: -18.5975, lng: 145.8039, place: 'Wallaman Falls', placeName: 'Wallaman Falls', address: 'Wallaman Falls, Queensland, Australia' },
  A_cAbFmB9AI: { lat: -17.5667, lng: 145.8833, place: 'Paronella Park', placeName: 'Paronella Park', address: 'Paronella Park, Queensland, Australia' },
  lqbA2QrZF04: { lat: -38.080481, lng: 147.4887535, place: 'Gippsland Lakes', placeName: 'East Gippsland', address: 'Gippsland Lakes Coastal Park, Victoria, Australia' },
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchCommentTexts(innertube, videoId) {
  try {
    const comments = await innertube.getComments(videoId);
    const texts = [];
    for (const th of (comments?.contents || []).slice(0, 15)) {
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
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const shorts = db.shorts.filter((s) => s.channelId === CHANNEL_ID);
  console.log(`nathsway 채널 쇼츠 ${shorts.length}개 위치 재추출\n`);

  const innertube = await Innertube.create();
  let updated = 0;

  for (let i = 0; i < shorts.length; i++) {
    const short = shorts[i];
    const manual = MANUAL_FIX[short.youtubeVideoId];
    if (manual) {
      Object.assign(short, manual);
      short.locationText = short.placeName;
      updated++;
      console.log(`  [${i + 1}/${shorts.length}] ${short.title?.slice(0, 42)}... → (수동) ${manual.placeName}`);
      continue;
    }
    let description = '';
    try {
      const info = await innertube.getInfo(short.youtubeVideoId);
      if (info?.secondary_info?.description) {
        description = info.secondary_info.description?.toString?.() || info.secondary_info.description?.text || '';
      }
      if (!description && info?.basic_info?.short_description) {
        description = info.basic_info.short_description || '';
      }
    } catch (e) {
      console.log(`  [${i + 1}/${shorts.length}] ${short.title?.slice(0, 45)}... 조회 실패`);
      await sleep(800);
      continue;
    }

    const fullText = `${short.title || ''}\n${description}`;
    const commentTexts = await fetchCommentTexts(innertube, short.youtubeVideoId);
    await sleep(500);

    let locations = [];
    let loc = null;

    // 1. 투어 일정
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

    // 2. 타임스탬프/해시태그/Place in Country (fullText로 해시태그 포함)
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

    // 4. 키워드 추론 (제목 해시태그 등)
    if (!loc || loc.lat == null) {
      const inferred = inferPlaceFromKeywords(short.title || '', fullText);
      if (inferred) loc = inferred;
    }

    if (loc && loc.lat != null && loc.lng != null) {
      const prevAddr = short.address || '';
      const newAddr = loc.address || '';
      if (prevAddr !== newAddr || short.lat !== loc.lat) {
        short.lat = loc.lat;
        short.lng = loc.lng;
        short.place = loc.place;
        short.placeName = loc.placeName;
        short.address = loc.address;
        short.locationText = getBestLocationTextFromTexts(fullText, commentTexts) || loc.locationText || loc.placeName;
        if (locations.length > 0) short.locations = locations;
        else delete short.locations;
        updated++;
        console.log(`  [${i + 1}/${shorts.length}] ${short.title?.slice(0, 42)}... → ${loc.placeName}`);
      }
    }
    await sleep(800);
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`\n완료: ${updated}개 쇼츠 위치 업데이트됨`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
