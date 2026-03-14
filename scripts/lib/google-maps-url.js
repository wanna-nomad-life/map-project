/**
 * 구글맵 URL → 좌표 추출 모듈
 *
 * - 모든 URL 리다이렉트 따라가서 최종 URL에서 추출 (구글맵 등록 주소 반영)
 * - ?q=주소, ?query=주소: Nominatim 지오코딩으로 좌표 변환
 * - GOOGLE_MAPS_API_KEY 또는 GOOGLE_PLACES_API_KEY 환경변수 설정 시:
 *   Place ID(ChIJ...)로 Geocoding API 호출 → 구글맵 등록 주소/좌표 사용
 */
import https from 'node:https';
import http from 'node:http';
import { geocodeAddress } from './location-utils.js';

const RESOLVE_TIMEOUT_MS = 10000;

/** 단축/일반 URL 리다이렉트 따라가서 최종 URL 반환 */
async function resolveRedirectUrl(shortUrl, maxRedirects = 5) {
  let url = shortUrl.trim();
  if (!url.startsWith('http')) url = 'https://' + url;

  for (let i = 0; i < maxRedirects; i++) {
    const result = await new Promise((resolve, reject) => {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      let req;
      const timer = setTimeout(() => {
        if (req) req.destroy();
        reject(new Error('Resolve timeout'));
      }, RESOLVE_TIMEOUT_MS);
      req = lib.get(
        url,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        },
        (res) => {
          clearTimeout(timer);
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const loc = res.headers.location;
            res.destroy();
            resolve({ redirect: loc.startsWith('http') ? loc : new URL(loc, url).href });
            return;
          }
          res.destroy();
          resolve({ final: url });
        }
      );
      req.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    if (result.redirect) {
      url = result.redirect;
    } else {
      return result.final;
    }
  }
  return url;
}

/** URL 문자열에서 좌표 추출 (동기) */
function parseCoordinatesFromUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return null;

  // 1. /place/Name/@lat,lng - 장소명 추출 (먼저 체크)
  const placeRe = /\/place\/([^/]+)\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  let m = urlString.match(placeRe);
  if (m) {
    try {
      const placeName = decodeURIComponent((m[1] || '').replace(/\+/g, ' ')).trim();
      const lat = parseFloat(m[2]);
      const lng = parseFloat(m[3]);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng, placeName: placeName || null };
    } catch {}
  }

  // 2. @lat,lng (google.com/maps/@37.5665,126.978,17z)
  const atRe = /@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,\d+z?)?/;
  m = urlString.match(atRe);
  if (m) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng, placeName: null };
    }
  }

  // 3. ?q=lat,lng 또는 ?ll=lat,lng
  const qRe = /[?&](?:q|ll)=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  m = urlString.match(qRe);
  if (m) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng, placeName: null };
  }

  // 4. !3dlat!4dlng 또는 !4dlng!3dlat
  const d1 = urlString.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (d1) {
    const lat = parseFloat(d1[1]);
    const lng = parseFloat(d1[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng, placeName: null };
  }
  const d2 = urlString.match(/!4d(-?\d+\.?\d*)!3d(-?\d+\.?\d*)/);
  if (d2) {
    const lng = parseFloat(d2[1]);
    const lat = parseFloat(d2[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng, placeName: null };
  }

  // 5. ?q= 또는 ?query= 주소 텍스트 (좌표가 아닐 때)
  try {
    const urlObj = new URL(urlString);
    const q = urlObj.searchParams.get('q') || urlObj.searchParams.get('query');
    if (q && typeof q === 'string') {
      const decoded = decodeURIComponent(q).trim();
      const coordMatch = decoded.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
      if (!coordMatch) {
        return { addressQuery: decoded };
      }
    }
  } catch {}

  return null;
}

/** Place ID 추출 (ChIJ... 또는 0x...:0x...) */
function extractPlaceIdFromUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return null;
  const chij = urlString.match(/!1s(ChIJ[A-Za-z0-9_-]+)/);
  if (chij) return chij[1];
  const legacy = urlString.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (legacy) return legacy[1];
  const queryParam = urlString.match(/[?&]query_place_id=(ChIJ[A-Za-z0-9_-]+)/);
  if (queryParam) return queryParam[1];
  return null;
}

/** Google Geocoding API로 Place ID → 좌표+주소 조회 (API 키 필요) */
async function fetchPlaceByPlaceId(placeId) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !placeId) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(placeId)}&key=${apiKey}`;
    const data = await new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'Map-1/1.0' } }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Parse error'));
          }
        });
      }).on('error', reject);
    });
    const r = data?.results?.[0];
    if (!r?.geometry?.location) return null;
    const { lat, lng } = r.geometry.location;
    return {
      lat,
      lng,
      placeName: r.formatted_address || r.address_components?.[0]?.long_name,
    };
  } catch {
    return null;
  }
}

/** 텍스트에서 구글맵 URL 패턴 추출 */
function extractUrlPatterns(text) {
  const urls = [];
  const seen = new Set();

  // 단축 URL: maps.app.goo.gl, goo.gl/maps
  const shortRe = /(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[A-Za-z0-9_-]+/g;
  for (const m of (text || '').matchAll(shortRe)) {
    let u = m[0];
    if (!u.startsWith('http')) u = 'https://' + u;
    if (!seen.has(u)) {
      seen.add(u);
      urls.push({ url: u, type: 'short' });
    }
  }

  // 일반 URL (좌표 포함 가능한 패턴)
  const longRe = /https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.google\.com)[^\s<>"']+/g;
  for (const m of (text || '').matchAll(longRe)) {
    const u = m[0];
    if (!seen.has(u)) {
      seen.add(u);
      urls.push({ url: u, type: 'long' });
    }
  }

  return urls;
}

/**
 * 설명/댓글 텍스트에서 구글맵 위치 추출 (메인 함수)
 * - 모든 URL 리다이렉트 따라가서 최종 URL에서 추출 (구글맵 등록 주소 반영)
 * - ?q=주소 형식은 지오코딩으로 좌표 변환
 * - GOOGLE_MAPS_API_KEY 있으면 Place ID로 정확한 주소 조회
 * @param {string} text - 설명 + 댓글 합친 텍스트
 * @returns {Promise<{ lat: number, lng: number, placeName?: string }[]>}
 */
export async function extractGoogleMapsLocations(text) {
  if (!text || typeof text !== 'string') return [];

  const results = [];
  const seen = new Set();

  const addUnique = (lat, lng, placeName) => {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      results.push({ lat, lng, placeName: placeName || undefined });
    }
  };

  const patterns = extractUrlPatterns(text);

  for (const { url } of patterns) {
    try {
      const finalUrl = await resolveRedirectUrl(url);
      await new Promise((r) => setTimeout(r, 200));

      const placeId = extractPlaceIdFromUrl(finalUrl);
      if (placeId) {
        const apiResult = await fetchPlaceByPlaceId(placeId);
        if (apiResult) {
          addUnique(apiResult.lat, apiResult.lng, apiResult.placeName);
          continue;
        }
      }

      const loc = parseCoordinatesFromUrl(finalUrl);
      if (loc) {
        if (loc.lat != null && loc.lng != null) {
          addUnique(loc.lat, loc.lng, loc.placeName);
        } else if (loc.addressQuery) {
          const geocoded = await geocodeAddress(loc.addressQuery);
          await new Promise((r) => setTimeout(r, 1100));
          if (geocoded) {
            addUnique(geocoded.lat, geocoded.lng, geocoded.place || loc.addressQuery);
          }
        }
      }
    } catch {
      // URL 해석 실패 시 무시
    }
  }

  return results;
}
