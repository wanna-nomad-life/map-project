/**
 * 쇼츠 위치 지도 - YouTube 쇼츠 주소를 지도에 표시하는 앱
 */
import L from 'leaflet';
window.L = L;
import 'leaflet.markercluster';
import { buildPlaceCardHtml, buildDirectionsUrl, escapeHtml } from './lib/place-card.js';
import { parseSSEStream } from './lib/sse.js';
import { getLocationPoints, getShortsNearPlace } from './modules/shorts-location.js';

// ========== 지도 초기화 ==========
// Leaflet 기본 아이콘 경로 수정 (Webpack/Vite 번들링 시 필요)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// 지도 초기화 - 서울 중심 (터치 줌 명시적 활성화)
const map = L.map('map', {
  center: [37.5665, 126.978],
  zoom: 13,
  touchZoom: true,
  dragging: true,
});

// 타일 레이어 추가 (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

// 레이아웃 적용 후 지도 크기 재계산 (flex 레이아웃 대응)
function refreshMapSize() {
  map.invalidateSize();
}
setTimeout(refreshMapSize, 100);
window.addEventListener('resize', refreshMapSize);

// ========== GPS (내 위치) ==========
let myLocationMarker = null;
let hasUserLocation = false; // 시작 시 내 위치로 설정했는지

