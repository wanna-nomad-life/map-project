/**
 * YouTube 쇼츠 URL에서 영상 ID 추출 후 shorts.json에 추가
 * 
 * 사용법:
 * 1. https://www.youtube.com/@뉴욕세끼/shorts 에서 쇼츠 클릭
 * 2. 주소창의 URL 복사 (예: https://www.youtube.com/shorts/ABC123xyz01)
 * 3. node scripts/add-shorts-from-url.js "https://www.youtube.com/shorts/ABC123xyz01" "제목"
 * 
 * 또는 여러 개: node scripts/add-shorts-from-url.js URL1 "제목1" URL2 "제목2"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

function extractVideoId(url) {
  const match = url.match(/(?:shorts\/|v=)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2 !== 0) {
  console.log('사용법: node add-shorts-from-url.js <URL> <제목> [URL2 제목2 ...]');
  console.log('예: node add-shorts-from-url.js "https://youtube.com/shorts/ABC123" "플랜북 쇼츠 1"');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const defaultChannelId = 1; // 뉴욕세끼
let maxId = Math.max(...db.shorts.map(s => s.id), 0);

for (let i = 0; i < args.length; i += 2) {
  const url = args[i];
  const title = args[i + 1];
  const videoId = extractVideoId(url);
  if (!videoId) {
    console.warn(`건너뜀: ${url} (영상 ID 추출 실패)`);
    continue;
  }
  maxId++;
  db.shorts.push({
    id: maxId,
    title,
    views: "0",
    growthRate: 0.5,
    color: "#e53935",
    youtubeVideoId: videoId,
    lat: 40.7128,
    lng: -74.006,
    place: "뉴욕",
    channelId: defaultChannelId
  });
  console.log(`추가됨: ${videoId} - ${title}`);
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('\nshorts.json 업데이트 완료!');
