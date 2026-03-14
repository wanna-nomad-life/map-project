# Vite 개발 서버 포트 방화벽 허용 (관리자 권한 필요)
# PowerShell을 "관리자 권한으로 실행" 후 이 스크립트 실행

$ports = @(5173, 5174)
foreach ($port in $ports) {
  $ruleName = "Vite Dev Server - Port $port"
  $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "규칙 '$ruleName' 이미 존재합니다."
  } else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port
    Write-Host "포트 $port 허용 완료: $ruleName"
  }
}
Write-Host "`n완료. 스마트폰에서 http://(PC IP):5173 또는 :5174 로 접속해 보세요."
