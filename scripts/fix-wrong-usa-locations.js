/**
 * 잘못된 USA(뉴욕) 좌표를 locationText 주소로 지오코딩하여 수정
 * 실행: node scripts/fix-wrong-usa-locations.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geocodeAddress } from './lib/location-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

const USA_LAT = 40.7128;
const USA_LNG = -74.006;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const wrong = db.shorts.filter(
    (s) => Math.abs(s.lat - USA_LAT) < 0.01 && Math.abs(s.lng - USA_LNG) < 0.01
  );

  console.log(`뉴욕(USA)으로 잘못 표시된 영상: ${wrong.length}개\n`);

  let fixed = 0;
  for (const short of wrong) {
    let addr = short.locationText;
    if (!addr || typeof addr !== 'string') {
      const cityFromTitle = inferCityFromTitle(short.title);
      if (cityFromTitle) addr = cityFromTitle;
    }
    if (addr && addr.startsWith('http')) continue;

    // locationText 없음: 한국 채널(가보자곰 등)은 서울로 기본 설정
    if (!addr || typeof addr !== 'string' || !addr.trim()) {
      short.lat = 37.5665;
      short.lng = 126.978;
      short.place = '서울';
      short.placeName = '서울, 대한민국';
      short.address = '위치 정보 없음 (서울)';
      fixed++;
      console.log(`✓ ${short.youtubeVideoId} ${short.title?.slice(0, 40)}... → 서울 (기본)`);
      continue;
    }

    let loc = await geocodeAddress(addr.trim());
    // 한국 주소 지오코딩 실패 시 "대한민국" 추가하여 재시도
    if (!loc && /[가-힣]/.test(addr)) {
      await sleep(1200);
      loc = await geocodeAddress(addr.trim() + ', 대한민국');
    }
    if (!loc && /[가-힣]/.test(addr)) {
      await sleep(1200);
      const cityFromAddr = addr.match(/(서울|부산|대구|인천|대전|광주|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/)?.[1];
      if (cityFromAddr) loc = await geocodeAddress(cityFromAddr + ', 대한민국');
    }
    await sleep(1200);
    if (loc) {
      short.lat = loc.lat;
      short.lng = loc.lng;
      short.place = loc.place || short.place;
      short.placeName = addr;
      short.address = loc.address || addr;
      fixed++;
      console.log(`✓ ${short.youtubeVideoId} ${short.title?.slice(0, 40)}... → ${loc.place || addr}`);
    } else {
      console.log(`✗ ${short.youtubeVideoId} ${short.title?.slice(0, 40)}... (지오코딩 실패: ${addr?.slice(0, 30)})`);
    }
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`\n${fixed}개 수정 완료`);
}

function inferCityFromTitle(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes('seoul') || t.includes('서울')) return '서울, South Korea';
  if (t.includes('busan') || t.includes('부산')) return '부산, South Korea';
  if (t.includes('incheon') || t.includes('인천')) return '인천, South Korea';
  if (t.includes('daejeon') || t.includes('대전')) return '대전, South Korea';
  if (t.includes('daegu') || t.includes('대구')) return '대구, South Korea';
  if (t.includes('gwangju') || t.includes('광주')) return '광주, South Korea';
  if (t.includes('osaka') || t.includes('오사카')) return 'Osaka, Japan';
  if (t.includes('tokyo') || t.includes('도쿄')) return 'Tokyo, Japan';
  if (t.includes('dal-dong') || t.includes('달동')) return '달동, 부산, South Korea';
  return null;
}

main().catch(console.error);
