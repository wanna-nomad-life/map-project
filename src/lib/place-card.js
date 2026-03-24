/**
 * 쇼츠 위치 지도 - 장소 카드 UI
 * 지도 팝업 및 정보 패널에 표시할 쇼츠 주소 카드 HTML 생성
 */

export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;');
}

/** Google Maps 길찾기 URL 생성 */
export function buildDirectionsUrl(data) {
  const placeName = data.placeName || data.name || '';
  const addr =
    data.locationText ||
    (data.placeName && /,|Rd|St|Chome|丁目|区|City|Thailand|Japan/.test(data.placeName) ? data.placeName : null) ||
    data.address ||
    '';
  const destination = placeName && addr && placeName !== addr ? `${placeName}, ${addr}` : addr || placeName;
  if (destination.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }
  if (data.lat != null && data.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lng}`;
  }
  return '#';
}

/**
 * 쇼츠 위치 팝업 카드 HTML (지도 마커용)
 * @param {Object} short - 쇼츠 또는 위치 객체 (placeName, address, lat, lng, id, youtubeVideoId 등)
 */
export function buildPlaceCardHtml(short, options = {}) {
  const placeName = short.placeName || short.place || '';
  const address =
    short.locationText ||
    (short.placeName && /,|Rd|St|Chome|丁目|区|City|Thailand|Japan/.test(short.placeName) ? short.placeName : null) ||
    short.address ||
    '';
  const dirUrl = buildDirectionsUrl(short);
  const playBtn =
    options.showPlayBtn !== false && short.youtubeVideoId
      ? `<button type="button" class="place-card-play-btn" data-id="${short.id}" title="영상 보기">▶</button>`
      : '';
  const locName = placeName || short.locationText || short.place || '이 장소';
  const relatedBtn =
    short.lat != null && short.lng != null
      ? `<button type="button" class="place-card-related-btn" data-lat="${short.lat}" data-lng="${short.lng}" data-name="${escapeHtml(locName)}" title="관련 영상보기">📋</button>`
      : '';
  const mainTitle = placeName || short.title;
  const subTitle = placeName ? short.title : '';
  return `
    <div class="leaflet-place-card">
      <div class="place-card-title">${mainTitle}</div>
      ${subTitle ? `<div class="place-card-subtitle">${subTitle}</div>` : ''}
      ${address ? `<div class="place-card-address">${address}</div>` : ''}
      <div class="place-card-actions">
        ${playBtn}
        ${relatedBtn}
        <a href="${dirUrl}" target="_blank" rel="noopener" class="place-card-directions" title="길찾기">🚗</a>
      </div>
    </div>
  `;
}
