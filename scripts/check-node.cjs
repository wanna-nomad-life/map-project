// Vite 5는 Node 18+ 필요; CommonJS로 두어 구버전에서도 이 검사만 실행되게 함.
var major = parseInt(process.version.slice(1).split('.')[0], 10);
if (major < 18 || Number.isNaN(major)) {
  console.error(
    '[shorts-location-map] Node.js 18 이상이 필요합니다. 현재: ' + process.version + '\n' +
      '예: nvm install 20 && nvm use 20\n' +
      '또는 https://nodejs.org/ 에서 LTS 설치'
  );
  process.exit(1);
}
