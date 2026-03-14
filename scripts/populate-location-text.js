/**
 * 설명의 '위치'/'주소' 텍스트를 shorts에 추가 (지도 표시용)
 * 좌표는 변경하지 않고 locationText 필드만 채움
 *
 * 실행: npm run populate-location-text
 */
import { Innertube } from 'youtubei.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBestLocationTextFromTexts } from './lib/location-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 댓글 텍스트 배열 반환 (최상위 댓글만) */
async function fetchCommentTexts(innertube, videoId) {
  try {
    const comments = await innertube.getComments(videoId);
    const texts = [];
    for (const th of (comments?.contents || []).slice(0, 30)) {
      const cv = th?.comment;
      if (cv?.content) {
        const t = cv.content?.toString?.() || cv.content?.text || '';
        if (t.trim()) texts.push(t.trim());
      }
    }
    return texts;
  } catch {
    return [];
  }
}

async function main() {
  console.log('설명의 위치/주소 텍스트를 지도 표시용으로 추가\n');

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const innertube = await Innertube.create();
  let updated = 0;

  for (let i = 0; i < db.shorts.length; i++) {
    const short = db.shorts[i];
    let description = '';

    try {
      const info = await innertube.getInfo(short.youtubeVideoId);
      if (info?.secondary_info?.description) {
        description = info.secondary_info.description?.toString?.() || info.secondary_info.description?.text || '';
      }
      if (!description && info?.basic_info?.short_description) {
        description = info.basic_info.short_description || '';
      }
    } catch (e) {
      await sleep(800);
      continue;
    }

    const fullText = `${short.title || ''}\n${description}`;
    const commentTexts = await fetchCommentTexts(innertube, short.youtubeVideoId);
    await sleep(500);
    const locationText = getBestLocationTextFromTexts(fullText, commentTexts);

    if (locationText) {
      short.locationText = locationText;
      updated++;
      console.log(`  [${i + 1}/${db.shorts.length}] ${short.title?.slice(0, 40)}... → ${locationText.slice(0, 50)}...`);
    }
    await sleep(800);
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`\n완료! ${updated}개 쇼츠에 위치/주소 텍스트 추가`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