// 내 위치 아이콘 (파란색 원)
const myLocationIcon = L.divIcon({
  className: 'my-location-marker',
  html: '<div class="my-location-pulse"></div><div class="my-location-dot"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function updateGpsStatus(message, isError = false) {
  const statusEl = document.getElementById('gps-status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#dc3545' : '#198754';
  }
}

function showMyLocation(position) {
  const { latitude, longitude } = position.coords;

  // 기존 내 위치 마커 제거
  if (myLocationMarker) {
    map.removeLayer(myLocationMarker);
  }

  myLocationMarker = L.marker([latitude, longitude], { icon: myLocationIcon })
    .addTo(map)
    .bindPopup(`<b>내 위치</b><br>위도: ${latitude.toFixed(6)}<br>경도: ${longitude.toFixed(6)}`);

  map.setView([latitude, longitude], 16);
  updateGpsStatus(`위치: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
  hasUserLocation = true;
}

function handleGpsError(error) {
  const messages = {
    1: '위치 사용 권한이 거부되었습니다.',
    2: '위치를 찾을 수 없습니다.',
    3: '응답 시간이 초과되었습니다.',
  };
  updateGpsStatus(messages[error.code] || '오류가 발생했습니다.', true);
}

function getMyLocation() {
  const btn = document.getElementById('gps-btn');
  const statusEl = document.getElementById('gps-status');

  if (!navigator.geolocation) {
    updateGpsStatus('이 브라우저는 GPS를 지원하지 않습니다.', true);
    return;
  }

  btn.disabled = true;
  updateGpsStatus('위치를 가져오는 중...');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      showMyLocation(position);
      btn.disabled = false;
    },
    (error) => {
      handleGpsError(error);
      btn.disabled = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}

// GPS 버튼 이벤트
document.getElementById('gps-btn').addEventListener('click', getMyLocation);
const gpsBtnDesktop = document.getElementById('gps-btn-desktop');
if (gpsBtnDesktop) gpsBtnDesktop.addEventListener('click', getMyLocation);

// 시작 시 내 위치로 지도 초기화
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (position) => showMyLocation(position),
    () => { /* 권한 거부/실패 시 서울 기본값 유지 */ },
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
  );
}

// 홈 버튼 - 플레이어만 닫고 지도 위치는 유지
document.getElementById('home-btn').addEventListener('click', () => {
  closePlayer();
  refreshMapSize();
});

// 네비게이션 바
function setNavActive(id) {
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

document.getElementById('nav-menu-btn').addEventListener('click', () => {
  document.getElementById('sidebar-nav').classList.toggle('collapsed');
});

function showPage(page) {
  const subsPage = document.getElementById('subscriptions-page');
  const homePage = document.getElementById('home-page');
  if (page === 'subscriptions') {
    subsPage.classList.remove('page-hidden');
    homePage.classList.add('page-hidden');
    setTimeout(updateSubsSliderButtons, 50);
  } else {
    subsPage.classList.add('page-hidden');
    homePage.classList.remove('page-hidden');
    if (page === 'home') refreshMapSize();
  }
}

document.getElementById('nav-home').addEventListener('click', () => {
  showPage('home');
  document.getElementById('home-btn').click();
  setNavActive('nav-home');
});

document.getElementById('nav-shorts').addEventListener('click', () => {
  closePlayer();
  showPage('home');
  setNavActive('nav-shorts');
});

document.getElementById('nav-subscriptions').addEventListener('click', () => {
  showPage('subscriptions');
  setNavActive('nav-subscriptions');
});

document.getElementById('nav-mypage').addEventListener('click', () => {
  setNavActive('nav-mypage');
});

// ========== 쇼츠 데이터 ==========
let dbChannels = [];
let subscriptionsData = [];
let shortsData = [];
let subscribedChannelIds = new Set();
const USER_CHANNELS_KEY = 'creatorMap_userChannels';
const USER_CHANNEL_ID_START = 1000;

function loadUserChannels() {
  try {
    const raw = localStorage.getItem(USER_CHANNELS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUserChannels(channels) {
  localStorage.setItem(USER_CHANNELS_KEY, JSON.stringify(channels));
}

async function loadShortsDatabase() {
  try {
    const res = await fetch('/data/shorts.json?t=' + Date.now(), { cache: 'no-store' });
    const db = await res.json();
    dbChannels = db.channels || [];
    const userChannels = loadUserChannels();
    subscriptionsData = [...dbChannels, ...userChannels];
    shortsData = db.shorts || [];
    subscribedChannelIds = new Set(subscriptionsData.map((c) => c.id));
  } catch (err) {
    console.warn('쇼츠 DB 로드 실패, 기본 데이터 사용:', err);
    dbChannels = [{ id: 9, name: '뉴욕세끼', subs: '486만', initial: '뉴', color: '#e53935' }];
    subscriptionsData = [...dbChannels];
    shortsData = [];
    subscribedChannelIds = new Set([9]);
  }
}

let selectedSubsChannelId = null;

function getSubscribedShorts(channelId = null, searchQuery = '') {
  let list = shortsData.filter((s) => s.channelId && subscribedChannelIds.has(s.channelId));
  if (channelId) list = list.filter((s) => s.channelId === channelId);
  if (searchQuery) {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const channelNames = new Map(subscriptionsData.map((c) => [c.id, (c.name || '').toLowerCase()]));
      list = list.filter(
        (s) =>
          (s.title || '').toLowerCase().includes(q) ||
          (channelNames.get(s.channelId) || '').includes(q)
      );
    }
  }
  return list;
}

function renderSubsShorts(channelId = null) {
  const shortsEl = document.getElementById('subs-shorts-grid');
  if (!shortsEl) return;
  const searchQuery = document.getElementById('subs-search-input')?.value ?? '';
  const subsShorts = getSubscribedShorts(channelId, searchQuery).sort((a, b) => (b.growthRate ?? 0) - (a.growthRate ?? 0));
  shortsEl.innerHTML = subsShorts
      .map(
        (short) => {
          const vid = short.youtubeVideoId || '';
          const thumbUrl = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : '';
          return `
      <div class="short-card subs-short-card" data-id="${short.id}">
        <div class="short-thumbnail-wrap">
          ${thumbUrl ? `<img class="short-thumbnail" src="${thumbUrl}" alt="" loading="lazy">` : `<div class="short-placeholder" style="background: ${short.color}">▶</div>`}
        </div>
        <div class="short-info">
          <div class="short-title">${short.title}</div>
          <div class="short-views">조회수 ${short.views}</div>
        </div>
      </div>
    `;
        }
      )
      .join('');
}

function renderSubscriptions() {
  const channelsEl = document.getElementById('subs-channels');
  if (!channelsEl) return;

  const searchQuery = (document.getElementById('subs-search-input')?.value ?? '').trim().toLowerCase();
  const channelsToShow = searchQuery
    ? subscriptionsData.filter((ch) => (ch.name || '').toLowerCase().includes(searchQuery))
    : subscriptionsData;

  const channelCards = channelsToShow
    .map(
      (ch) => `
    <div class="subs-channel-card-wrap ${selectedSubsChannelId === ch.id ? 'selected' : ''}" data-id="${ch.id}">
      <button type="button" class="subs-channel-settings-btn" title="설정" aria-label="설정">⋮</button>
      <a href="#" class="subs-channel-card">
        <div class="subs-channel-avatar" style="background: ${ch.color}">${ch.initial}</div>
        <span class="subs-channel-name">${ch.name}</span>
        <span class="subs-channel-subs">구독자 ${ch.subs}</span>
      </a>
      <div class="subs-channel-menu hidden">
        <button type="button" class="subs-channel-menu-item" data-action="report">신고</button>
        <button type="button" class="subs-channel-menu-item" data-action="update">업데이트</button>
        <button type="button" class="subs-channel-menu-item" data-action="delete">삭제</button>
      </div>
    </div>
  `
    )
    .join('');

  channelsEl.innerHTML =
    channelCards +
    `
    <button type="button" class="subs-channel-add-btn" id="subs-add-channel-btn" title="채널 추가">
      <span class="subs-channel-add-icon">+</span>
      <span class="subs-channel-add-label">채널 추가</span>
    </button>
  `;

  document.getElementById('subs-add-channel-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openAddChannelModal();
  });

  renderSubsShorts(selectedSubsChannelId);
  setTimeout(updateSubsSliderButtons, 0);
}

function updateSubsSliderButtons() {
  const track = document.getElementById('subs-channels');
  const prevBtn = document.querySelector('.subs-slider-prev');
  const nextBtn = document.querySelector('.subs-slider-next');
  if (!track || !prevBtn || !nextBtn) return;
  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
  if (track.clientWidth === 0) return;
  prevBtn.disabled = track.scrollLeft <= 1;
  nextBtn.disabled = track.scrollLeft >= maxScroll - 1;
}

document.querySelector('.subs-slider-prev')?.addEventListener('click', () => {
  const track = document.getElementById('subs-channels');
  if (!track) return;
  const cardWidth = 130;
  track.scrollBy({ left: -cardWidth, behavior: 'smooth' });
  setTimeout(updateSubsSliderButtons, 300);
});

document.querySelector('.subs-slider-next')?.addEventListener('click', () => {
  const track = document.getElementById('subs-channels');
  if (!track) return;
  const cardWidth = 130;
  track.scrollBy({ left: cardWidth, behavior: 'smooth' });
  setTimeout(updateSubsSliderButtons, 300);
});

document.getElementById('subs-channels')?.addEventListener('scroll', updateSubsSliderButtons);

document.querySelectorAll('.subs-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.subs-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

document.getElementById('subs-search-input')?.addEventListener('input', () => {
  renderSubscriptions();
});

// 채널 추가 모달
let channelSearchDebounce = null;

function openAddChannelModal() {
  const modal = document.getElementById('add-channel-modal');
  const input = document.getElementById('add-channel-input');
  const urlInput = document.getElementById('add-url-input');
  const results = document.getElementById('add-channel-results');
  if (modal && input) {
    modal.classList.remove('hidden');
    input.value = '';
    if (urlInput) urlInput.value = '';
    if (results) results.innerHTML = '';
    if (urlInput) urlInput.focus();
  }
}

function isYouTubeUrl(text) {
  const t = (text || '').trim();
  return /youtube\.com\/(shorts\/[a-zA-Z0-9_-]{11}|@[\w-]+|channel\/[\w-]+|c\/[\w-]+)|youtu\.be\/[a-zA-Z0-9_-]{11}/.test(t);
}

async function addFromUrl(url) {
  const results = document.getElementById('add-channel-results');
  const urlInput = document.getElementById('add-url-input');
  if (!url || !isYouTubeUrl(url)) {
    alert('유효한 YouTube URL을 입력해 주세요. (채널 또는 쇼츠)');
    return;
  }

  if (results) {
    results.innerHTML = `
      <div class="shorts-collecting-wrap">
        <span class="shorts-collecting-text">가져오는 중</span>
        <div class="shorts-collecting-progress-wrap">
          <div class="shorts-collecting-progress-bar" style="width: 0%"></div>
        </div>
        <span class="shorts-collecting-percent">0%</span>
      </div>
    `;
  }

  const updateProgress = (percent) => {
    const bar = results?.querySelector('.shorts-collecting-progress-bar');
    const pctEl = results?.querySelector('.shorts-collecting-percent');
    if (bar) bar.style.width = `${percent}%`;
    if (pctEl) pctEl.textContent = `${percent}%`;
  };

  try {
    const res = await fetch('/api/add-from-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim() }),
    });
    const contentType = res.headers.get('Content-Type') || '';

    if (contentType.includes('text/event-stream') && res.body) {
      const ev = await parseSSEStream(res.body, updateProgress);
      const data = ev?.result;
      if (!data?.ok) throw new Error(data?.error || '채널 추가 실패');
      updateProgress(100);
      await loadShortsDatabase();
      renderShortMarkers();
      updateShortsByMap();
      renderSubscriptions();
      closeAddChannelModal();
      const n = data.shortsAdded ?? 0;
      alert(`채널 추가 완료. 주소 정보가 있는 쇼츠 ${n}개가 추가되었습니다.`);
    } else {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '요청 실패');
      if (!data.ok) {
        if (data.alreadyExists) {
          alert('이미 추가된 영상입니다.');
        } else {
          throw new Error(data.error || '추가 실패');
        }
        if (urlInput) urlInput.value = '';
        if (results) results.innerHTML = '';
        return;
      }
      updateProgress(100);
      await loadShortsDatabase();
      renderShortMarkers();
      updateShortsByMap();
      renderSubscriptions();
      closeAddChannelModal();
      alert(`쇼츠 "${data.short?.title || ''}" 추가 완료.`);
    }
  } catch (err) {
    if (results) {
      results.innerHTML = `<p class="channel-search-empty">오류: ${(err.message || '추가 실패').replace(/</g, '&lt;')}</p>`;
    }
    alert(err.message || '추가 중 오류가 발생했습니다.');
  }
}

function closeAddChannelModal() {
  const modal = document.getElementById('add-channel-modal');
  if (modal) modal.classList.add('hidden');
}

async function searchChannelsFromApi(query) {
  if (!query || query.trim().length < 2) return [];
  try {
    const res = await fetch(`/api/search-channels?q=${encodeURIComponent(query.trim())}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    return data.channels || [];
  } catch {
    return [];
  }
}

function renderChannelSearchResults(channels) {
  const results = document.getElementById('add-channel-results');
  if (!results) return;
  if (!channels || channels.length === 0) {
    results.innerHTML = '<p class="channel-search-empty">검색 결과가 없습니다.</p>';
    return;
  }
  results.innerHTML = channels
    .map(
      (ch) => `
    <button type="button" class="channel-search-item" data-name="${(ch.name || '').replace(/"/g, '&quot;')}" data-url="${(ch.url || '').replace(/"/g, '&quot;')}">
      ${ch.thumbnail ? `<img src="${ch.thumbnail}" alt="" class="channel-search-thumb">` : '<div class="channel-search-thumb channel-search-thumb-placeholder">?</div>'}
      <div class="channel-search-info">
        <span class="channel-search-name">${(ch.name || '').replace(/</g, '&lt;')}</span>
        ${ch.subscribers ? `<span class="channel-search-subs">${ch.subscribers}</span>` : ''}
      </div>
    </button>
  `
    )
    .join('');
  results.querySelectorAll('.channel-search-item').forEach((btn) => {
    btn.onclick = () => selectChannelFromSearch(btn.dataset.name, btn.dataset.url);
  });
}

async function selectChannelFromSearch(name, url) {
  const existing = subscriptionsData.find(
    (c) => c.name?.toLowerCase() === name?.toLowerCase() || (c.url && c.url.includes(name))
  );
  if (existing) {
    alert(`"${name}" 채널은 이미 추가되어 있습니다.`);
    return;
  }

  const results = document.getElementById('add-channel-results');
  if (results) {
    results.innerHTML = `
      <div class="shorts-collecting-wrap">
        <span class="shorts-collecting-text">수집 중</span>
        <div class="shorts-collecting-progress-wrap">
          <div class="shorts-collecting-progress-bar" style="width: 0%"></div>
        </div>
        <span class="shorts-collecting-percent">0%</span>
      </div>
    `;
  }

  const updateProgress = (percent) => {
    const bar = results?.querySelector('.shorts-collecting-progress-bar');
    const pctEl = results?.querySelector('.shorts-collecting-percent');
    if (bar) bar.style.width = `${percent}%`;
    if (pctEl) pctEl.textContent = `${percent}%`;
  };

  try {
    const res = await fetch('/api/add-channel-with-shorts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url }),
    });
    let data = null;
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('text/event-stream') && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
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
              if (ev.type === 'progress') updateProgress(ev.percent ?? 0);
              else if (ev.type === 'done') data = ev.result;
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
          if (ev.type === 'done') data = ev.result;
          else if (ev.type === 'error') throw new Error(ev.error);
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
        }
      }
    } else {
      data = await res.json().catch(() => ({}));
    }
    if (!res.ok) throw new Error(data?.error || '요청 실패');

    if (!data.ok) {
      throw new Error(data.error || '채널 추가 실패');
    }

    updateProgress(100);
    await loadShortsDatabase();
    renderShortMarkers();
    updateShortsByMap();
    renderSubscriptions();
    closeAddChannelModal();
    const n = data.shortsAdded ?? 0;
    alert(`채널 "${name}" 추가 완료. 주소 정보가 있는 쇼츠 ${n}개가 추가되었습니다.`);
  } catch (err) {
    if (results) {
      results.innerHTML = `<p class="channel-search-empty">오류: ${(err.message || '채널 추가 실패').replace(/</g, '&lt;')}. 검색창에서 다시 검색해 보세요.</p>`;
    }
    alert(err.message || '채널 추가 중 오류가 발생했습니다.');
  }
}

