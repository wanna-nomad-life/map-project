/**
 * plan_book 채널 쇼츠 영상 ID 가져오기
 * 실행: node scripts/fetch-planbook-shorts.js
 */
import { Innertube } from 'youtubei.js';

function findVideoIds(obj, ids = new Set()) {
  if (!obj) return ids;
  if (obj.id && typeof obj.id === 'string' && obj.id.length === 11 && !obj.id.startsWith('UC')) {
    ids.add(obj.id);
  }
  if (obj.video_id) ids.add(obj.video_id);
  if (obj.videoId) ids.add(obj.videoId);
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) v.forEach(i => findVideoIds(i, ids));
      else findVideoIds(v, ids);
    }
  }
  return ids;
}

async function main() {
  const innertube = await Innertube.create();
  const resolved = await innertube.resolveURL('https://www.youtube.com/@plan_book/shorts');
  const endpoint = resolved;
  
  const response = await innertube.actions.execute(endpoint);
  const ids = findVideoIds(response);
  const idsArr = [...ids].filter(id => id.length === 11 && !id.startsWith('UC'));
  
  console.log('\n플랜북 쇼츠 영상 ID:');
  idsArr.slice(0, 10).forEach((id, i) => console.log(`${i + 1}. ${id}`));
}

main().catch(console.error);
