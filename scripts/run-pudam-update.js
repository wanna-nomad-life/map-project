/**
 * 푸담 채널 업데이트 실행
 */
import { updateChannelShorts } from './update-channel-shorts-api.js';

const result = await updateChannelShorts({
  channelId: 1008,
  onProgress: (cur, total) => process.stdout.write(`\r${cur}/${total} `),
});
console.log('\n결과:', JSON.stringify(result, null, 2));
