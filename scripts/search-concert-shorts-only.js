/**
 * 2026 concert 쇼츠 검색 (목록만 출력, 추가 안 함)
 * node scripts/search-concert-shorts-only.js
 */
import { Innertube } from 'youtubei.js';

async function main() {
  const query = '2026 concert';
  const innertube = await Innertube.create();
  const search = await innertube.search(query, { type: 'video', duration: 'short' });

  const results = search?.results || [];
  const items = [];
  for (const r of results) {
    const vid = r?.video_id || r?.id || r?.videoId;
    if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
      const title = r?.title?.toString?.() || r?.title?.text || r?.headline || '';
      items.push({ vid, title: String(title).slice(0, 70) });
    }
  }
  const unique = [...new Map(items.map((i) => [i.vid, i])).values()].slice(0, 25);

  console.log(`\n"${query}" 쇼츠 검색 결과 (${unique.length}개):\n`);
  unique.forEach((item, i) => {
    console.log(`${i + 1}. ${item.title}`);
    console.log(`   https://youtube.com/shorts/${item.vid}\n`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