async function updateChannelShorts(channelId, channelName) {
  const overlay = document.getElementById('update-channel-overlay');
  const bar = document.getElementById('update-progress-bar');
  const pctEl = document.getElementById('update-progress-percent');
  const updateProgress = (percent) => {
    if (bar) bar.style.width = `${percent}%`;
    if (pctEl) pctEl.textContent = `${percent}%`;
  };

  if (overlay) overlay.classList.remove('hidden');
  updateProgress(0);

  try {
    const res = await fetch('/api/update-channel-shorts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
    });
    let data = null;
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('text/event-stream') && res.body) {
      const ev = await parseSSEStream(res.body, updateProgress);
      data = ev?.result;
    } else {
      data = await res.json().catch(() => ({}));
    }
    if (!data?.ok) throw new Error(data?.error || '업데이트 실패');
    updateProgress(100);
    await loadShortsDatabase();
    renderShortMarkers();
    updateShortsByMap();
    renderSubscriptions();
    const n = data.shortsAdded ?? 0;
    alert(`"${channelName}" 채널 업데이트 완료. 새 쇼츠 ${n}개가 추가되었습니다.`);
  } catch (err) {
    alert(err.message || '채널 업데이트에 실패했습니다.');
  } finally {
    if (overlay) overlay.classList.add('hidden');
  }
}

