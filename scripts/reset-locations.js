/**
 * 검증된 3개 쇼츠만 위치 유지, 나머지는 null로 초기화
 * (AI는 영상 시청 불가 - 사용자가 직접 확인 후 add-shorts로 추가)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

const VERIFIED_IDS = new Set([1, 2, 3]); // 더들리님, 오감, Mandalay Bay

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

for (const short of db.shorts) {
  if (!VERIFIED_IDS.has(short.id)) {
    short.lat = null;
    short.lng = null;
    short.place = null;
    short.placeName = null;
    short.address = null;
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('위치 초기화 완료. 검증된 3개만 유지, 나머지 47개는 null');
