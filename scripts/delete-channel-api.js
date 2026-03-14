/**
 * 채널 삭제 API
 * POST /api/delete-channel
 * Body: { channelId: number }
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../public/data/shorts.json');

export async function deleteChannel({ channelId }) {
  if (channelId == null) {
    return { ok: false, error: 'channelId 필요' };
  }

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const chIndex = db.channels.findIndex((c) => c.id === channelId);
  if (chIndex < 0) {
    return { ok: false, error: '채널을 찾을 수 없습니다.' };
  }

  db.channels.splice(chIndex, 1);
  db.shorts = db.shorts.filter((s) => s.channelId !== channelId);
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  return { ok: true };
}