async function deleteChannel(channelId) {
  const userChannels = loadUserChannels();
  const isUserChannel = userChannels.some((c) => c.id === channelId);
  if (isUserChannel) {
    saveUserChannels(userChannels.filter((c) => c.id !== channelId));
  } else {
    try {
      const res = await fetch('/api/delete-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || '삭제 실패');
    } catch (err) {
      alert(err.message || '채널 삭제에 실패했습니다. (개발 서버에서만 삭제 가능)');
      return;
    }
  }
  subscribedChannelIds.delete(channelId);
  if (selectedSubsChannelId === channelId) selectedSubsChannelId = null;
  await loadShortsDatabase();
  renderShortMarkers();
  updateShortsByMap();
  renderSubscriptions();
}

function addUserChannel(name, url) {
  const userChannels = loadUserChannels();
  const maxId = Math.max(USER_CHANNEL_ID_START - 1, ...userChannels.map((c) => c.id || 0));
  const initial = (name || '?').charAt(0);
  const colors = ['#e53935', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4'];
  const color = colors[userChannels.length % colors.length];
  const newChannel = {
    id: maxId + 1,
    name,
    subs: '조회수 확인 필요',
    initial,
    color,
    youtubeChannelId: `channel_${maxId + 1}`,
    url: url || `https://www.youtube.com/@${name}`,
  };
  userChannels.push(newChannel);
  saveUserChannels(userChannels);
  subscriptionsData = [...dbChannels, ...userChannels];
  subscribedChannelIds.add(newChannel.id);
  renderSubscriptions();
}

function onAddChannelInput() {
  const input = document.getElementById('add-channel-input');
  const results = document.getElementById('add-channel-results');
  const q = (input?.value || '').trim();
  if (channelSearchDebounce) clearTimeout(channelSearchDebounce);
  if (q.length < 2) {
    if (results) results.innerHTML = '';
    return;
  }
  results.innerHTML = '<p class="channel-search-loading">검색 중...</p>';
  channelSearchDebounce = setTimeout(async () => {
    const channels = await searchChannelsFromApi(q);
    renderChannelSearchResults(channels);
  }, 400);
}

document.getElementById('add-channel-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'add-channel-modal') closeAddChannelModal();
});
document.querySelector('.modal-btn-cancel')?.addEventListener('click', closeAddChannelModal);
document.getElementById('add-channel-input')?.addEventListener('input', onAddChannelInput);
document.getElementById('add-url-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const url = document.getElementById('add-url-input')?.value?.trim();
    if (url) addFromUrl(url);
  }
});
document.getElementById('add-url-btn')?.addEventListener('click', () => {
  const url = document.getElementById('add-url-input')?.value?.trim();
  if (url) addFromUrl(url);
});


let currentPlayingShort = null;

function playShort(short, fromMap = false) {
  const player = document.getElementById('shorts-player');
  const iframe = document.getElementById('player-iframe');
  const titleEl = document.getElementById('player-title');
  const viewsEl = document.getElementById('player-views');
  const ytLink = document.getElementById('player-yt-link');
  const mapBtn = document.getElementById('player-show-map-btn');
  const app = document.getElementById('app');

  if (!player || !iframe) return;

  currentPlayingShort = short;

  const videoId = short.youtubeVideoId || short.videoUrl?.match(/(?:shorts\/|v=)([a-zA-Z0-9_-]{11})/)?.[1];
  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1`
    : '';

  app.classList.add('player-open');
  app.classList.remove('player-expanded');
  document.body.classList.remove('player-expanded-mobile');
  if (window.innerWidth <= 768) {
    document.body.classList.add('player-open-mobile');
    app.classList.toggle('player-from-map', fromMap);
    if (fromMap) {
      showPage('home');
      const shortsSection = document.getElementById('shorts-section');
      if (shortsSection) shortsSection.classList.add('shorts-collapsed');
    } else {
      app.classList.add('player-expanded');
      document.body.classList.add('player-expanded-mobile');
    }
  } else {
    app.classList.remove('player-from-map');
  }
  player.classList.remove('hidden');
  const expandBtn = document.getElementById('player-expand-btn');
  if (expandBtn) expandBtn.textContent = '⛶ 전체 창으로 보기';
  iframe.src = embedUrl;
  titleEl.textContent = short.title;
  viewsEl.textContent = `조회수 ${short.views}`;
  ytLink.href = videoId ? `https://www.youtube.com/shorts/${videoId}` : '#';
  ytLink.style.display = videoId ? 'inline' : 'none';

  const hasLocation = getLocationPoints(short).length > 0;
  if (mapBtn) {
    mapBtn.classList.toggle('hidden', !hasLocation);
  }

  document.querySelectorAll('.short-card').forEach((el) => el.classList.remove('selected'));
  const card = document.querySelector(`.short-card[data-id="${short.id}"]`);
  if (card) card.classList.add('selected');

  // 영상 속 장소로 지도 이동 (해당 쇼츠 위치만 표시)
  if (hasLocation) {
    showShortOnMap(short);
  } else {
    // 위치 없는 쇼츠: 전체 마커 복원
    if (shortLocationMarker) {
      if (Array.isArray(shortLocationMarker)) shortLocationMarker.forEach((m) => map.removeLayer(m));
      else map.removeLayer(shortLocationMarker);
      shortLocationMarker = null;
    }
    if (shortMarkersLayer && !map.hasLayer(shortMarkersLayer)) shortMarkersLayer.addTo(map);
  }

  refreshMapSize();
  if (window.innerWidth <= 768 && fromMap) setTimeout(refreshMapSize, 100);
}

function closePlayer() {
  currentPlayingShort = null;
  const player = document.getElementById('shorts-player');
  const iframe = document.getElementById('player-iframe');
  const app = document.getElementById('app');
  const homePage = document.getElementById('home-page');
  if (player && iframe) {
    iframe.src = '';
    player.classList.add('hidden');
    app.classList.remove('player-open', 'player-expanded', 'player-from-map');
    document.body.classList.remove('player-open-mobile', 'player-expanded-mobile');
    if (homePage && player.parentElement === document.body) {
      homePage.appendChild(player);
    }
  }
  document.querySelectorAll('.short-card').forEach((el) => el.classList.remove('selected'));
  // 쇼츠 선택 해제 시 전체 마커 다시 표시
  if (shortLocationMarker) {
    if (Array.isArray(shortLocationMarker)) {
      shortLocationMarker.forEach((m) => map.removeLayer(m));
    } else {
      map.removeLayer(shortLocationMarker);
    }
    shortLocationMarker = null;
  }
  if (shortMarkersLayer && !map.hasLayer(shortMarkersLayer)) {
    shortMarkersLayer.addTo(map);
  }
  refreshMapSize();
}

let selectedPlaceFilter = null; // { lat, lng, name } | null

function getShortsNearPlaceFilter(lat, lng, name) {
  return getShortsNearPlace(shortsData, lat, lng, name);
}

