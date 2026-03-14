/**
 * 다중 위치 영상 추가 - 2025 상반기 최고의 카페 모음집 (가보자곰)
 * node scripts/add-multi-location-video.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geocodeAddress } from './lib/location-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

const VIDEO = {
  youtubeVideoId: 'wol3RAbMPn4',
  title: '2025 상반기 최고의 카페 모음집',
  views: '727만',
  channelName: '가보자곰',
};

// 2025 상반기 인기 카페 (주소 기반)
const CAFE_ADDRESSES = [
  { placeName: '카페 레이어드 연남점', address: '서울 마포구 성미산로 161-4' },
  { placeName: '테일러 커피 연남', address: '서울 마포구 연남동' },
  { placeName: '대림창고', address: '서울 성동구 성수이로 78' },
  { placeName: '블루보틀 성수', address: '서울 성동구 성수이로7길 39' },
  { placeName: '로우키 성수', address: '서울 성동구 연무장3길 6' },
  { placeName: '마일스톤 커피 가로수길', address: '서울 강남구 논현로159길 49' },
  { placeName: '% 아라비카 강남', address: '서울 강남구 영동대로 513' },
  { placeName: '오르에르 성수', address: '서울 성동구 성수동' },
  { placeName: '앤트러사이트 홍대', address: '서울 마포구 홍익로 3길 20' },
  { placeName: '카페 킨포크 홍대', address: '서울 마포구 홍익로 3길 20' },
  { placeName: '덕희커피 합정', address: '서울 마포구 합정동' },
  { placeName: '카페레터 합정', address: '서울 마포구 합정동' },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('다중 위치 영상 추가\n');

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const existingVideoIds = new Set(db.shorts.map((s) => s.youtubeVideoId));
  if (existingVideoIds.has(VIDEO.youtubeVideoId)) {
    console.log('이미 존재하는 영상:', VIDEO.youtubeVideoId);
    return;
  }

  // 가보자곰 채널 추가
  const channelId = 4;
  let channel = db.channels.find((c) => c.id === channelId || c.name === VIDEO.channelName);
  if (!channel) {
    db.channels.push({
      id: channelId,
      name: VIDEO.channelName,
      subs: '조회수 확인 필요',
      initial: '곰',
      color: '#FF9800',
      youtubeChannelId: `channel_${channelId}`,
      url: 'https://www.youtube.com/@%EA%B0%80%EB%B3%B4%EC%9E%90%EA%B3%B0',
    });
    console.log('채널 추가:', VIDEO.channelName);
  }

  const locations = [];
  for (let i = 0; i < CAFE_ADDRESSES.length; i++) {
    const cafe = CAFE_ADDRESSES[i];
    const addr = cafe.address || cafe.placeName;
    const geo = await geocodeAddress(addr);
    if (geo && geo.lat != null) {
      locations.push({
        lat: geo.lat,
        lng: geo.lng,
        place: geo.place,
        placeName: cafe.placeName,
        address: geo.address,
        locationText: cafe.address || geo.address,
      });
      console.log(`  ${i + 1}. ${cafe.placeName} → ${geo.place}`);
    } else {
      console.log(`  ${i + 1}. ${cafe.placeName} → 지오코딩 실패`);
    }
    await sleep(1100);
  }

  const maxId = Math.max(...db.shorts.map((s) => s.id), 0);
  db.shorts.push({
    id: maxId + 1,
    title: VIDEO.title,
    views: VIDEO.views,
    growthRate: 0.9,
    color: '#FF9800',
    youtubeVideoId: VIDEO.youtubeVideoId,
    channelId,
    locations,
  });

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`\n완료! ${VIDEO.title} 추가 (${locations.length}개 위치)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
