/**
 * 쇼츠 위치 지도 - SSE 스트림 파싱
 * 채널 추가/업데이트 API 응답 파싱 (진행률 + 결과)
 */

/**
 * @param {ReadableStream} body
 * @param {(percent: number) => void} onProgress
 * @returns {Promise<{ type: 'done', result: any } | { type: 'error', error: string }>}
 */
export async function parseSSEStream(body, onProgress) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastEvent = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === 'progress') onProgress(ev.percent ?? 0);
          else if (ev.type === 'done') lastEvent = ev;
          else if (ev.type === 'error') throw new Error(ev.error);
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  }
  if (buffer.startsWith('data: ')) {
    try {
      const ev = JSON.parse(buffer.slice(6));
      if (ev.type === 'done') lastEvent = ev;
      else if (ev.type === 'error') throw new Error(ev.error);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
    }
  }
  return lastEvent;
}