function renderShorts(filter = '', mapCenter = null, placeFilter = null) {
  const listEl = document.getElementById('shorts-list');
  const listHeader = document.getElementById('shorts-list-header');
  if (!listEl) return;

  let filtered = [...shortsData];

  // 위치/검색 기준 관련 쇼츠 필터링
  if (placeFilter && placeFilter.lat != null && placeFilter.lng != null) {
    filtered = getShortsNearPlaceFilter(placeFilter.lat, placeFilter.lng, placeFilter.name);
    if (listHeader) {
      const textEl = listHeader.querySelector('.shorts-list-header-text');
      if (textEl) textEl.textContent = `"${placeFilter.name}" 관련 쇼츠 (${filtered.length}개)`;
      listHeader.style.display = 'flex';
      const clearBtn = listHeader.querySelector('.place-filter-clear');
      if (clearBtn) clearBtn.onclick = () => {
        selectedPlaceFilter = null;
        listHeader.style.display = 'none';
        updateShortsByMap();
      };
    }
  } else if (listHeader) {
    listHeader.style.display = 'none';
  }

  const query = filter.trim().toLowerCase();
  if (query) {
    filtered = filtered.filter((s) => s.title.toLowerCase().includes(query));
  }

  // 지도 중심 기준으로 해당 지역 쇼츠만 필터링 (위치 필터 없을 때만)
  if (!placeFilter && mapCenter && filtered.length > 0) {
    const bounds = map.getBounds();
    const inBounds = filtered.filter((s) => {
      const pts = getLocationPoints(s);
      return pts.some((p) => bounds.contains([p.lat, p.lng]));
    });
    filtered = inBounds.length > 0 ? inBounds : filtered;
  }

  // 인기 급상승 순 정렬 (조회수 상승률 높은 순)
  filtered.sort((a, b) => (b.growthRate ?? 0) - (a.growthRate ?? 0));

  listEl.innerHTML = filtered
    .map(
      (short) => {
        const vid = short.youtubeVideoId || '';
        const thumbUrl = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : '';
        return `
    <div class="short-card" data-id="${short.id}">
      <div class="short-thumbnail-wrap">
        ${thumbUrl ? `<img class="short-thumbnail" src="${thumbUrl}" alt="" loading="lazy">` : `<div class="short-placeholder" style="background: ${short.color}">▶</div>`}
      </div>
      <div class="short-info">
        <div class="short-meta">
          <div class="short-title">${short.title}</div>
          <button class="short-map-btn" data-id="${short.id}" type="button" title="지도에서 위치 보기">🗺️</button>
        </div>
        <div class="short-views">조회수 ${short.views}</div>
      </div>
    </div>
  `;
      }
    )
    .join('');
}

document.getElementById('close-player').addEventListener('click', closePlayer);

const homePage = document.getElementById('home-page');
document.getElementById('player-expand-btn')?.addEventListener('click', () => {
  const app = document.getElementById('app');
  const expandBtn = document.getElementById('player-expand-btn');
  const player = document.getElementById('shorts-player');
  if (!app || !expandBtn || !player) return;
  const willExpand = !app.classList.contains('player-expanded');
  if (willExpand) {
    document.body.classList.add('player-expanded-mobile');
    app.classList.add('player-expanded');
    if (window.innerWidth <= 768 && homePage) {
      document.body.appendChild(player);
    }
  } else {
    app.classList.remove('player-expanded');
    document.body.classList.remove('player-expanded-mobile');
    if (window.innerWidth <= 768 && homePage) {
      homePage.appendChild(player);
    }
    if (!app.classList.contains('player-from-map')) app.classList.add('player-from-map');
  }
  expandBtn.textContent = willExpand ? '⊟ 축소' : '⛶ 전체 창으로 보기';
  refreshMapSize();
});

document.getElementById('player-show-map-btn')?.addEventListener('click', () => {
  const short = currentPlayingShort;
  if (!short || getLocationPoints(short).length === 0) return;
  closePlayer();
  if (window.innerWidth <= 768 && typeof window.showMapFullScreen === 'function') {
    window.showMapFullScreen();
  }
  showShortOnMap(short);
});

function updateShortsByMap() {
  const searchQuery = document.getElementById('shorts-search-input')?.value ?? '';
  renderShorts(searchQuery, true, selectedPlaceFilter);
}

async function initApp() {
  await loadShortsDatabase();
  renderShortMarkers();
  updateShortsByMap();
  renderSubscriptions();
}
map.on('moveend', updateShortsByMap);
map.on('popupopen', (e) => {
  const popupEl = e.popup.getElement();
  const playBtn = popupEl?.querySelector('.place-card-play-btn');
  if (playBtn) {
    playBtn.onclick = () => {
      const id = parseInt(playBtn.dataset.id, 10);
      const short = shortsData.find((s) => s.id === id);
      if (short) {
        map.closePopup();
        playShort(short, true);
      }
    };
  }
  const relatedBtn = popupEl?.querySelector('.place-card-related-btn');
  if (relatedBtn) {
    relatedBtn.onclick = () => {
      const lat = parseFloat(relatedBtn.dataset.lat);
      const lng = parseFloat(relatedBtn.dataset.lng);
      const name = relatedBtn.dataset.name || '이 장소';
      showRelatedShortsAtPlace(lat, lng, name);
    };
  }
});

function showRelatedShortsAtPlace(lat, lng, name) {
  selectedPlaceFilter = { lat, lng, name };
  const searchQuery = document.getElementById('shorts-search-input')?.value ?? '';
  renderShorts(searchQuery, null, selectedPlaceFilter);
  if (window.innerWidth <= 768 && typeof window.showShortsFullScreen === 'function') {
    window.showShortsFullScreen();
  }
  showPage('home');
}
initApp();

document.getElementById('subscriptions-page').addEventListener('click', (e) => {
  const settingsBtn = e.target.closest('.subs-channel-settings-btn');
  const menuItem = e.target.closest('.subs-channel-menu-item');

  if (settingsBtn) {
    e.preventDefault();
    e.stopPropagation();
    const wrap = settingsBtn.closest('.subs-channel-card-wrap');
    if (!wrap) return;
    const menu = wrap.querySelector('.subs-channel-menu');
    const isOpen = menu && !menu.classList.contains('hidden');
    document.querySelectorAll('.subs-channel-menu').forEach((m) => m.classList.add('hidden'));
    if (menu && !isOpen) menu.classList.remove('hidden');
    return;
  }

  if (menuItem) {
    e.preventDefault();
    e.stopPropagation();
    const wrap = menuItem.closest('.subs-channel-card-wrap');
    if (!wrap) return;
    const id = parseInt(wrap.dataset.id, 10);
    const action = menuItem.dataset.action;
    const channel = subscriptionsData.find((c) => c.id === id);
    if (!channel) return;
    wrap.querySelector('.subs-channel-menu')?.classList.add('hidden');
    if (action === 'report') {
      alert(`"${channel.name}" 채널 신고가 접수되었습니다. 검토 후 조치하겠습니다.`);
    } else if (action === 'update') {
      updateChannelShorts(id, channel.name);
    } else if (action === 'delete') {
      if (!confirm(`"${channel.name}" 채널을 삭제하시겠습니까?`)) return;
      deleteChannel(id);
    }
    return;
  }

  document.querySelectorAll('.subs-channel-menu').forEach((m) => m.classList.add('hidden'));

  const channelCard = e.target.closest('.subs-channel-card');
  if (channelCard) {
    e.preventDefault();
    const wrap = channelCard.closest('.subs-channel-card-wrap');
    const id = wrap ? parseInt(wrap.dataset.id, 10) : null;
    if (id != null) {
      selectedSubsChannelId = selectedSubsChannelId === id ? null : id;
      renderSubscriptions();
    }
    return;
  }

  const card = e.target.closest('.subs-short-card');
  if (!card) return;
  const id = parseInt(card.dataset.id, 10);
  const short = shortsData.find((s) => s.id === id);
  if (short) {
    showPage('home');
    playShort(short);
  }
});

