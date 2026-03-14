/**
 * 설명의 모든 상세 주소를 적용
 * 모든 쇼츠의 설명을 가져와 주소 추출 → 지오코딩 → 적용
 *
 * 실행: npm run update-detailed-locations
 */
import { Innertube } from 'youtubei.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBestAddressFromTexts, getBestLocationTextFromTexts, geocodeAddress, reverseGeocode, inferPlaceFromKeywords, isValidLocationText } from './lib/location-utils.js';
import { extractGoogleMapsLocations } from './lib/google-maps-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

function extractCityFromTitle(title) {
  if (!title) return null;
  const m = title.match(/in\s+([A-Za-z\s]+?)(?:\s*$|\.|,)/i)
    || title.match(/(Seoul|서울|Tokyo|도쿄|Bangkok|Osaka|Kyoto|Fukuoka|Yokohama|Suwon|수원|Thailand)/i);
  if (m) return (m[1] || m[0]).trim();
  const cities = ['Seoul', 'Tokyo', 'Bangkok', 'Osaka', 'Kyoto', 'Fukuoka', 'Yokohama', 'Suwon', 'Thailand'];
  for (const c of cities) {
    if (title.toLowerCase().includes(c.toLowerCase())) return c;
  }
  return null;
}

// 잘못된 지오코딩 수정 (제목과 맞지 않는 위치)
const WRONG_GEOCODE_FIX = {
  'TmN32X7O_-I': { lat: 13.7563, lng: 100.5018, place: '방콕', placeName: 'Bangkok Michelin Ramen', address: 'Bangkok, Thailand' },
  'vbUezHDWtbI': { lat: 35.6762, lng: 139.6503, place: '도쿄', placeName: 'Tokyo', address: 'Tokyo, Japan' },
  '7UDUtsP5w8s': { lat: 40.7158, lng: -73.9970, place: '뉴욕 차이나타운', placeName: 'Chinatown', address: 'Chinatown, New York, NY, USA' },
  'LUYb50BqUig': { lat: 37.7749, lng: -122.4194, place: '샌프란시스코', placeName: 'San Francisco', address: 'San Francisco, CA, USA' },
  'pkA032m7Z6Q': { lat: 37.5735, lng: 126.9789, place: '서울 광화문', placeName: 'Gwanghwamun Gukbap', address: '서울특별시 종로구 세종대로 152' },
  'hZHDKeW65Fg': { lat: 40.7128, lng: -74.006, place: '미국', placeName: 'USA', address: 'USA' },
  'RFZuXQRVFo0': { lat: 37.5665, lng: 126.978, place: '한국', placeName: 'Korea', address: 'Korea' },
  '7Zk_8Z9uH2Y': { lat: 40.7128, lng: -74.006, place: '미국', placeName: 'USA', address: 'USA' },
  'osPB0c5o1gw': { lat: 37.6542, lng: 126.8387, place: '고양시 덕양구', placeName: '와우치킨', address: '경기도 고양시 덕양구 성사동 507번지 1층 와우치킨' },
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 댓글 텍스트 배열 반환 (최대 30개, 최상위 댓글만) */
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
  console.log('설명의 모든 상세 주소 적용\n');

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  // 1. 잘못된 지오코딩 수정
  for (const short of db.shorts) {
    const fix = WRONG_GEOCODE_FIX[short.youtubeVideoId];
    if (fix) Object.assign(short, fix);
  }

  const innertube = await Innertube.create();
  let updated = 0;
  const total = db.shorts.length;

  for (let i = 0; i < total; i++) {
    const short = db.shorts[i];
    let description = '';

    try {
      const info = await innertube.getInfo(short.youtubeVideoId);
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
    } catch (e) {
      // getInfo 실패해도 제목 기반 키워드 추론 시도
      const inferred = inferPlaceFromKeywords(short.title, '');
      if (inferred && !short.lat) {
        short.lat = inferred.lat;
        short.lng = inferred.lng;
        short.place = inferred.place;
        short.placeName = inferred.placeName;
        short.address = inferred.address;
        updated++;
        console.log(`  [${i + 1}/${total}] ${short.title?.slice(0, 42)}... → (키워드) ${inferred.placeName}`);
      }
      await sleep(800);
      continue;
    }

    const hasLocation = short.lat != null && short.lng != null;
    const hasAddress = short.address && short.address.trim().length > 0;

    // 1) 좌표는 있는데 address 없음 → 역지오코딩으로 채움 (댓글 불필요)
    if (hasLocation && !hasAddress) {
      const rev = await reverseGeocode(short.lat, short.lng);
      if (rev) {
        short.address = rev.address;
        short.place = short.place || rev.place;
        updated++;
        console.log(`  [${i + 1}/${total}] ${short.title?.slice(0, 42)}... → (역지오코딩) ${rev.place}`);
      }
      await sleep(1100);
      continue;
    }

    const fullText = `${short.title || ''}\n${description}`;
    const commentTexts = await fetchCommentTexts(innertube, short.youtubeVideoId);
    await sleep(500);

    // 0) 구글맵 링크에서 좌표 추출 → locations에 추가 (단축 URL 포함)
    const allTextForMaps = [fullText, ...commentTexts].join('\n');
    const gmapsLocs = await extractGoogleMapsLocations(allTextForMaps);
    if (gmapsLocs.length > 0) {
      const existingLocs = short.locations && Array.isArray(short.locations) ? short.locations : [];
      const seen = new Set(existingLocs.map((l) => `${l.lat?.toFixed(4)},${l.lng?.toFixed(4)}`));
      for (const g of gmapsLocs) {
        const key = `${g.lat.toFixed(4)},${g.lng.toFixed(4)}`;
        if (!seen.has(key)) {
          seen.add(key);
          existingLocs.push({
            lat: g.lat,
            lng: g.lng,
            placeName: g.placeName || `위치 (${g.lat.toFixed(4)}, ${g.lng.toFixed(4)})`,
            address: g.placeName || null,
            locationText: g.placeName || null,
          });
        }
      }
      if (existingLocs.length > 0) {
        short.locations = existingLocs;
        if (!short.lat && existingLocs[0]) {
          short.lat = existingLocs[0].lat;
          short.lng = existingLocs[0].lng;
          short.placeName = short.placeName || existingLocs[0].placeName;
          short.place = short.place || existingLocs[0].placeName;
          short.address = short.address || existingLocs[0].placeName;
        }
        updated++;
        console.log(`  [${i + 1}/${total}] ${short.title?.slice(0, 42)}... → (구글맵) ${gmapsLocs.length}개 위치 추가`);
      }
    }

    // 1-2) 좌표·주소는 있는데 locationText 없거나 잘못됨 → 설명+댓글에서 추출
    const hasLocationText = short.locationText && short.locationText.trim().length > 0 && isValidLocationText(short.locationText);
    if (hasLocation && hasAddress && !hasLocationText) {
      const locText = getBestLocationTextFromTexts(fullText, commentTexts);
      if (locText) {
        short.locationText = locText;
        updated++;
        console.log(`  [${i + 1}/${total}] ${short.title?.slice(0, 42)}... → (locationText) ${locText.slice(0, 40)}...`);
      } else if (short.locationText && !isValidLocationText(short.locationText)) {
        short.locationText = null;
        updated++;
        console.log(`  [${i + 1}/${total}] ${short.title?.slice(0, 42)}... → (잘못된 locationText 제거)`);
      }
      await sleep(800);
      continue;
    }

    // 2) 설명+댓글에서 주소 추출 → 지오코딩
    let extracted = getBestAddressFromTexts(fullText, commentTexts);

    // 3) 추출 실패 시 제목+설명 키워드로 추론
    if (!extracted) {
      const inferred = inferPlaceFromKeywords(short.title, fullText);
      if (inferred && !hasLocation) {
        short.lat = inferred.lat;
        short.lng = inferred.lng;
        short.place = inferred.place;
        short.placeName = inferred.placeName;
        short.address = inferred.address;
        const locationText = getBestLocationTextFromTexts(fullText, commentTexts);
        short.locationText = locationText || short.locationText;
        updated++;
        console.log(`  [${i + 1}/${total}] ${short.title?.slice(0, 42)}... → (키워드) ${inferred.placeName}`);
      }
      await sleep(800);
      continue;
    }

    const city = extractCityFromTitle(short.title);
    const query = city && !extracted.toLowerCase().includes(city.toLowerCase())
      ? `${extracted}, ${city}`
      : extracted;

    const loc = await geocodeAddress(query);
    if (!loc || loc.lat == null || loc.lng == null) {
      await sleep(1100);
      continue;
    }

    // 적용: 위치 없음이거나, 추출한 주소가 기존보다 더 상세한 경우
    const isMoreDetailed = !hasLocation || (extracted.length > (short.address?.length || 0)) || extracted.includes('Chome') || extracted.includes('丁目') || extracted.includes('区') || extracted.includes('City');
    if (!isMoreDetailed && hasLocation) {
      await sleep(800);
      continue;
    }

    short.lat = loc.lat;
    short.lng = loc.lng;
    short.place = loc.place;
    short.placeName = loc.placeName || short.placeName;
    short.address = loc.address || short.address;
    const locationText = getBestLocationTextFromTexts(fullText, commentTexts);
    short.locationText = locationText || short.locationText;
    updated++;
    console.log(`  [${i + 1}/${total}] ${short.title?.slice(0, 42)}... → ${loc.placeName || extracted.slice(0, 30)}`);
    await sleep(1100);
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`\n완료! ${updated}개 쇼츠에 상세 주소 적용`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
