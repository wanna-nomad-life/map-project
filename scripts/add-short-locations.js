/**
 * 쇼츠 제목 기반 장소 정보 추가
 * 실행: node scripts/add-short-locations.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

// 순서 중요: 구체적 키워드 먼저
const PLACES = [
  { keywords: ['las vegas', 'jensen huang'], lat: 36.0925, lng: -115.1766, place: '라스베가스', placeName: 'Las Vegas', address: 'Las Vegas, NV, USA' },
  { keywords: ['gordon ramsay', 'burger'], lat: 36.0925, lng: -115.1766, place: '라스베가스', placeName: 'Gordon Ramsay Burger', address: 'Planet Hollywood, Las Vegas, NV, USA' },
  { keywords: ['room service', 'world\'s best hotel'], lat: 36.0925, lng: -115.1766, place: '라스베가스', placeName: 'Las Vegas', address: 'Las Vegas, NV, USA' },
  { keywords: ['gwanghwamun', '광화문'], lat: 37.5720, lng: 126.9794, place: '서울 광화문', placeName: 'Gwanghwamun', address: '서울특별시 종로구 세종대로' },
  { keywords: ['bryant park'], lat: 40.7542, lng: -73.9848, place: '뉴욕 맨해튼', placeName: 'Bryant Park', address: '40th-42nd St, New York, NY 10018' },
  { keywords: ['white house'], lat: 38.8977, lng: -77.0365, place: '워싱턴 DC', placeName: 'Washington DC', address: 'Washington, DC, USA' },
  { keywords: ['bungeoppang', '붕어빵'], lat: 37.5665, lng: 126.9780, place: '서울', placeName: 'Seoul', address: '서울특별시' },
  { keywords: ['salt bread', '소금빵'], lat: 37.5665, lng: 126.9780, place: '서울', placeName: 'Seoul', address: '서울특별시' },
  { keywords: ['seoul', '서울'], lat: 37.5665, lng: 126.9780, place: '서울', placeName: 'Seoul', address: '서울특별시' },
  { keywords: ['gyukatsu'], lat: 35.6762, lng: 139.6503, place: '도쿄', placeName: 'Tokyo', address: 'Tokyo, Japan' },
  { keywords: ['japan', '일본', 'noodles'], lat: 35.6762, lng: 139.6503, place: '도쿄', placeName: 'Tokyo', address: 'Tokyo, Japan' },
  { keywords: ['china', 'china'], lat: 39.9042, lng: 116.4074, place: '베이징', placeName: 'Beijing', address: 'Beijing, China' },
  { keywords: ['tesla', 'self-driving'], lat: 37.7749, lng: -122.4194, place: '샌프란시스코', placeName: 'San Francisco', address: 'San Francisco, CA, USA' },
  { keywords: ['ski resort'], lat: 43.0962, lng: -74.8916, place: '뉴욕 업스테이트', placeName: 'New York Ski Resort', address: 'Upstate New York, USA' },
  { keywords: ['edward lee'], lat: 38.2527, lng: -85.7585, place: '루이빌', placeName: 'Louisville', address: 'Louisville, KY, USA' },
  { keywords: ['financial'], lat: 40.7589, lng: -73.9851, place: '뉴욕 월스트리트', placeName: 'Wall Street', address: 'New York, NY, USA' },
  { keywords: ['lobster', 'new york'], lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' },
  { keywords: ['street food', 'hot dog'], lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' },
  { keywords: ['new york', 'nyc', '뉴욕'], lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' },
  { keywords: ['pizza'], lat: 41.0034, lng: -73.9619, place: '뉴헤이븐', placeName: 'New Haven', address: 'New Haven, CT, USA' },
  { keywords: ['american', 'steak', 'chicken', 'farm', 'train', 'ktx', 'saemaeul'], lat: 40.7128, lng: -74.0060, place: '미국', placeName: 'USA', address: 'USA' },
];

const DEFAULT_PLACE = { lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' };

function inferPlace(title) {
  const t = (title || '').toLowerCase();
  for (const p of PLACES) {
    if (p.keywords.some((k) => t.includes(k))) return p;
  }
  return DEFAULT_PLACE;
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
let updated = 0;

for (const short of db.shorts) {
  if (short.lat != null && short.lng != null) continue;
  const loc = inferPlace(short.title);
  short.lat = loc.lat;
  short.lng = loc.lng;
  short.place = loc.place;
  short.placeName = loc.placeName;
  short.address = loc.address;
  updated++;
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`${updated}개 쇼츠에 장소 정보 추가 완료`);