// 쇼츠 클릭 (이벤트 위임)
document.getElementById('shorts-container').addEventListener('click', (e) => {
  const mapBtn = e.target.closest('.short-map-btn');
  if (mapBtn) {
    e.stopPropagation();
    const id = parseInt(mapBtn.dataset.id, 10);
    const short = shortsData.find((s) => s.id === id);
    if (short) {
      if (getLocationPoints(short).length > 0) {
        showShortOnMap(short);
      } else {
        alert('이 쇼츠의 장소 정보가 없습니다.');
      }
    }
    return;
  }

  const card = e.target.closest('.short-card');
  if (!card) return;

  const id = parseInt(card.dataset.id, 10);
  const short = shortsData.find((s) => s.id === id);
  if (short) playShort(short);
});

// ========== 쇼츠 위치 지도 마커 ==========
let shortMarkersLayer = null;
let shortLocationMarker = null; // 선택된 마커 하이라이트용
let lastShownShort = null;

function updateLocationInfo(data) {
  const panel = document.getElementById('map-location-info');
  if (!panel) return;
  if (!data) {
    panel.classList.remove('has-content');
    panel.innerHTML = '<p class="map-location-placeholder">지도 마커를 클릭하거나 장소를 검색하면 쇼츠 위치 정보가 표시됩니다.</p>';
    return;
  }
  panel.classList.add('has-content');
  if (data.type === 'short') {
    const placeName = data.placeName || data.place || '';
    const mainTitle = placeName || data.title;
    const subTitle = placeName ? data.title : '';
    const displayAddress = data.locationText || (data.placeName && /,|Rd|St|Chome|丁目|区|City|Thailand|Japan/.test(data.placeName) ? data.placeName : null) || data.address;
    const dirUrl = buildDirectionsUrl(data);
    const playBtn = data.id != null ? `<button type="button" class="location-btn location-btn-play" data-id="${data.id}">▶ 영상 보기</button>` : '';
    const locName = placeName || data.locationText || data.place || '이 장소';
    const relatedBtn =
      data.lat != null && data.lng != null
        ? `<button type="button" class="location-btn location-btn-related" data-lat="${data.lat}" data-lng="${data.lng}" data-name="${escapeHtml(locName)}">📋 관련 영상보기</button>`
        : '';
    panel.innerHTML = `
      <div class="location-card">
        <div class="location-title">${mainTitle}</div>
        ${subTitle ? `<div class="location-place">${subTitle}</div>` : ''}
        ${displayAddress ? `<div class="location-address">${displayAddress}</div>` : ''}
        <div class="location-actions">
          ${playBtn}
          ${relatedBtn}
          <a href="${dirUrl}" target="_blank" rel="noopener" class="location-btn location-btn-directions">🚗 길찾기</a>
          <span class="location-meta">조회수 ${data.views}</span>
        </div>
      </div>
    `;
    const playEl = panel.querySelector('.location-btn-play');
    if (playEl) {
      playEl.onclick = () => {
        const short = shortsData.find((s) => s.id === parseInt(playEl.dataset.id, 10));
        if (short) playShort(short, true);
      };
    }
    const relatedEl = panel.querySelector('.location-btn-related');
    if (relatedEl) {
      relatedEl.onclick = () => {
        const lat = parseFloat(relatedEl.dataset.lat);
        const lng = parseFloat(relatedEl.dataset.lng);
        const name = relatedEl.dataset.name || '이 장소';
        showRelatedShortsAtPlace(lat, lng, name);
      };
    }
  } else {
    const dirUrl = buildDirectionsUrl(data);
    const relatedBtn =
      data.lat != null && data.lng != null
        ? `<button type="button" class="location-btn location-btn-related" data-lat="${data.lat}" data-lng="${data.lng}" data-name="${escapeHtml(data.name || '이 장소')}">📋 관련 영상보기</button>`
        : '';
    panel.innerHTML = `
      <div class="location-card">
        <div class="location-title">${data.name}</div>
        ${data.address ? `<div class="location-address">${data.address}</div>` : ''}
        <div class="location-actions">
          ${relatedBtn}
          <a href="${dirUrl}" target="_blank" rel="noopener" class="location-btn location-btn-directions">🚗 길찾기</a>
          <span class="location-meta">위도 ${data.lat.toFixed(4)}, 경도 ${data.lng.toFixed(4)}</span>
        </div>
      </div>
    `;
    const relatedEl = panel.querySelector('.location-btn-related');
    if (relatedEl) {
      relatedEl.onclick = () => {
        const lat = parseFloat(relatedEl.dataset.lat);
        const lng = parseFloat(relatedEl.dataset.lng);
        const name = relatedEl.dataset.name || '이 장소';
        showRelatedShortsAtPlace(lat, lng, name);
      };
    }
  }
}

function renderShortMarkers() {
  if (shortMarkersLayer) map.removeLayer(shortMarkersLayer);
  shortMarkersLayer = L.markerClusterGroup({ maxClusterRadius: 50 });
  const allPoints = [];
  shortsData.forEach((short) => {
    const points = getLocationPoints(short);
    points.forEach((pt) => {
      allPoints.push([pt.lat, pt.lng]);
      const m = L.marker([pt.lat, pt.lng])
        .bindPopup(buildPlaceCardHtml(pt), { className: 'place-card-popup', maxWidth: 280 });
      m.on('click', () => {
        lastShownShort = short;
        selectedPlaceFilter = { lat: pt.lat, lng: pt.lng, name: pt.placeName || pt.place || pt.locationText || '이 장소' };
        updateLocationInfo({ type: 'short', ...pt });
        map.setView([pt.lat, pt.lng], 16);
        updateShortsByMap();
      });
      shortMarkersLayer.addLayer(m);
    });
  });
  shortMarkersLayer.addTo(map);
  // 내 위치로 시작했으면 fitBounds로 덮어쓰지 않음
  if (allPoints.length > 0 && !hasUserLocation) {
    const bounds = L.latLngBounds(allPoints);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
  }
  refreshMapSize();
}

function showShortOnMap(short) {
  // 선택된 쇼츠만 표시: 전체 마커 레이어 숨기고, 해당 쇼츠 위치만 표시
  if (shortMarkersLayer && map.hasLayer(shortMarkersLayer)) {
    map.removeLayer(shortMarkersLayer);
  }
  if (shortLocationMarker) {
    if (Array.isArray(shortLocationMarker)) {
      shortLocationMarker.forEach((m) => map.removeLayer(m));
    } else {
      map.removeLayer(shortLocationMarker);
    }
    shortLocationMarker = null;
  }
  const points = getLocationPoints(short);
  if (points.length === 0) return;
  const first = points[0];
  if (points.length === 1) {
    shortLocationMarker = L.circleMarker([first.lat, first.lng], {
      radius: 12,
      color: '#ff0000',
      fillColor: '#ff0000',
      fillOpacity: 0.3,
      weight: 2,
    })
      .addTo(map)
      .bindPopup(buildPlaceCardHtml(first), { className: 'place-card-popup', maxWidth: 280 })
      .openPopup();
    map.setView([first.lat, first.lng], 16);
  } else {
    shortLocationMarker = [];
    const group = L.featureGroup();
    points.forEach((pt, i) => {
      const cm = L.circleMarker([pt.lat, pt.lng], {
        radius: 10,
        color: '#ff0000',
        fillColor: '#ff0000',
        fillOpacity: 0.3,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(buildPlaceCardHtml(pt), { className: 'place-card-popup', maxWidth: 280 });
      shortLocationMarker.push(cm);
      group.addLayer(cm);
    });
    map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 14 });
    shortLocationMarker[0].openPopup();
  }
  lastShownShort = short;
  selectedPlaceFilter = { lat: first.lat, lng: first.lng, name: first.placeName || first.place || first.locationText || '이 장소' };
  updateLocationInfo({ type: 'short', title: short.title, place: first.place, placeName: first.placeName, address: first.address, locationText: first.locationText, views: short.views, lat: first.lat, lng: first.lng });
  updateShortsByMap();
  refreshMapSize();
}

