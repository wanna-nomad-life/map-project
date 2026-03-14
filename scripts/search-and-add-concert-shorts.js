/**
 * YouTube에서 "2026 콘서트 일정" 쇼츠 검색 후 주소 있는 것만 추가
 * node scripts/search-and-add-concert-shorts.js
 */
import { Innertube } from 'youtubei.js';
import { addShortFromUrl } from './add-short-from-url-api.js';

const SEARCH_QUERY = '2026 콘서트 일정';
const MAX_SHORTS = 15;

function extractVideoIdsFromSearch(searchResult) {
  const ids = [];
  const results = searchResult?.results || [];
  for (const item of results) {
    const vid = item?.video_id || item?.id || item?.videoId;
    if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid) && !vid.startsWith('UC')) {
      ids.push(vid);
    }
    const vidFromUrl = (item?.url || item?.endpoint?.payload?.videoId || '')?.toString?.()?.match(/(?:shorts\/|v=)?([a-zA-Z0-9_-]{11})/)?.[1];
    if (vidFromUrl && /^[a-zA-Z0-9_-]{11}$/.test(vidFromUrl) && !vidFromUrl.startsWith('UC')) {
      ids.push(vidFromUrl);
    }
  }
  return [...new Set(ids)];
}

async function main() {
  console.log(`검색: "${SEARCH_QUERY}"\n`);

  const innertube = await Innertube.create();
  const search = await innertube.search(SEARCH_QUERY, {
    type: 'video',
    duration: 'short',
  });

  const videoIds = extractVideoIdsFromSearch(search);
  if (videoIds.length === 0) {
    const raw = search?.results || [];
    for (const r of raw) {
      const v = r?.id || r?.video_id || r?.videoId;
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) videoIds.push(v);
    }
  }

  const unique = [...new Set(videoIds)].slice(0, MAX_SHORTS);
  console.log(`쇼츠 ${unique.length}개 발견. 주소 있는 것만 추가합니다.\n`);

  let added = 0;
  let skipped = 0;

  for (const vid of unique) {
    const url = `https://www.youtube.com/shorts/${vid}`;
    process.stdout.write(`처리 중: ${vid} ... `);
    try {
      const result = await addShortFromUrl(url);
      if (result.ok) {
        console.log(`✓ 추가: ${result.short?.title?.slice(0, 40) || vid}`);
        added++;
      } else if (result.alreadyExists) {
        console.log('이미 존재');
        skipped++;
      } else {
        console.log(`건너뜀: ${result.error || '주소 없음'}`);
        skipped++;
      }
    } catch (e) {
      console.log(`오류: ${e.message}`);
      skipped++;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n완료: ${added}개 추가, ${skipped}개 건너뜀`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
