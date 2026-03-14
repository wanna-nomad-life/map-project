# YouTube Data API v3 쇼츠 자동 수집

## 1단계: Google Cloud 설정

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성
3. **API 및 서비스 > 라이브러리** → "YouTube Data API v3" 검색 → **사용** 클릭
4. **사용자 인증 정보 > 사용자 인증 정보 만들기 > API 키** → 키 복사

## 2단계: 설정 파일

```bash
# 예시 파일 복사
cp scripts/youtube_api_config.example.json scripts/youtube_api_config.json

# youtube_api_config.json 에서 api_key 를 발급받은 키로 수정
```

## 3단계: 채널 ID 추가

`youtube_api_config.json` 의 `channels` 배열에 수집할 채널을 추가합니다.

채널 ID 찾는 법: YouTube 채널 페이지 → 주소창의 `UC...` 로 시작하는 부분

```json
{
  "channels": [
    {
      "youtubeChannelId": "UCmxdQo57ptM088VXM200fGw",
      "name": "뉴욕세끼 NYeat",
      "id": 1,
      "color": "#e53935"
    }
  ]
}
```

## 4단계: 실행

```bash
# Python 패키지 설치 (최초 1회)
pip install -r scripts/requirements-youtube-api.txt

# 쇼츠 수집 (기존 DB 덮어쓰기)
npm run fetch-youtube

# 기존 shorts.json 과 병합 (새 쇼츠만 추가, 위치 정보 유지)
python scripts/fetch_shorts_youtube_api.py --merge
```

## 옵션

| 옵션 | 설명 |
|------|------|
| `--merge` | 기존 shorts.json 과 병합. 새 쇼츠만 추가, 수동 입력한 위치 정보 유지 |
| `--config 경로` | 설정 파일 경로 지정 |

## API 할당량

- 기본: 10,000 units/일
- search.list: 100 units, videos.list: 1 unit
- 채널 10개 × 15영상 ≈ 1,500 units (여유 있음)
