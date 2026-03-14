#!/usr/bin/env node
/**
 * 모바일 터널 스크립트
 * - localtunnel 사용 시: PC에서 https://loca.lt/mytunnelpassword 접속하면 비밀번호 확인 가능
 * - localhost.run 사용 시: 비밀번호 없음 (SSH 필요)
 */

const { spawn } = require('child_process');
const http = require('http');
// 터미널에 표시된 포트 사용 (예: 5173, 5174, 5175)
const port = process.env.TUNNEL_PORT || process.argv[2] || 5173;

function getPublicIP() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://ifconfig.me/ip', { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data.trim()));
    });
    req.on('error', reject);
  });
}

async function main() {
  const ip = await getPublicIP().catch(() => '확인 불가');
  console.log('\n=== 모바일 터널 ===');
  console.log(`개발 서버 포트: ${port}`);
  console.log(`\n[localtunnel 비밀번호]`);
  console.log(`  PC 브라우저에서 https://loca.lt/mytunnelpassword 접속 후 표시되는 코드 입력`);
  console.log(`  또는 아래 공인 IP 입력: ${ip}`);
  console.log('\n터널 시작...\n');

  const lt = spawn('npx', ['localtunnel', '--port', String(port)], {
    stdio: 'inherit',
    shell: true,
  });

  lt.on('error', (err) => {
    console.error('터널 실행 실패:', err.message);
    process.exit(1);
  });

  lt.on('close', (code) => {
    process.exit(code || 0);
  });
}

main();
