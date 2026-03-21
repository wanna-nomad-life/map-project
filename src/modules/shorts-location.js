/**
 * 쇼츠 위치 지도 - 쇼츠 주소/좌표 유틸
 * 쇼츠 데이터에서 지도에 표시할 위치 좌표 추출
 */

/**
 * 쇼츠의 지도에 표시할 위치들 반환
 * - locations 배열 있으면 각 위치별 마커
 * - lat/lng 있으면 단일 위치
 */
export function getLocationPoints(short) {
  if (short.locations && Array.isArray(short.locations) && short.locations.length > 0) {
    return short.locations.map((loc) => ({ ...short, ...loc }));
  }
  if (short.lat != null && short.lng != null) {
    return [{ ...short }];
  }
  return [];
}

/** 선택된 위치 기준 반경(도) ~2km */
export const PLACE_FILTER_RADIUS = 0.02;

/**
 * 위치와 가까운 쇼츠 반환 (거리 ~2km 또는 장소명/제목 매칭)
 */
export function getShortsNearPlace(shortsData, lat, lng, name) {
  const nameLower = (name || '').toLowerCase().trim();
  if (nameLower.length < 2) {
    return shortsData.filter((s) =>
      getLocationPoints(s).some((p) => Math.sqrt((p.lat - lat) ** 2 + (p.lng - lng) ** 2) <= PLACE_FILTER_RADIUS)
    );
  }
  return shortsData.filter((s) => {
    const pts = getLocationPoints(s);
    const titleMatch = s.title && s.title.toLowerCase().includes(nameLower);
    for (const p of pts) {
      const dist = Math.sqrt((p.lat - lat) ** 2 + (p.lng - lng) ** 2);
      if (dist <= PLACE_FILTER_RADIUS) return true;
      const locMatch =
        (p.placeName && p.placeName.toLowerCase().includes(nameLower)) ||
        (p.place && p.place.toLowerCase().includes(nameLower)) ||
        (p.locationText && p.locationText.toLowerCase().includes(nameLower));
      if (locMatch || titleMatch) return true;
    }
    return titleMatch && pts.length > 0;
  });
}
