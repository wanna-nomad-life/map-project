/**
 * 한국 주소 수정 - 알밤yammkki 등 채널의 부정확한 주소를 상세 주소로 교정
 *
 * 실행: npm run fix-korean-addresses
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geocodeAddress } from './lib/location-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

// youtubeVideoId → { address, locationText, placeName?, lat?, lng? }
const KR_ADDRESS_FIXES = {
  '3u-dBB4eT0M': {
    address: '서울특별시 송파구 올림픽로 265 지하1층 216-128호',
    locationText: '서울 송파구 올림픽로 265 지하1층 216-128호 (잠실역 1번 출구에서 153m)',
    placeName: '디트로이트 1달러 피자',
    place: '잠실',
    lat: 37.5132169,
    lng: 127.1001365,
  },
  'OWnLiuJU8Ks': {
    address: '서울특별시 종로구 필운대로 46 4층',
    locationText: '서울 종로구 필운대로 46 4층',
    placeName: '대충유원지',
    place: '서촌',
    lat: 37.5778,
    lng: 126.9666,
  },
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('한국 주소 수정\n');

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  let updated = 0;

  for (const short of db.shorts) {
    const fix = KR_ADDRESS_FIXES[short.youtubeVideoId];
    if (!fix) continue;

    if (fix.lat != null && fix.lng != null) {
      short.lat = fix.lat;
      short.lng = fix.lng;
    } else if (fix.address) {
      const loc = await geocodeAddress(fix.address);
      if (loc) {
        short.lat = loc.lat;
        short.lng = loc.lng;
        short.place = short.place || loc.place;
        short.address = fix.address;
      }
      await sleep(1100);
    }

    if (fix.address) short.address = fix.address;
    if (fix.locationText) short.locationText = fix.locationText;
    if (fix.placeName) short.placeName = fix.placeName;
    if (fix.place) short.place = fix.place;

    updated++;
    console.log(`  [${short.id}] ${short.title?.slice(0, 40)}... → ${fix.placeName || fix.address?.slice(0, 30)}`);
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`\n완료! ${updated}개 쇼츠 주소 수정`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