// ========== 장소 검색 (지역 + 쇼츠에 표시된 주소) ==========
const placesDataBase = [
  { name: '서울', lat: 37.5665, lng: 126.978, address: '대한민국 서울특별시' },
  { name: '서울 시청', lat: 37.5665, lng: 126.978, address: '서울특별시 중구 세종대로 110' },
  { name: '명동', lat: 37.5605, lng: 126.9855, address: '서울특별시 중구 명동' },
  { name: '경복궁', lat: 37.5796, lng: 126.977, address: '서울특별시 종로구 사직로 161' },
  { name: '한강', lat: 37.5242, lng: 126.9645, address: '서울특별시 영등포구 여의도동' },
  { name: '한강공원', lat: 37.5242, lng: 126.9645, address: '서울특별시 영등포구 여의도동' },
  { name: '인사동', lat: 37.5722, lng: 126.986, address: '서울특별시 종로구 인사동' },
  { name: '남산', lat: 37.5512, lng: 126.9882, address: '서울특별시 용산구 남산공원로 105' },
  { name: '남산타워', lat: 37.5512, lng: 126.9882, address: '서울특별시 용산구 남산공원로 105' },
  { name: '성수동', lat: 37.5447, lng: 127.0557, address: '서울특별시 성동구 성수동' },
  { name: '홍대', lat: 37.5563, lng: 126.9225, address: '서울특별시 마포구 홍익로' },
  { name: '연남동', lat: 37.5640, lng: 126.9226, address: '서울특별시 마포구 연남동' },
  { name: '합정', lat: 37.5478, lng: 126.9096, address: '서울특별시 마포구 합정동' },
  { name: '서촌', lat: 37.5780, lng: 126.9700, address: '서울특별시 종로구 서촌' },
  { name: '잠실', lat: 37.5132, lng: 127.1001, address: '서울특별시 송파구 잠실동' },
  { name: '강남', lat: 37.4979, lng: 127.0276, address: '서울특별시 강남구' },
  { name: '가로수길', lat: 37.5230, lng: 127.0270, address: '서울특별시 강남구 신사동 가로수길' },
  { name: '부산', lat: 35.1796, lng: 129.0756, address: '부산광역시' },
  { name: '해운대', lat: 35.1587, lng: 129.1604, address: '부산광역시 해운대구 해운대해변로 264' },
  { name: '광안리', lat: 35.1538, lng: 129.1187, address: '부산광역시 수영구 광안해변로 219' },
  { name: '대구', lat: 35.8714, lng: 128.6014, address: '대구광역시' },
  { name: '인천', lat: 37.4563, lng: 126.7052, address: '인천광역시' },
  { name: '대전', lat: 36.3504, lng: 127.3845, address: '대전광역시' },
  { name: '광주', lat: 35.1601, lng: 126.8516, address: '광주광역시' },
  { name: '제주', lat: 33.4996, lng: 126.5312, address: '제주특별자치도 제주시' },
  { name: '제주도', lat: 33.4996, lng: 126.5312, address: '제주특별자치도 제주시' },
  { name: '뉴욕', lat: 40.7128, lng: -74.006, address: 'New York, NY, USA' },
  { name: '뉴욕 맨해튼', lat: 40.7484, lng: -73.9857, address: 'Manhattan, New York, NY 10001' },
  { name: '뉴욕 코리아타운', lat: 40.7478, lng: -73.9869, address: 'W 32nd St (Korea Way), New York, NY 10001' },
  { name: 'Five Senses (오감)', lat: 40.7476289, lng: -73.9861323, address: '9 W 32nd St, New York, NY 10001' },
  { name: '오감', lat: 40.7476289, lng: -73.9861323, address: '9 W 32nd St, New York, NY 10001' },
  { name: '9 W 32nd St', lat: 40.7476289, lng: -73.9861323, address: '9 W 32nd St, New York, NY 10001' },
];

