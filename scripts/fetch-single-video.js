/**
 * 단일 영상 정보 조회 - 설명에서 여러 위치 추출
 * node scripts/fetch-single-video.js wol3RAbMPn4
 */
import { Innertube } from 'youtubei.js';
import { geocodeAddress } from './lib/location-utils.js';

const videoId = process.argv[2] || 'wol3RAbMPn4';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 설명에서 여러 장소 추출 - 타임스탬프/번호 목록 형식 */
function extractMultipleLocations(description) {
  const results = [];
  const lines = (description || '').split(/\n/).map((l) => l.trim()).filter(Boolean);

  // 패턴: "0:00 카페이름 - 주소" 또는 "1. 카페이름 주소" 또는 "- 카페이름 (주소)"
  for (const line of lines) {
    // 타임스탬프 형식: 0:00, 0:15, 1:23 등
    const tsMatch = line.match(/^\d{1,2}:\d{2}\s+(.+)/);
    if (tsMatch) {
      const rest = tsMatch[1].trim();
      const dash = rest.indexOf(' - ');
      const name = dash >= 0 ? rest.slice(0, dash).trim() : rest;
      const addrPart = dash >= 0 ? rest.slice(dash + 3).trim() : '';
      if (name.length > 2) {
        results.push({ placeName: name, raw: addrPart || name });
      }
      continue;
    }
    // 번호 목록: 1. 카페이름, 2. 카페이름
    const numMatch = line.match(/^\d+[\.\)]\s*(.+)/);
    if (numMatch) {
      const rest = numMatch[1].trim();
      const dash = rest.indexOf(' - ');
      const name = dash >= 0 ? rest.slice(0, dash).trim() : rest;
      const addrPart = dash >= 0 ? rest.slice(dash + 3).trim() : '';
      if (name.length > 2) {
        results.push({ placeName: name, raw: addrPart || name });
      }
      continue;
    }
    // "- 카페이름 (주소)" 또는 "• 카페이름"
    const bulletMatch = line.match(/^[-•]\s*(.+)/);
    if (bulletMatch) {
      const rest = bulletMatch[1].trim();
      const paren = rest.match(/^([^(]+)\s*\(([^)]+)\)/);
      if (paren) {
        results.push({ placeName: paren[1].trim(), raw: paren[2].trim() });
      } else if (rest.length > 3) {
        results.push({ placeName: rest, raw: rest });
      }
    }
  }

  // 한국 주소 패턴으로 추가 추출 (설명 전체에서)
  const krAddrs = description.matchAll(/(서울|부산|인천|대구|광주|대전|제주|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]*(?:구|군|시|동|로|길)[^\n]*[\d\s\-지하층호]+/g);
  for (const m of krAddrs) {
    const raw = m[0].replace(/\s+/g, ' ').trim();
    if (raw.length > 15 && !results.some((r) => r.raw.includes(raw) || raw.includes(r.raw))) {
      results.push({ placeName: raw.split(/[\s,]+/).slice(0, 3).join(' '), raw });
    }
  }

  return results;
}

async function main() {
  console.log('영상 정보 조회:', videoId, '\n');

  const innertube = await Innertube.create();
  const info = await innertube.getInfo(videoId);
  if (!info) {
    console.log('영상 조회 실패');
    return;
  }

  const title = info?.basic_info?.title || info?.primary_info?.title?.toString?.() || '(제목 없음)';
  const views = info?.basic_info?.view_count?.toString?.() || info?.primary_info?.view_count?.toString?.() || '조회수 확인 필요';
  let description = '';
  const descObj = info?.secondary_info?.description;
  if (descObj) {
    if (typeof descObj === 'string') description = descObj;
    else if (descObj?.toString) description = descObj.toString();
    else if (descObj?.text) description = descObj.text;
    else if (descObj?.content) description = typeof descObj.content === 'string' ? descObj.content : JSON.stringify(descObj.content);
    else if (descObj?.runs) {
      description = (descObj.runs || []).map((r) => r?.text || '').join('');
    }
  }
  if (!description && info?.basic_info?.short_description) {
    description = info.basic_info.short_description || '';
  }
  // 디버그: raw 구조 확인
  if (!description && descObj) {
    console.log('DEBUG descObj keys:', Object.keys(descObj || {}));
    console.log('DEBUG descObj:', JSON.stringify(descObj, null, 2).slice(0, 500));
  }

  console.log('제목:', title);
  console.log('조회수:', views);
  console.log('\n--- 설명 ---\n');
  console.log(description.slice(0, 2000));
  if (description.length > 2000) console.log('\n...(생략)');
  console.log('\n--- 추출된 장소 ---\n');

  const locations = extractMultipleLocations(description);
  console.log(`총 ${locations.length}개 장소 추출\n`);

  const geocoded = [];
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const query = loc.raw || loc.placeName;
    const geo = await geocodeAddress(query);
    if (geo && geo.lat != null) {
      geocoded.push({
        placeName: loc.placeName,
        address: geo.address,
        locationText: loc.raw || geo.address,
        lat: geo.lat,
        lng: geo.lng,
        place: geo.place,
      });
      console.log(`  ${i + 1}. ${loc.placeName} → ${geo.place} (${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)})`);
    } else {
      console.log(`  ${i + 1}. ${loc.placeName} → 지오코딩 실패: ${query}`);
    }
    await sleep(1100);
  }

  // 댓글에서도 장소 추출 시도
  if (geocoded.length === 0) {
    console.log('\n댓글에서 장소 추출 시도...\n');
    try {
      const comments = await innertube.getComments(videoId);
      for (const th of (comments?.contents || []).slice(0, 20)) {
        const cv = th?.comment;
        if (cv?.content) {
          const t = (cv.content?.toString?.() || cv.content?.text || '').trim();
          if (t.length > 20) {
            const kr = t.match(/(서울|부산|인천)[^\n]*(?:구|군|동|로|길)[^\n]*[\d\s\-지하층호]+/);
            if (kr) {
              const raw = kr[0].replace(/\s+/g, ' ').trim();
              const geo = await geocodeAddress(raw);
              if (geo && geo.lat) {
                geocoded.push({ placeName: raw.split(/\s/).slice(0, 4).join(' '), ...geo });
                console.log('  댓글:', raw.slice(0, 50), '... →', geo.place);
              }
              await sleep(1100);
            }
          }
        }
      }
    } catch (e) {
      console.warn('댓글 조회 실패:', e.message);
    }
  }

  console.log('\n--- JSON (locations) ---\n');
  console.log(JSON.stringify(geocoded, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
