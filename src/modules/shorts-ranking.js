/**
 * 쇼츠 랭킹 - 국가/도시별 조회수·클릭 순위
 */
import { getLocationPoints } from './shorts-location.js';

/**
 * 원시 문자열 → 실제 국가명(한글) 정규화
 * 주소/장소명에서 나온 값을 표준 국가명으로 변환
 */
const COUNTRY_ALIAS = {
  // 대한민국
  '대한민국': '대한민국', '한국': '대한민국', 'South Korea': '대한민국', 'Korea': '대한민국',
  '서울특별시': '대한민국', '부산광역시': '대한민국', '대구광역시': '대한민국', '인천광역시': '대한민국',
  '광주광역시': '대한민국', '대전광역시': '대한민국', '울산광역시': '대한민국', '세종특별자치시': '대한민국',
  '경기도': '대한민국', '강원도': '대한민국', '충청북도': '대한민국', '충청남도': '대한민국',
  '전라북도': '대한민국', '전라남도': '대한민국', '경상북도': '대한민국', '경상남도': '대한민국', '제주도': '대한민국',
  'Seoul': '대한민국', 'Busan': '대한민국', 'Incheon': '대한민국', 'Suwon': '대한민국',
  'Gyeonggi-do': '대한민국', 'Suwon-si': '대한민국', 'Paldal-gu': '대한민국', 'Gwangjin-gu': '대한민국',
  'Yeouido': '대한민국', '여의도': '대한민국',
  'Mapo-gu': '대한민국', 'Jongno-gu': '대한민국', 'Jung-gu': '대한민국', 'Gangnam-gu': '대한민국',
  'Songpa-gu': '대한민국', 'Yeongdeungpo-gu': '대한민국', 'Jungnang-gu': '대한민국',
  'Dongdaemun-gu': '대한민국', 'Seongbuk-gu': '대한민국', 'Seodaemun-gu': '대한민국', 'Eunpyeong-gu': '대한민국',
  'Gwonseon-gu': '대한민국', 'Yeongtong-gu': '대한민국', 'Daegu': '대한민국', 'Gwangju': '대한민국',
  'Daejeon': '대한민국', 'Ulsan': '대한민국', 'Seongnam': '대한민국', 'Yongin': '대한민국',
  'Goyang': '대한민국', 'Hwaseong': '대한민국',
  // 일본
  '일본': '일본', '日本': '일본', 'Japan': '일본',
  '東京都': '일본', '東京': '일본', 'Tokyo': '일본',
  '大阪府': '일본', '大阪': '일본', 'Osaka': '일본',
  '福岡県': '일본', '福岡': '일본', 'Fukuoka': '일본',
  '北海道': '일본', '京都府': '일본', '京都': '일본', 'Kyoto': '일본',
  '神奈川県': '일본', '愛知県': '일본', '広島県': '일본', '沖縄県': '일본',
  '千葉県': '일본', '埼玉県': '일본', '神戸': '일본', 'Kobe': '일본',
  '横浜': '일본', 'Yokohama': '일본', '名古屋': '일본', 'Nagoya': '일본',
  'Kurume': '일본', '久留米市': '일본',
  // 태국
  '태국': '태국', 'ประเทศไทย': '태국', 'Thailand': '태국',
  'กรุงเทพมหานคร': '태국', 'Bangkok': '태국', '방콕': '태국',
  'Chon Buri': '태국', 'Chiang Mai': '태국', '치앙마이': '태국',
  'พัทยา': '태국', 'Pattaya': '태국',
  // 베트남
  '베트남': '베트남', 'Vietnam': '베트남', 'Việt Nam': '베트남',
  '호치민': '베트남', 'Ho Chi Minh': '베트남', '하노이': '베트남', 'Hanoi': '베트남',
  // 미국
  '미국': '미국', 'United States': '미국', 'USA': '미국', 'America': '미국', 'US': '미국',
  'New York': '미국', 'Los Angeles': '미국', 'California': '미국',
  // 중국
  '중국': '중국', '中国': '중국', 'China': '중국',
  '上海': '중국', 'Shanghai': '중국', '北京': '중국', 'Beijing': '중국',
  // 아랍에미리트
  'UAE': '아랍에미리트', 'United Arab Emirates': '아랍에미리트', 'Dubai': '아랍에미리트', '두바이': '아랍에미리트',
  // 기타
  'Singapore': '싱가포르', '马来西亚': '말레이시아', 'Malaysia': '말레이시아',
  'Indonesia': '인도네시아', '필리핀': '필리핀', 'Philippines': '필리핀',
  'Taiwan': '대만', '台湾': '대만', '홍콩': '홍콩', 'Hong Kong': '홍콩',
};

