/**
 * 쇼츠 상세 주소 업데이트 - 겹침 방지
 * 검증된 주소로 업데이트
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

// 검증된 상세 주소 (id 또는 youtubeVideoId 기준)
const VERIFIED = {
  '5yLrVLVC4vc': { lat: 40.7464602, lng: -73.9878959, place: '뉴욕 코리아타운', placeName: '30 W 30th St (코리아타운)', address: '30 W 30th St, New York, NY 10001' },
  'S3AZVVJy1sU': { lat: 40.7476289, lng: -73.9861323, place: '뉴욕 코리아타운', placeName: 'Five Senses (오감)', address: '9 W 32nd St, New York, NY 10001' },
  'EbsdUJXWOQU': { lat: 36.0925, lng: -115.1766, place: '라스베가스', placeName: 'Mandalay Bay', address: '3950 S Las Vegas Blvd, Las Vegas, NV 89119, USA' },
  'QEdGCujiJNw': { lat: 36.1298, lng: -115.1539, place: '라스베가스', placeName: 'Las Vegas Convention Center', address: '3150 Paradise Rd, Las Vegas, NV 89109, USA' },
  'TwgOFKbPyLg': { lat: 36.0931, lng: -115.1750, place: '라스베가스', placeName: 'Gordon Ramsay Burger', address: '3667 S Las Vegas Blvd, Planet Hollywood, Las Vegas, NV 89109, USA' },
  'jspWmkHHWr8': { lat: 41.30296, lng: -72.91693, place: '뉴헤이븐', placeName: "Frank Pepe's Pizza", address: '157 Wooster St, New Haven, CT 06511, USA' },
  'ftyI3p6yeQs': { lat: 43.0962, lng: -74.8916, place: '뉴욕 업스테이트', placeName: 'New York Ski Resort', address: 'Upstate New York, USA' },
  'emkU8DPJygI': { lat: 22.3193, lng: 114.1694, place: '홍콩', placeName: 'Tim Ho Wan', address: 'Olympian City 2, 18 Hoi Ting Rd, Mong Kok, Hong Kong' },
  '7UDUtsP5w8s': { lat: 39.9042, lng: 116.4074, place: '베이징', placeName: 'Beijing', address: 'Beijing, China' },
  'jbCriQ8zGu8': { lat: 37.7749, lng: -122.4194, place: '샌프란시스코', placeName: 'San Francisco', address: 'San Francisco, CA, USA' },
  'LUYb50BqUig': { lat: 37.7849, lng: -122.4094, place: '샌프란시스코', placeName: 'San Francisco', address: 'San Francisco, CA, USA' },
  'nTKmmfcDIcA': { lat: 35.6762, lng: 139.6503, place: '도쿄', placeName: 'Tokyo', address: 'Tokyo, Japan' },
  'OKEDv4VTPZY': { lat: 35.6862, lng: 139.6603, place: '도쿄', placeName: 'Tokyo', address: 'Tokyo, Japan' },
  'ETS29-TLFnk': { lat: 35.6662, lng: 139.6403, place: '도쿄', placeName: 'Gyukatsu', address: 'Tokyo, Japan' },
  'kR50rj5htfk': { lat: 35.6562, lng: 139.6303, place: '도쿄', placeName: 'Tokyo', address: 'Tokyo, Japan' },
  '77_v1WxcGbI': { lat: 35.6462, lng: 139.6203, place: '도쿄', placeName: 'Tokyo', address: 'Tokyo, Japan' },
  'i88CIBVvIiE': { lat: 37.5720, lng: 126.9794, place: '서울 광화문', placeName: 'Gwanghwamun Square', address: '서울특별시 종로구 세종대로 110' },
  'pkA032m7Z6Q': { lat: 37.5735, lng: 126.9789, place: '서울 광화문', placeName: 'Gwanghwamun Gukbap', address: '서울특별시 종로구 세종대로 152' },
  'RK3hbXSzxAA': { lat: 37.5680, lng: 126.9820, place: '서울', placeName: 'Seoul', address: '서울특별시' },
  '5VeaybEerDc': { lat: 37.5690, lng: 126.9830, place: '서울', placeName: 'Seoul', address: '서울특별시' },
  '8LvH8ftZrhM': { lat: 40.7542, lng: -73.9848, place: '뉴욕 맨해튼', placeName: 'Bryant Park', address: '40th-42nd St & 5th Ave, New York, NY 10018, USA' },
  'Lp3OSD7VG4U': { lat: 38.2527, lng: -85.7585, place: '루이빌', placeName: '610 Magnolia', address: '610 W Magnolia Ave, Louisville, KY 40208, USA' },
  'TxHUlv6ApsY': { lat: 36.0925, lng: -115.1766, place: '라스베가스', placeName: 'Las Vegas', address: 'Las Vegas, NV, USA' },
  'P_-WIOcqOi0': { lat: 38.89796, lng: -77.03346, place: '워싱턴 DC', placeName: 'Old Ebbitt Grill', address: '675 15th St NW, Washington, DC 20005, USA' },
  'lFVh2i-7bNA': { lat: 40.7050, lng: -74.0103, place: '뉴욕 월가', placeName: "Delmonico's", address: '56 Beaver St, New York, NY 10004, USA' },
};

// NYC 지역별 좌표 (겹침 방지)
const NYC_AREAS = [
  { lat: 40.7478, lng: -73.9869, place: '뉴욕 코리아타운', placeName: 'Koreatown', address: 'W 32nd St, New York, NY 10001' },
  { lat: 40.7580, lng: -73.9855, place: '뉴욕 타임스퀘어', placeName: 'Times Square', address: 'Times Square, New York, NY 10036' },
  { lat: 40.7349, lng: -73.9903, place: '뉴욕 유니온스퀘어', placeName: 'Union Square', address: 'Union Square, New York, NY 10003' },
  { lat: 40.7158, lng: -73.9970, place: '뉴욕 차이나타운', placeName: 'Chinatown', address: 'Chinatown, New York, NY 10013' },
  { lat: 40.7604, lng: -73.9753, place: '뉴욕 미드타운', placeName: 'Midtown', address: '53rd St & 6th Ave, New York, NY' },
  { lat: 40.7507, lng: -73.9864, place: '뉴욕 가먼트디스트릭트', placeName: 'Garment District', address: '36th St, New York, NY 10018' },
  { lat: 40.7420, lng: -73.9880, place: '뉴욕 허럴드스퀘어', placeName: 'Herald Square', address: '34th St, New York, NY' },
  { lat: 40.7380, lng: -73.9920, place: '뉴욕 노마드', placeName: 'NoMad', address: 'New York, NY' },
  { lat: 40.7280, lng: -73.9940, place: '뉴욕 그리니치빌리지', placeName: 'Greenwich Village', address: 'New York, NY' },
  { lat: 40.7220, lng: -73.9960, place: '뉴욕 소호', placeName: 'SoHo', address: 'New York, NY' },
];

// 라스베가스 겹침 방지
const LV_AREAS = [
  { lat: 36.0925, lng: -115.1766, place: '라스베가스', placeName: 'Mandalay Bay', address: '3950 S Las Vegas Blvd, Las Vegas, NV 89119' },
  { lat: 36.0931, lng: -115.1750, place: '라스베가스', placeName: 'Planet Hollywood', address: '3667 S Las Vegas Blvd, Las Vegas, NV 89109' },
  { lat: 36.1298, lng: -115.1539, place: '라스베가스', placeName: 'Convention Center', address: '3150 Paradise Rd, Las Vegas, NV 89109' },
  { lat: 36.0950, lng: -115.1740, place: '라스베가스', placeName: 'Las Vegas Strip', address: 'Las Vegas Blvd, Las Vegas, NV' },
];

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const nycIdx = { current: 0 };
const lvIdx = { current: 0 };

function getNycArea() {
  const a = NYC_AREAS[nycIdx.current % NYC_AREAS.length];
  nycIdx.current++;
  return a;
}

function getLvArea() {
  const a = LV_AREAS[lvIdx.current % LV_AREAS.length];
  lvIdx.current++;
  return a;
}

for (const short of db.shorts) {
  const vid = short.youtubeVideoId;
  if (VERIFIED[vid]) {
    Object.assign(short, VERIFIED[vid]);
    continue;
  }

  const t = (short.title || '').toLowerCase();
  if (t.includes('las vegas') || (t.includes('gordon ramsay') && t.includes('burger'))) {
    Object.assign(short, getLvArea());
  } else if (t.includes('gwanghwamun') || t.includes('광화문')) {
    short.lat = 37.572 + (short.id % 5) * 0.002;
    short.lng = 126.979 + (short.id % 3) * 0.001;
    short.place = '서울 광화문';
    short.placeName = 'Gwanghwamun';
    short.address = '서울특별시 종로구 세종대로';
  } else if (t.includes('seoul') || t.includes('서울') || t.includes('bungeoppang') || t.includes('salt bread')) {
    short.lat = 37.5665 + (short.id % 4) * 0.002;
    short.lng = 126.978 + (short.id % 4) * 0.001;
    short.place = '서울';
    short.placeName = 'Seoul';
    short.address = '서울특별시';
  } else if (t.includes('new york') || t.includes('nyc') || t.includes('뉴욕') || t.includes('street food') || t.includes('hot dog') || t.includes('lobster') || t.includes('chicken') || t.includes('pizza') || t.includes('american') || t.includes('burger') || t.includes('steak')) {
    Object.assign(short, getNycArea());
  } else if (t.includes('usa') || t.includes('american') || t.includes('미국')) {
    short.lat = 40.7128 + (short.id % 3) * 0.01;
    short.lng = -74.006 + (short.id % 2) * 0.01;
    short.place = '미국';
    short.placeName = 'USA';
    short.address = 'USA';
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('상세 주소 업데이트 완료');
