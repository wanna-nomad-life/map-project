/**
 * 주소를 좌표로 변환 (Nominatim API 사용)
 * 사용법: node scripts/geocode-address.js "주소"
 * 예: node scripts/geocode-address.js "15 W 32nd St, New York, NY 10001"
 */
const address = process.argv[2];
if (!address) {
  console.log('사용법: node geocode-address.js "주소"');
  process.exit(1);
}

const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
fetch(url, { headers: { 'User-Agent': 'Map-1-App' } })
  .then((r) => r.json())
  .then((data) => {
    if (data.length === 0) {
      console.log('결과 없음');
      return;
    }
    const { lat, lon, display_name } = data[0];
    console.log(`lat: ${lat}`);
    console.log(`lng: ${lon}`);
    console.log(`장소: ${display_name}`);
    console.log(`\nshorts.json에 추가할 값:`);
    console.log(`"lat": ${parseFloat(lat)}, "lng": ${parseFloat(lon)}`);
  })
  .catch(console.error);