/** 지도에 표시된 쇼츠 장소들을 검색 데이터에 추가 */
function buildSearchablePlaces() {
  const seen = new Set();
  const list = [...placesDataBase];
  for (const short of shortsData) {
    const points = getLocationPoints(short);
    for (const pt of points) {
      const names = [pt.placeName, pt.place, pt.locationText].filter((n) => n && n.length >= 2);
      for (const name of names) {
        const key = `${name.toLowerCase()}|${pt.lat.toFixed(4)}|${pt.lng.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({
          name,
          lat: pt.lat,
          lng: pt.lng,
          address: pt.address || pt.locationText || '',
        });
      }
    }
  }
  return list;
}

let placeSearchMarker = null;

function searchMapPlace(query) {
  const q = query.trim().toLowerCase();
  if (q === '') {
    if (placeSearchMarker) {
      map.removeLayer(placeSearchMarker);
      placeSearchMarker = null;
    }
    selectedPlaceFilter = null;
    updateLocationInfo(lastShownShort ? { type: 'short', ...lastShownShort } : null);
    updateShortsByMap();
    return;
  }
  const placesData = buildSearchablePlaces();
  const place = placesData.find(
    (p) => p.name.toLowerCase().includes(q) || (p.address && p.address.toLowerCase().includes(q))
  );
  if (place) {
    if (placeSearchMarker) map.removeLayer(placeSearchMarker);
    selectedPlaceFilter = { lat: place.lat, lng: place.lng, name: place.name };
    const popupHtml = buildPlaceCardHtml(
      { ...place, placeName: place.name, place: place.name, title: place.name },
      { showPlayBtn: false }
    );
    placeSearchMarker = L.marker([place.lat, place.lng])
      .addTo(map)
      .bindPopup(popupHtml, { className: 'place-card-popup', maxWidth: 280 })
      .openPopup();
    map.setView([place.lat, place.lng], 15);
    updateLocationInfo(place);
    refreshMapSize();
    updateShortsByMap();
  } else {
    alert(`"${query}" 검색 결과가 없습니다.\n\n지역명(서울, 성수동, 홍대 등) 또는 지도에 표시된 장소명을 검색해 보세요.`);
  }
}

function onMapSearchKeydown(e) {
  if (e.key === 'Enter') searchMapPlace(e.target.value);
}
function onMapSearchInput(e) {
  if (e.target.value.trim() === '' && (selectedPlaceFilter || placeSearchMarker)) {
    selectedPlaceFilter = null;
    if (placeSearchMarker) {
      map.removeLayer(placeSearchMarker);
      placeSearchMarker = null;
    }
    updateLocationInfo(lastShownShort ? { type: 'short', ...lastShownShort } : null);
    updateShortsByMap();
  }
}
document.getElementById('map-search-input').addEventListener('keydown', onMapSearchKeydown);
document.getElementById('map-search-input').addEventListener('input', onMapSearchInput);
const mapSearchDesktop = document.getElementById('map-search-input-desktop');
if (mapSearchDesktop) {
  mapSearchDesktop.addEventListener('keydown', onMapSearchKeydown);
  mapSearchDesktop.addEventListener('input', onMapSearchInput);
}

// 모바일 카테고리 칩 (쇼츠/장소/내 위치)
document.querySelectorAll('.map-chip').forEach((chip, i) => {
  chip.addEventListener('click', () => {
    if (i === 0 && window.innerWidth <= 768) {
      document.getElementById('mobile-shorts-drag-overlay')?.click();
    } else if (i === 1) {
      (document.getElementById('map-search-input') || document.getElementById('map-search-input-desktop'))?.focus();
    } else if (i === 2) {
      getMyLocation();
    }
  });
});

// 쇼츠 검색 - 필터링 (지도 중심 기준과 병행)
document.getElementById('shorts-search-input').addEventListener('input', (e) => {
  renderShorts(e.target.value, true);
});

// 쇼츠 영역 크기 조절 - 웹(가로) / 모바일(세로) 분리

// 웹: resize-handle 좌우 드래그로 쇼츠 너비 조절
(function initDesktopShortsResize() {
  const handle = document.getElementById('resize-handle');
  const shortsSection = document.getElementById('shorts-section');
  if (!handle || !shortsSection) return;

  const MIN_WIDTH = 200;
  let dragging = false;
  let startX = 0, startW = 0;

  function onDown(e) {
    if (e.button !== 0) return;
    if (window.innerWidth <= 768) return; // 모바일에서는 비활성
    dragging = true;
    startX = e.clientX;
    startW = shortsSection.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onMove(e) {
    if (!dragging) return;
    const dx = startX - e.clientX;
    const maxW = Math.floor(window.innerWidth * 0.8);
    const w = Math.max(MIN_WIDTH, Math.min(maxW, startW + dx));
    shortsSection.style.width = w + 'px';
    refreshMapSize();
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    refreshMapSize();
  }

  handle.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
})();

// 모바일: body 직계 오버레이로 터치 확보 후 드래그 (기본: 숨김)
(function initMobileShortsResize() {
  const shortsSection = document.getElementById('shorts-section');
  const mapContainer = document.getElementById('map-container');
  const handle = document.getElementById('resize-handle');
  if (!shortsSection) return;

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function setCollapsed(collapsed) {
    shortsSection.classList.toggle('shorts-collapsed', collapsed);
    if (collapsed) {
      shortsSection.style.height = '0';
      shortsSection.style.flex = 'none';
      if (mapContainer) mapContainer.style.flex = '1 1 0';
    } else {
      shortsSection.style.height = '';
      shortsSection.style.flex = '';
    }
    if (handle) handle.setAttribute('aria-label', collapsed ? '탭하여 쇼츠 보기' : '탭하여 지도 보기');
    updateOverlayVisibility();
  }

  function showShortsFullScreen() {
    setCollapsed(false);
    refreshMapSize();
  }
  window.showShortsFullScreen = showShortsFullScreen;

  function showMapFullScreen() {
    setCollapsed(true);
    refreshMapSize();
  }
  window.showMapFullScreen = showMapFullScreen;

  // body 직계 터치 오버레이 (지도/Leaflet 위에 확실히 표시)
  const overlay = document.createElement('div');
  overlay.id = 'mobile-shorts-drag-overlay';
  overlay.setAttribute('aria-label', '탭하여 쇼츠 보기');
  Object.assign(overlay.style, {
    position: 'fixed',
    bottom: 'calc(56px + env(safe-area-inset-bottom, 0))',
    left: '0',
    right: '0',
    height: '72px',
    zIndex: '99999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'none',
    pointerEvents: 'none',
  });
  overlay.style.webkitTapHighlightColor = 'transparent';
  const bar = document.createElement('div');
  bar.className = 'bar';
  Object.assign(bar.style, {
    width: '96px',
    height: '8px',
    background: 'rgba(128, 128, 128, 0.9)',
    borderRadius: '4px',
  });
  overlay.appendChild(bar);
  document.body.appendChild(overlay);

  function updateOverlayVisibility() {
    const homePage = document.getElementById('home-page');
    const onHome = homePage && !homePage.classList.contains('page-hidden');
    const show = isMobile() && onHome && shortsSection.classList.contains('shorts-collapsed');
    overlay.style.pointerEvents = show ? 'auto' : 'none';
    overlay.style.visibility = show ? 'visible' : 'hidden';
  }

  const homePage = document.getElementById('home-page');
  if (homePage) {
    const obs = new MutationObserver(updateOverlayVisibility);
    obs.observe(homePage, { attributes: true, attributeFilter: ['class'] });
  }

  function onOverlayTap() {
    if (!isMobile()) return;
    overlay.classList.add('active');
    setTimeout(() => overlay.classList.remove('active'), 150);
    showShortsFullScreen();
  }

  function onHandleTap() {
    if (!isMobile()) return;
    showMapFullScreen();
  }

  overlay.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onOverlayTap();
  }, { passive: false });
  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    onOverlayTap();
  });

  if (handle) {
    handle.addEventListener('touchstart', (e) => {
      if (isMobile() && !shortsSection.classList.contains('shorts-collapsed')) {
        e.preventDefault();
        onHandleTap();
      }
    }, { passive: false });
    handle.addEventListener('click', (e) => {
      if (isMobile() && !shortsSection.classList.contains('shorts-collapsed')) {
        e.preventDefault();
        onHandleTap();
      }
    });
  }

  // 초기화 - 쇼츠부터 시작
  if (isMobile()) {
    shortsSection.style.flex = '';
    shortsSection.style.height = '';
    setCollapsed(false);
    if (mapContainer) mapContainer.style.flex = '';
    refreshMapSize();
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      shortsSection.style.flex = '';
      shortsSection.style.height = '';
      shortsSection.classList.remove('shorts-collapsed');
      if (mapContainer) mapContainer.style.flex = '';
      overlay.style.pointerEvents = 'none';
      overlay.style.visibility = 'hidden';
    } else {
      updateOverlayVisibility();
    }
  });
})();
