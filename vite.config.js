import { defineConfig } from 'vite'

function createApiMiddleware() {
  return async (req, res, next) => {
          if (req.url?.startsWith('/api/search-channels')) {
            try {
              const url = new URL(req.url, 'http://localhost');
              const q = url.searchParams.get('q') || '';
              const { searchChannels } = await import('./scripts/search-channels-api.js');
              const channels = await searchChannels(q, 3);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ channels }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(e.message) }));
            }
            return;
          }
          if (req.url === '/api/add-channel-with-shorts' && req.method === 'POST') {
            const body = await new Promise((resolve, reject) => {
              const chunks = [];
              req.on('data', (c) => chunks.push(c));
              req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
              req.on('error', reject);
            });
            try {
              const { name, url } = JSON.parse(body || '{}');
              if (!url) throw new Error('url 필요');
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');
              res.flushHeaders?.();
              const writeProgress = (current, total) => {
                const pct = total > 0 ? Math.round((current / total) * 100) : 0;
                res.write(`data: ${JSON.stringify({ type: 'progress', current, total, percent: pct })}\n\n`);
              };
              const { addChannelWithShorts } = await import('./scripts/add-channel-with-shorts-api.js');
              const result = await addChannelWithShorts({ name: name || undefined, url, onProgress: writeProgress });
              res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
              res.end();
            } catch (e) {
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: String(e.message) }));
              } else {
                res.write(`data: ${JSON.stringify({ type: 'error', error: String(e.message) })}\n\n`);
                res.end();
              }
            }
            return;
          }
          if (req.url === '/api/update-channel-shorts' && req.method === 'POST') {
            const body = await new Promise((resolve, reject) => {
              const chunks = [];
              req.on('data', (c) => chunks.push(c));
              req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
              req.on('error', reject);
            });
            try {
              const { channelId } = JSON.parse(body || '{}');
              if (!channelId) throw new Error('channelId 필요');
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');
              res.flushHeaders?.();
              const writeProgress = (current, total) => {
                const pct = total > 0 ? Math.round((current / total) * 100) : 0;
                res.write(`data: ${JSON.stringify({ type: 'progress', current, total, percent: pct })}\n\n`);
              };
              const { updateChannelShorts } = await import('./scripts/update-channel-shorts-api.js');
              const result = await updateChannelShorts({ channelId, onProgress: writeProgress });
              res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
              res.end();
            } catch (e) {
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: String(e.message) }));
              } else {
                res.write(`data: ${JSON.stringify({ type: 'error', error: String(e.message) })}\n\n`);
                res.end();
              }
            }
            return;
          }
          if (req.url === '/api/delete-channel' && req.method === 'POST') {
            const body = await new Promise((resolve, reject) => {
              const chunks = [];
              req.on('data', (c) => chunks.push(c));
              req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
              req.on('error', reject);
            });
            try {
              const { channelId } = JSON.parse(body || '{}');
              const { deleteChannel } = await import('./scripts/delete-channel-api.js');
              const result = await deleteChannel({ channelId });
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: String(e.message) }));
            }
            return;
          }
          if (req.url === '/api/add-short-from-url' && req.method === 'POST') {
            const body = await new Promise((resolve, reject) => {
              const chunks = [];
              req.on('data', (c) => chunks.push(c));
              req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
              req.on('error', reject);
            });
            try {
              const { url } = JSON.parse(body || '{}');
              if (!url) throw new Error('url 필요');
              const { addShortFromUrl } = await import('./scripts/add-short-from-url-api.js');
              const result = await addShortFromUrl(url);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: String(e.message) }));
            }
            return;
          }
          if (req.url === '/api/add-from-url' && req.method === 'POST') {
            const body = await new Promise((resolve, reject) => {
              const chunks = [];
              req.on('data', (c) => chunks.push(c));
              req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
              req.on('error', reject);
            });
            try {
              const { url } = JSON.parse(body || '{}');
              if (!url) throw new Error('url 필요');
              const u = (url || '').trim();
              const isShorts = /youtube\.com\/(shorts\/|watch\?v=)[a-zA-Z0-9_-]{11}|youtu\.be\/[a-zA-Z0-9_-]{11}/.test(u);
              if (isShorts) {
                const { addShortFromUrl } = await import('./scripts/add-short-from-url-api.js');
                const result = await addShortFromUrl(url);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              } else {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.flushHeaders?.();
                const writeProgress = (current, total) => {
                  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
                  res.write(`data: ${JSON.stringify({ type: 'progress', current, total, percent: pct })}\n\n`);
                };
                const { addChannelWithShorts } = await import('./scripts/add-channel-with-shorts-api.js');
                const result = await addChannelWithShorts({ url, onProgress: writeProgress });
                res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
                res.end();
              }
            } catch (e) {
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: String(e.message) }));
              } else {
                res.write(`data: ${JSON.stringify({ type: 'error', error: String(e.message) })}\n\n`);
                res.end();
              }
            }
            return;
          }
    next();
  };
}

export default defineConfig({
  base: './',
  server: {
    open: !!process.env.DISPLAY, // Linux 헤드리스(SSH 등)에서 open 에러 방지
    port: 5173,
    host: true, // 같은 WiFi에서 스마트폰 접속 가능
    allowedHosts: true, // 터널(localtunnel 등) Host 헤더 400 에러 방지
    strictPort: false, // 포트 사용 중이면 다른 포트 시도
  },
  plugins: [
    {
      name: 'api-routes',
      configureServer(server) {
        server.middlewares.use(createApiMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(createApiMiddleware());
      },
    },
  ],
})
