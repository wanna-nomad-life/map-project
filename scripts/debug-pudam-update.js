/**
 * 푸담 채널 업데이트 디버그 - 왜 영상이 추가되지 않는지 확인
 */
import { Innertube } from 'youtubei.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBestAddressFromTexts, geocodeAddress } from './lib/location-utils.js';
import { extractGoogleMapsLocations } from './lib/google-maps-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

function extractFromRaw(obj, items = []) {
  if (!obj) return items;
  if (obj.entityId?.startsWith('shorts-shelf-item-')) {
    const m = obj.entityId.match(/shorts-shelf-item-([a-zA-Z0-9_-]{11})/);
    if (m) {
      const title = obj.overlayMetadata?.primaryText?.runs?.[0]?.text || obj.accessibilityText?.split(',')[0]?.trim() || '';
      items.push({ youtubeVideoId: m[1], title });
    }
    return items;
  }
  if (obj.videoId && /^[a-zA-Z0-9_-]{11}$/.test(obj.videoId) && !obj.videoId.startsWith('UC')) {
    const title = obj.title?.runs?.[0]?.text || obj.headline || '';
    if (!items.some((i) => i.youtubeVideoId === obj.videoId)) {
      items.push({ youtubeVideoId: obj.videoId, title });
    }
    return items;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) v.forEach((i) => extractFromRaw(i, items));
      else extractFromRaw(v, items);
    }
  }
  return items;
}

async function main() {
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const channel = db.channels.find((c) => c.id === 1008);
  if (!channel) {
    console.log('푸담 채널 없음');
    return;
  }

  const shortsUrl = channel.url.replace(/\/?$/, '/shorts');
  console.log('쇼츠 URL:', shortsUrl);

  const innertube = await Innertube.create();
  const resolved = await innertube.resolveURL(shortsUrl);
  if (!resolved) {
    console.log('URL 조회 실패');
    return;
  }

  const raw = await innertube.call(resolved, { parse: false });
  const allShorts = extractFromRaw(raw?.data);
  const unique = [...new Map(allShorts.map((s) => [s.youtubeVideoId, s])).values()];
  const existingIds = new Set(db.shorts.filter((s) => s.channelId === 1008).map((s) => s.youtubeVideoId));

  const toProcess = unique.filter((s) => !existingIds.has(s.youtubeVideoId));
  console.log('\n총 쇼츠:', unique.length, '| 이미 등록:', existingIds.size, '| 추가 대상:', toProcess.length);

  if (toProcess.length === 0) {
    console.log('추가할 영상 없음 (모두 이미 등록됨)');
    return;
  }

  // 모든 미등록 영상 상세 디버그
  for (let i = 0; i < toProcess.length; i++) {
    const s = toProcess[i];
    console.log('\n--- 영상', i + 1, s.youtubeVideoId, s.title?.slice(0, 40) || '');

    let description = '';
    try {
      const info = await innertube.getInfo(s.youtubeVideoId);
      const descObj = info?.secondary_info?.description;
      if (descObj?.runs?.length) {
        description = descObj.runs
          .map((r) => {
            const url = r?.endpoint?.payload?.url || r?.endpoint?.metadata?.url;
            if (url && typeof url === 'string') {
              try {
                const urlObj = new URL(url);
                const q = urlObj.searchParams.get('q');
                if (q) return decodeURIComponent(q);
                if (url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps')) return url;
              } catch {}
            }
            return r?.text || '';
          })
          .join('');
      }
      if (!description && descObj) description = descObj?.toString?.() || '';
    } catch (e) {
      console.log('  getInfo 실패:', e.message);
      continue;
    }

    const fullText = `${s.title || ''}\n${description}`;
    console.log('  설명 앞 300자:', fullText.slice(0, 300).replace(/\n/g, ' '));

    const extracted = getBestAddressFromTexts(fullText, []);
    console.log('  getBestAddressFromTexts:', extracted || '(null)');

    const gmapsLocs = await extractGoogleMapsLocations(fullText);
    console.log('  구글맵 좌표:', gmapsLocs.length, '개', gmapsLocs.slice(0, 2));

    if (extracted) {
      const loc = await geocodeAddress(extracted);
      console.log('  geocodeAddress:', loc ? [loc.lat, loc.lng, loc.place] : 'null');
    }

    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch(console.error);