const ACTUAL_COUNTRY_NAMES = new Set([
  '대한민국', '일본', '태국', '베트남', '미국', '중국', '아랍에미리트',
  '싱가포르', '말레이시아', '인도네시아', '필리핀', '대만', '홍콩', '기타',
]);

function normalizeToActualCountry(raw) {
  if (!raw || /^\d+$/.test(raw)) return '기타';
  const trimmed = String(raw).trim();
  const mapped = COUNTRY_ALIAS[trimmed];
  if (mapped) return mapped;
  if (ACTUAL_COUNTRY_NAMES.has(trimmed)) return trimmed;
  return '기타';
}

/**
 * 쇼츠의 주소 텍스트에서 국가·도시 추출 (실제 시·군·구만, 대한민국은 한글)
 * resolvedCache: { "lat,lng": { country, city } } - 역지오코딩 결과 캐시
 */
export function parseLocationCountryCity(short, resolvedCache = null) {
  const pts = getLocationPoints(short);
  const first = pts[0] || short;
  const lat = first.lat;
  const lng = first.lng;

  if (resolvedCache && lat != null && lng != null) {
    const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
    const cached = resolvedCache.get(key);
    if (cached && isSiDoFormat(cached.city)) {
      return cached;
    }
  }

  const addr = first.address || first.locationText || first.placeName || '';
  const place = first.place || first.placeName || '';
  const text = `${addr} ${place}`.trim();

  let rawCountry = '';
  let city = '';

  const parts = text.split(/[,\s]+/).filter(Boolean);

  for (const p of parts) {
    if (COUNTRY_ALIAS[p]) {
      rawCountry = COUNTRY_ALIAS[p];
      break;
    }
  }
  if (!rawCountry) {
    for (const p of parts) {
      const n = normalizeToActualCountry(p);
      if (n !== '기타') {
        rawCountry = n;
        break;
      }
    }
    if (!rawCountry) {
      rawCountry = normalizeToActualCountry(parts[parts.length - 1]);
    }
  }

  const country = normalizeToActualCountry(rawCountry);

  const countryOnlyTokens = new Set(['日本', '대한민국', 'Thailand', 'Japan', 'Korea', 'South Korea', 'ประเทศไทย', 'Vietnam', 'USA', 'United States', '中国', 'China']);
  const siDoPatterns = [/(특별시|광역시|도)$/, /(都|府|県|道)$/, /(มหานคร|จังหวัด)$/];
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (countryOnlyTokens.has(p) || /^\d{4,}$/.test(p)) continue;
    if (siDoPatterns.some((r) => r.test(p)) || p?.match(/^[가-힣]{2,}(시|군|구)$/) || /^[一-龥ぁ-んァ-ン]+(市|区|町)/.test(p || '')) {
      const normalized = normalizeToActualCity(p, country);
      if (normalized) {
        city = normalized;
        break;
      }
    }
  }
  if (!city && parts.length > 0) {
    for (const p of parts) {
      if (countryOnlyTokens.has(p) || /^\d+$/.test(p)) continue;
      const normalized = normalizeToActualCity(p, country);
      if (normalized) {
        city = normalized;
        break;
      }
    }
  }

  return { country: country || '기타', city: isSiDoFormat(city) ? city : '' };
}

/**
 * 시·도 수준 도시 정규화
 * 대한민국: 서울특별시, 부산광역시, 경기도 등 시·도만
 * 일본: 東京都, 福岡県, 大阪府 등
 */
