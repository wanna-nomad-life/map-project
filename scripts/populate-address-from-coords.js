/**
 * 좌표는 있지만 address가 비어 있는 쇼츠에 역지오코딩으로 주소 채움
 * YouTube API 호출 없이 Nominatim만 사용 (빠름)
 *
 * 실행: npm run populate-address-from-coords
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { reverseGeocode } from './lib/location-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('좌표 → 주소 역지오코딩 (address 비어있는 쇼츠)\n');

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const needsAddress = db.shorts.filter(
    (s) => s.lat != null && s.lng != null && (!s.address || s.address.trim() === '')
  );

  if (needsAddress.length === 0) {
    console.log('처리할 쇼츠가 없습니다.');
    return;
  }

  console.log(`address 채울 쇼츠: ${needsAddress.length}개\n`);
  let updated = 0;

  for (const short of needsAddress) {
    const rev = await reverseGeocode(short.lat, short.lng);
    if (rev) {
      short.address = rev.address;
      short.place = short.place || rev.place;
      updated++;
      console.log(`  [${short.id}] ${short.title?.slice(0, 45)}... → ${rev.place}`);
    }
    await sleep(1100);
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`\n완료! ${updated}개 쇼츠에 address 적용`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
