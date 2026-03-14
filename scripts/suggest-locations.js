/**
 * 반자동 위치 추천: 영상 설명에 나온 주소/장소로 지도 위치 표시
 * 1. 설명에서 주소·장소 문자열 추출
 * 2. Nominatim(OpenStreetMap)으로 지오코딩
 * 3. 실패 시 키워드 매칭으로 폴백
 *
 * 실행: npm run suggest-locations
 * 결과: public/data/location-suggestions.json
 */
import { Innertube } from 'youtubei.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');
const outPath = path.join(__dirname, '../public/data/location-suggestions.json');

// 설명에서 주소/장소 추출 (우선순위 높은 패턴 먼저)
function extractAddressFromDescription(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  // 1. 미국 상세 주소: "123 Main St, City, State 12345" 또는 "123 Main St, City, State"
  const usAddr = t.match(/\d+[\s\w\.]+(?:St|Street|Ave|Avenue|Blvd|Rd|Road|Dr|Way)[^.\n]*?(?:,\s*[A-Za-z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?)/);
  if (usAddr) return usAddr[0].trim();

  // 2. "CES in Las Vegas" -> Convention Center
  if (t.includes('ces') && t.includes('las vegas')) return 'Las Vegas Convention Center, Las Vegas, NV';

  // 3. "City branch of Place" (e.g. Las Vegas branch of Gordon Ramsay Burger)
  const branchOf = t.match(/([A-Za-z\s]+)\s+branch\s+of\s+([^.\n]+)/i);
  if (branchOf) return `${branchOf[2].trim()}, ${branchOf[1].trim()}`;

  // 4. "장소 in City, State" 또는 "장소 in City"
  const inCity = t.match(/(?:visited|went to|had|tried|ordered at)\s+([^.\n]+?)\s+in\s+([A-Za-z\s]+(?:,\s*[A-Za-z\s]+)?)/i)
    || t.match(/([A-Za-z\s']+(?:Restaurant|Steakhouse|Burger|Pizza|Sushi|Tea|Mountain|Resort|Center))\s+in\s+([^.\n]+)/i);
  if (inCity) return `${inCity[1].trim()}, ${inCity[2].trim()}`;

  // 4. "in City, State" 또는 "in City" (Today, The 등 문장 시작 전까지만)
  const cityState = t.match(/in\s+([A-Za-z\s]+?)(?=[.,\n]|\s+Today|\s+The\s|$)/i)
    || t.match(/in\s+([A-Za-z\s]+(?:,\s*[A-Za-z\s]+)?)/i);
  if (cityState) return cityState[1].trim();

  // 6. "at Place" (e.g. at Hunter Mountain)
  const atPlace = t.match(/at\s+([^.\n]+?)(?:\s+in\s+|\s*,\s*|$)/i);
  if (atPlace) return atPlace[1].trim();

  // 7. "City's Neighborhood" (e.g. New York's Chinatown)
  const cityNeighborhood = t.match(/([A-Za-z\s]+)'s\s+([A-Za-z\s]+)/);
  if (cityNeighborhood) return `${cityNeighborhood[2].trim()}, ${cityNeighborhood[1].trim()}`;

  // 8. 한국 주소: "서울...", "부산...", "뉴욕 차이나타운"
  const krAddr = t.match(/(서울|부산|인천|대구|광주|대전|제주)[^\n.]*(?:시|구|동|로|길)?\s*\d*[^\n.]*/)
    || t.match(/(뉴욕\s+차이나타운|뉴욕\s+코리아타운|맨해튼|브루클린)/);
  if (krAddr) return krAddr[0].trim();

  // 9. 도시, 국가: "City, Country" 또는 "City"
  const cityCountry = t.match(/([A-Za-z\s]+(?:City|Town|Village)?)\s*,\s*([A-Za-z\s]+)/);
  if (cityCountry) return `${cityCountry[1].trim()}, ${cityCountry[2].trim()}`;

  // 10. 단순 도시/지역명
  const places = [
    'New Haven, Connecticut', 'New Haven, CT',
    'Hunter Mountain', 'Hunter Mountain Ski Resort',
    'Austin, Texas', 'Austin, TX',
    'Las Vegas', 'Las Vegas, NV',
    'New York', 'New York City', 'NYC',
    'San Francisco', 'Washington DC',
    'Hong Kong', 'Tokyo', 'Beijing', 'Seoul',
  ];
  for (const p of places) {
    if (t.toLowerCase().includes(p.toLowerCase())) return p;
  }

  return null;
}

// Nominatim 지오코딩 (1초당 1요청)
async function geocodeAddress(query) {
  if (!query || query.length < 3) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Map-1-Shorts-Location/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.[0]) return null;
    const { lat, lon, display_name } = data[0];
    return {
      lat: parseFloat(lat),
      lng: parseFloat(lon),
      address: display_name,
      placeName: query,
      place: display_name.split(',')[0]?.trim() || query,
      confidence: 'high',
    };
  } catch (e) {
    return null;
  }
}

// 순서 중요: 구체적 키워드 먼저 (지오코딩 실패 시 폴백)
const PLACES = [
  { keywords: ['gordon ramsay', 'burger', 'planet hollywood'], lat: 36.0931, lng: -115.1750, place: '라스베가스', placeName: 'Gordon Ramsay Burger', address: '3667 S Las Vegas Blvd, Planet Hollywood, Las Vegas, NV 89109, USA' },
  { keywords: ['jensen huang', 'ces', 'convention'], lat: 36.1298, lng: -115.1539, place: '라스베가스', placeName: 'Las Vegas Convention Center', address: '3150 Paradise Rd, Las Vegas, NV 89109, USA' },
  { keywords: ['las vegas', 'mandalay', '룸서비스', 'room service'], lat: 36.0925, lng: -115.1766, place: '라스베가스', placeName: 'Mandalay Bay', address: '3950 S Las Vegas Blvd, Las Vegas, NV 89119, USA' },
  { keywords: ['peter luger', 'steakhouse'], lat: 36.0925, lng: -115.1766, place: '라스베가스', placeName: 'Peter Luger Steakhouse', address: 'Las Vegas, NV, USA' },
  { keywords: ['las vegas'], lat: 36.0925, lng: -115.1766, place: '라스베가스', placeName: 'Las Vegas', address: 'Las Vegas, NV, USA' },
  { keywords: ['frank pepe', 'pepe\'s', 'wooster st', 'new haven', 'pizza capital'], lat: 41.30296, lng: -72.91693, place: '뉴헤이븐', placeName: "Frank Pepe's Pizza", address: '157 Wooster St, New Haven, CT 06511, USA' },
  { keywords: ['hunter mountain', 'ski resort', 'upstate', 'gore mountain', 'whiteface'], lat: 42.2049, lng: -74.2332, place: '뉴욕 업스테이트', placeName: 'Hunter Mountain', address: 'Hunter, NY 12442, USA' },
  { keywords: ['tim ho wan', 'dim sum', '홍콩', 'hong kong'], lat: 22.3193, lng: 114.1694, place: '홍콩', placeName: 'Tim Ho Wan', address: 'Hong Kong' },
  { keywords: ['sushi sho', 'new york'], lat: 40.7484, lng: -73.9857, place: '뉴욕 맨해튼', placeName: 'Sushi Sho', address: 'New York, NY, USA' },
  { keywords: ['michelin', 'tim ho wan'], lat: 22.3193, lng: 114.1694, place: '홍콩', placeName: 'Tim Ho Wan', address: 'Hong Kong' },
  { keywords: ['china', 'china', '베이징', 'beijing'], lat: 39.9042, lng: 116.4074, place: '베이징', placeName: 'Beijing', address: 'Beijing, China' },
  { keywords: ['tesla', 'self-driving', 'fsd', '샌프란시스코', 'san francisco'], lat: 37.7749, lng: -122.4194, place: '샌프란시스코', placeName: 'San Francisco', address: 'San Francisco, CA, USA' },
  { keywords: ['gyukatsu', '규카츠', '도쿄', 'tokyo', 'japan'], lat: 35.6762, lng: 139.6503, place: '도쿄', placeName: 'Tokyo', address: 'Tokyo, Japan' },
  { keywords: ['gwanghwamun', '광화문'], lat: 37.5720, lng: 126.9794, place: '서울 광화문', placeName: 'Gwanghwamun', address: '서울특별시 종로구 세종대로' },
  { keywords: ['bryant park'], lat: 40.7542, lng: -73.9848, place: '뉴욕 맨해튼', placeName: 'Bryant Park', address: '40th-42nd St, New York, NY 10018' },
  { keywords: ['white house', 'old ebbitt', '워싱턴', 'washington dc'], lat: 38.8977, lng: -77.0365, place: '워싱턴 DC', placeName: 'Washington DC', address: 'Washington, DC, USA' },
  { keywords: ['edward lee', '610 magnolia', '루이빌', 'louisville'], lat: 38.2527, lng: -85.7585, place: '루이빌', placeName: '610 Magnolia', address: '610 W Magnolia Ave, Louisville, KY 40208, USA' },
  { keywords: ['delmonico', '월가', 'wall street', 'financial'], lat: 40.7050, lng: -74.0103, place: '뉴욕 월가', placeName: "Delmonico's", address: '56 Beaver St, New York, NY 10004, USA' },
  { keywords: ['koreatown', '코리아타운', '32nd st', 'w 32nd'], lat: 40.7478, lng: -73.9869, place: '뉴욕 코리아타운', placeName: 'Koreatown', address: 'W 32nd St, New York, NY 10001' },
  { keywords: ['street food', 'hot dog', '길바닥'], lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' },
  { keywords: ['lobster', 'new york'], lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' },
  { keywords: ['hospital', 'new york'], lat: 40.7128, lng: -74.006, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' },
  { keywords: ['new york', 'nyc', '뉴욕', 'manhattan'], lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' },
  { keywords: ['american', 'steak', 'burger', 'chicken', 'usa', '미국'], lat: 40.7128, lng: -74.006, place: '미국', placeName: 'USA', address: 'USA' },
];

const DEFAULT_PLACE = { lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA', confidence: 'low' };

function inferPlace(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  for (const p of PLACES) {
    if (p.keywords.some((k) => text.includes(k))) {
      return { ...p, confidence: 'medium' };
    }
  }
  if (text.includes('new york') || text.includes('nyc') || text.includes('뉴욕')) {
    return { ...DEFAULT_PLACE, confidence: 'medium' };
  }
  return { ...DEFAULT_PLACE, confidence: 'low' };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('반자동 위치 추천 - 제목+설명 기반\n');

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const needsLocation = db.shorts.filter((s) => s.lat == null || s.lng == null);
  if (needsLocation.length === 0) {
    console.log('위치가 없는 쇼츠가 없습니다.');
    return;
  }

  console.log(`위치 필요한 쇼츠: ${needsLocation.length}개`);
  console.log('YouTube에서 설명 가져오는 중...\n');

  const innertube = await Innertube.create();
  const suggestions = [];

  for (let i = 0; i < needsLocation.length; i++) {
    const short = needsLocation[i];
    const vid = short.youtubeVideoId;
    let description = '';

    try {
      const info = await innertube.getInfo(vid);
      if (info?.secondary_info?.description) {
        description = info.secondary_info.description?.toString?.() || info.secondary_info.description?.text || '';
      }
      if (!description && info?.basic_info?.short_description) {
        description = info.basic_info.short_description || '';
      }
    } catch (e) {
      console.warn(`  [${short.id}] ${short.title?.slice(0, 40)}... - 설명 조회 실패`);
    }

    const fullText = `${short.title || ''}\n${description || ''}`;
    let result = null;

    // 1. 설명에서 주소·장소 추출 후 지오코딩
    const extracted = extractAddressFromDescription(fullText);
    if (extracted) {
      result = await geocodeAddress(extracted);
      if (result) {
        console.log(`  [${i + 1}/${needsLocation.length}] ${short.title?.slice(0, 50)}... → ${extracted} (지오코딩)`);
        await sleep(1100); // Nominatim 1초당 1요청
      }
    }

    // 2. 지오코딩 실패 시 키워드 매칭
    if (!result) {
      result = inferPlace(short.title, description);
      console.log(`  [${i + 1}/${needsLocation.length}] ${short.title?.slice(0, 50)}... → ${result.placeName} (키워드)`);
      await sleep(800); // YouTube 요청 간격
    }

    suggestions.push({
      id: short.id,
      youtubeVideoId: vid,
      title: short.title,
      descriptionSnippet: (description || '').slice(0, 300),
      suggested: {
        lat: result.lat,
        lng: result.lng,
        place: result.place,
        placeName: result.placeName,
        address: result.address,
        confidence: result.confidence || 'medium',
      },
      applied: false,
    });
  }

  fs.writeFileSync(outPath, JSON.stringify({ updatedAt: new Date().toISOString(), suggestions }, null, 2));
  console.log(`\n완료! ${outPath} 저장됨`);
  console.log('admin.html에서 확인 후 적용하세요.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