const CITY_ALIAS = {
  // 대한민국: 구/군/시 → 시·도
  'Seoul': '서울특별시', 'Mapo-gu': '서울특별시', 'Jongno-gu': '서울특별시', 'Jung-gu': '서울특별시',
  'Gangnam-gu': '서울특별시', 'Songpa-gu': '서울특별시', 'Yeongdeungpo-gu': '서울특별시', 'Jungnang-gu': '서울특별시',
  'Dongdaemun-gu': '서울특별시', 'Seongbuk-gu': '서울특별시', 'Seodaemun-gu': '서울특별시', 'Eunpyeong-gu': '서울특별시',
  'Gwangjin-gu': '서울특별시',   '마포구': '서울특별시', '강남구': '서울특별시', '종로구': '서울특별시', '송파구': '서울특별시',
  '영등포구': '서울특별시', '광진구': '서울특별시', '동대문구': '서울특별시', '성북구': '서울특별시',
  '여의도': '서울특별시', 'Yeouido': '서울특별시',
  '서대문구': '서울특별시', '은평구': '서울특별시', '중랑구': '서울특별시', '중구': '서울특별시',
  '서울특별시': '서울특별시',
  'Suwon': '경기도', 'Suwon-si': '경기도', 'Paldal-gu': '경기도', 'Gwonseon-gu': '경기도', 'Yeongtong-gu': '경기도',
  'Gyeonggi-do': '경기도', '수원시': '경기도', '팔달구': '경기도', '성남시': '경기도', '용인시': '경기도',
  '고양시': '경기도', '화성시': '경기도', '경기도': '경기도',
  'Busan': '부산광역시', 'Incheon': '인천광역시', 'Daegu': '대구광역시', 'Gwangju': '광주광역시',
  'Daejeon': '대전광역시', 'Ulsan': '울산광역시', 'Seongnam': '경기도', 'Yongin': '경기도',
  'Goyang': '경기도', 'Hwaseong': '경기도',
  '부산광역시': '부산광역시', '인천광역시': '인천광역시', '대구광역시': '대구광역시',
  '광주광역시': '광주광역시', '대전광역시': '대전광역시', '울산광역시': '울산광역시',
  '강원도': '강원도', '충청북도': '충청북도', '충청남도': '충청남도', '전라북도': '전라북도',
  '전라남도': '전라남도', '경상북도': '경상북도', '경상남도': '경상남도', '제주도': '제주도',
  // 일본: 구/시 → 도/부/현
  'Tokyo': '東京都', '墨田区': '東京都', '中央区': '東京都', '港区': '東京都', '江東区': '東京都',
  '杉並区': '東京都', 'Chuo City': '東京都', 'Minato City': '東京都', 'Koto City': '東京都', 'Suginami City': '東京都',
  '東京都': '東京都', 'Osaka': '大阪府', '大阪府': '大阪府', 'Fukuoka': '福岡県', '福岡県': '福岡県',
  'Kurume': '福岡県', '久留米市': '福岡県', 'Kyoto': '京都府', '京都府': '京都府',
  '北海道': '北海道', '神奈川県': '神奈川県', '愛知県': '愛知県', '沖縄県': '沖縄県',
  // 태국
  'Bangkok': 'กรุงเทพมหานคร', 'Chon Buri': 'ชลบุรี', 'Chiang Mai': 'เชียงใหม่',
  'Samphanthawong': 'กรุงเทพมหานคร', 'Khlong Toei': 'กรุงเทพมหานคร', 'Dusit District': 'กรุงเทพมหานคร',
  'กรุงเทพมหานคร': 'กรุงเทพมหานคร',
  // 베트남
  'Ho Chi Minh': '호치민시', 'Hanoi': '하노이시', '호치민시': '호치민시', '하노이시': '하노이시',
  // 기타
  'Dubai': '두바이', 'Singapore': '싱가포르', 'Hong Kong': '홍콩',
};

/** 시·도 패턴 (한글: 특별시, 광역시, 도) */
const SI_DO_KO = /^[가-힣]+(특별시|광역시|도)$/;
/** 시·도 패턴 (일본: 都, 府, 県, 道) */
const SI_DO_JP = /^[一-龥ぁ-んァ-ン]+(都|府|県|道)$/;
/** 시·도 패턴 (태국: จังหวัด 등) */
const SI_DO_TH = /^[ก-๙\u0E00-\u0E7F]+(จังหวัด|มหานคร)?$/;

function isSiDoFormat(city) {
  if (!city || typeof city !== 'string') return false;
  const t = city.trim();
  if (/^\d+$/.test(t)) return false;
  return SI_DO_KO.test(t) || SI_DO_JP.test(t) || SI_DO_TH.test(t) || /^[ก-๙\u0E00-\u0E7F]+/.test(t);
}

function normalizeToActualCity(raw, country) {
  if (!raw || /^\d+$/.test(raw)) return '';
  const trimmed = String(raw).trim();
  const mapped = CITY_ALIAS[trimmed];
  if (mapped) {
    if (country === '대한민국' && !/^[가-힣]/.test(mapped)) return '';
    return mapped;
  }
  if (country === '대한민국') {
    if (SI_DO_KO.test(trimmed)) return trimmed;
    if (/^[가-힣]+(시|군|구)$/.test(trimmed)) {
      if (/구$/.test(trimmed) && (trimmed.includes('마포') || trimmed.includes('강남') || trimmed.includes('송파') || trimmed.includes('종로') || trimmed.includes('영등포') || trimmed.includes('광진'))) return '서울특별시';
      if (/시$|구$/.test(trimmed)) return '경기도';
      return trimmed.endsWith('시') ? trimmed : '';
    }
    return '';
  }
  if (SI_DO_JP.test(trimmed)) return trimmed;
  if (SI_DO_TH.test(trimmed) || /^[ก-๙\u0E00-\u0E7F]+/.test(trimmed)) return trimmed;
  return '';
}

/**
 * 역지오코딩으로 시·도 조회 (Nominatim)
 */
const geocodeCache = new Map();

