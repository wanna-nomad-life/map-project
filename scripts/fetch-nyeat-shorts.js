/**
 * 뉴욕세끼 채널 쇼츠 영상 가져오기
 * 실행: node scripts/fetch-nyeat-shorts.js
 */
import { Innertube } from 'youtubei.js';

async function main() {
  const innertube = await Innertube.create();
  
  // 채널 Shorts 탭
  const resolved = await innertube.resolveURL('https://www.youtube.com/@%EB%89%B4%EC%9A%95%EC%84%B8%EB%81%BC/shorts');
  if (!resolved) {
    console.log('resolveURL 실패');
    return;
  }
  
  const response = await innertube.actions.execute(resolved);
  if (!response) {
    console.log('execute 실패');
    return;
  }
  
  const items = [];
  function extractVideos(obj) {
    if (!obj) return;
    if (obj.video_id && obj.title) {
      items.push({
        id: obj.video_id,
        title: obj.title?.text || obj.title
      });
    }
    if (obj.videoId && obj.title) {
      items.push({
        id: obj.videoId,
        title: obj.title?.text || obj.title
      });
    }
    if (typeof obj === 'object') {
      for (const v of Object.values(obj)) {
        if (Array.isArray(v)) v.forEach(i => extractVideos(i));
        else extractVideos(v);
      }
    }
  }
  extractVideos(response);
  
  // 중복 제거 (id 기준)
  const seen = new Set();
  const unique = items.filter(i => {
    if (seen.has(i.id)) return false;
    if (i.id.length !== 11 || i.id.startsWith('UC')) return false;
    seen.add(i.id);
    return true;
  });
  
  console.log(JSON.stringify(unique.slice(0, 20), null, 2));
}

main().catch(console.error);
