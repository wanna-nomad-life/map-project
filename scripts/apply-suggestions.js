/**
 * 확인된 위치 추천을 shorts.json에 적용
 *
 * 사용법:
 *   npm run suggest-locations     # 먼저 추천 생성
 *   # admin.html에서 확인 후 "적용 데이터 다운로드" 클릭
 *   npm run apply-suggestions -- ./location-approved.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

const argPath = process.argv[2];
if (!argPath) {
  console.log('사용법: npm run apply-suggestions -- <다운로드한 JSON 경로>');
  console.log('예: npm run apply-suggestions -- ./location-approved.json');
  process.exit(1);
}

const absPath = path.isAbsolute(argPath) ? argPath : path.resolve(process.cwd(), argPath);
if (!fs.existsSync(absPath)) {
  console.error('파일을 찾을 수 없습니다:', absPath);
  process.exit(1);
}

const approved = JSON.parse(fs.readFileSync(absPath, 'utf8'));
if (!Array.isArray(approved)) {
  console.error('JSON은 배열이어야 합니다.');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const byId = new Map(db.shorts.map((s) => [s.id, s]));
const byVid = new Map(db.shorts.map((s) => [s.youtubeVideoId, s]));

let updated = 0;
for (const item of approved) {
  const short = byId.get(item.id) || byVid.get(item.youtubeVideoId);
  if (!short) continue;
  if (item.lat != null && item.lng != null) {
    short.lat = item.lat;
    short.lng = item.lng;
    short.place = item.place ?? null;
    short.placeName = item.placeName ?? null;
    short.address = item.address ?? null;
    updated++;
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`${updated}개 쇼츠 위치 적용 완료`);