export async function reverseGeocodeToSiGunGu(lat, lng) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko`,
      { headers: { 'Accept-Language': 'ko' } }
    );
    const data = await res.json();
    const addr = data?.address || {};
    let country = (addr.country || '').trim();
    let city = '';

    if (country === '대한민국' || country === 'Republic of Korea') {
      country = '대한민국';
      city = addr.state || addr.city || '';
    } else if (country === '日本' || country === 'Japan') {
      country = '일본';
      city = addr.state || addr.city || '';
    } else if (country === 'Thailand' || country === 'ประเทศไทย') {
      country = '태국';
      city = addr.state || addr.city || '';
    } else if (country) {
      country = COUNTRY_ALIAS[country] || country;
      city = addr.state || addr.city || addr.county || '';
    }

    const result = { country: country || '기타', city: isSiDoFormat(city) ? city : '기타' };
    geocodeCache.set(key, result);
    return result;
  } catch {
    return { country: '기타', city: '기타' };
  }
}

/**
 * 조회수 문자열을 숫자로 파싱 (정렬용)
 * "1.2만" -> 12000, "10만" -> 100000, "조회수 확인 필요" -> 0
 */
export function parseViewsToNumber(views) {
  if (views == null) return 0;
  const str = String(views).trim();
  if (!str || str.includes('확인 필요') || str.includes('N/A')) return 0;

  const num = parseFloat(str.replace(/[^\d.]/g, ''));
  if (isNaN(num)) return 0;

  if (str.includes('만')) return Math.round(num * 10000);
  if (str.includes('천')) return Math.round(num * 1000);
  if (str.includes('억')) return Math.round(num * 100000000);
  return Math.round(num);
}

/**
 * 클릭수 파싱 (데이터에 없으면 0)
 */
export function parseClicksToNumber(short) {
  const clicks = short?.clicks ?? short?.clicksThisMonth ?? 0;
  return typeof clicks === 'number' ? clicks : parseViewsToNumber(clicks);
}

/**
 * 정렬용 점수: 조회수 + 클릭수 (한 달 기준 - 데이터 있으면 사용, 없으면 전체)
 */
export function getEngagementScore(short) {
  const views = parseViewsToNumber(short.views);
  const clicks = parseClicksToNumber(short);
  return views + clicks;
}

/**
 * 전 세계 / 국가 / 도시별 쇼츠 필터링 및 정렬
 */
export function getRankedShorts(shortsData, scope = 'world', countryFilter = null, cityFilter = null, resolvedCache = null) {
  let filtered = shortsData.filter((s) => getLocationPoints(s).length > 0);

  if (scope === 'country' && countryFilter) {
    filtered = filtered.filter((s) => {
      const { country } = parseLocationCountryCity(s, resolvedCache);
      return country === countryFilter;
    });
  } else if (scope === 'city' && countryFilter) {
    filtered = filtered.filter((s) => {
      const { country, city } = parseLocationCountryCity(s, resolvedCache);
      if (country !== countryFilter) return false;
      if (!cityFilter) return true;
      return city === cityFilter;
    });
  }

  filtered.sort((a, b) => {
    const scoreA = getEngagementScore(a);
    const scoreB = getEngagementScore(b);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (b.growthRate ?? 0) - (a.growthRate ?? 0);
  });

  return filtered;
}

/** 국가 표시 순서 (우선순위) */
const COUNTRY_ORDER = [
  '대한민국', '일본', '태국', '미국', '중국', '베트남', '아랍에미리트',
  '싱가포르', '말레이시아', '인도네시아', '필리핀', '대만', '홍콩', '기타',
];

/**
 * 고유 국가 목록 (실제 국가명만, 쇼츠 있는 것만)
 */
export function getUniqueCountries(shortsData, resolvedCache = null) {
  const set = new Set();
  shortsData.forEach((s) => {
    if (getLocationPoints(s).length > 0) {
      const { country } = parseLocationCountryCity(s, resolvedCache);
      if (country && ACTUAL_COUNTRY_NAMES.has(country)) set.add(country);
    }
  });
  return [...set].sort((a, b) => {
    const ia = COUNTRY_ORDER.indexOf(a);
    const ib = COUNTRY_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
}

/**
 * 특정 국가 내 고유 도시 목록 (시·군·구만)
 */
export function getUniqueCities(shortsData, countryFilter, resolvedCache = null) {
  const set = new Set();
  shortsData.forEach((s) => {
    if (getLocationPoints(s).length > 0) {
      const { country, city } = parseLocationCountryCity(s, resolvedCache);
      if (country === countryFilter && city && isSiDoFormat(city)) set.add(city);
    }
  });
  return [...set].sort((a, b) => a.localeCompare(b));
}
