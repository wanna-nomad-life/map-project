/**
 * 채널 검색 API - Vite dev 서버에서 /api/search-channels 사용
 * youtubei.js로 YouTube 채널 검색
 */
import { Innertube } from 'youtubei.js';

let innertube = null;

async function getInnertube() {
  if (!innertube) innertube = await Innertube.create();
  return innertube;
}

export async function searchChannels(query, limit = 3) {
  if (!query || query.trim().length < 2) return [];
  try {
    const yt = await getInnertube();
    const search = await yt.search(query.trim(), { type: 'channel' });
    if (!search?.results) return [];
    const channels = [];
    for (const item of search.results) {
      if (channels.length >= limit) break;
      const type = item?.type || item?.constructor?.type || '';
      const isChannel = type === 'GridChannel' || type === 'Channel' || (item?.author && item?.id);
      if (!isChannel) continue;
      const id = item.id || item.author?.id || '';
      const author = item.author;
      const name = author?.name || item.title?.toString?.() || '';
      const rawUrl = author?.url || '';
      const url = rawUrl.startsWith('http') ? rawUrl : rawUrl ? `https://www.youtube.com${rawUrl}` : (id ? `https://www.youtube.com/channel/${id}` : '');
      let thumb = author?.best_thumbnail?.url || (author?.thumbnails?.[0]?.url) || '';
      if (thumb && thumb.startsWith('//')) thumb = 'https:' + thumb;
      const subs = (item.video_count?.toString?.() || item.subscribers?.toString?.() || item.subscriber_count?.toString?.() || '').trim();
      if (name && (id || url)) {
        channels.push({
          id,
          name,
          url: url || `https://www.youtube.com/@${encodeURIComponent(name)}`,
          thumbnail: thumb,
          subscribers: subs || '구독자 확인 필요',
        });
      }
    }
    return channels;
  } catch (e) {
    console.error('searchChannels error:', e);
    return [];
  }
}
