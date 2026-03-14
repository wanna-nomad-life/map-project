#!/usr/bin/env python3
"""
YouTube Data API v3로 채널 쇼츠 자동 수집
- 조회수, 좋아요, 댓글 수 등 실시간 데이터 수집
- 60초 이하 영상만 쇼츠로 필터링

사용법:
  1. youtube_api_config.example.json 을 youtube_api_config.json 으로 복사
  2. API 키 입력 (Google Cloud Console > YouTube Data API v3)
  3. python scripts/fetch_shorts_youtube_api.py

  또는: python scripts/fetch_shorts_youtube_api.py --config scripts/youtube_api_config.json
"""

import json
import os
import re
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("requests 패키지가 필요합니다: pip install requests")
    sys.exit(1)

# ISO 8601 duration 파싱 (PT1M30S -> 90초)
def parse_duration(duration_str: str) -> int:
    if not duration_str:
        return 999
    total = 0
    for m in re.finditer(r"(\d+)([HMS])", duration_str):
        val, unit = int(m.group(1)), m.group(2)
        if unit == "H":
            total += val * 3600
        elif unit == "M":
            total += val * 60
        elif unit == "S":
            total += val
    return total


def format_view_count(count: str) -> str:
    """조회수를 '142.7만' 형식으로 변환"""
    try:
        n = int(count)
        if n >= 1_000_000:
            return f"{n / 1_000_000:.1f}만"
        if n >= 10_000:
            return f"{n / 10_000:.1f}만"
        if n >= 1_000:
            return f"{n / 1_000:.1f}천"
        return str(n)
    except (ValueError, TypeError):
        return str(count) if count else "0"


def get_channel_info(api_key: str, channel_id: str) -> dict:
    """채널 정보 조회 (구독자 수 등)"""
    url = "https://www.googleapis.com/youtube/v3/channels"
    params = {
        "key": api_key,
        "part": "snippet,statistics",
        "id": channel_id,
    }
    r = requests.get(url, params=params, timeout=10)
    data = r.json()
    if "items" not in data or not data["items"]:
        return {}
    item = data["items"][0]
    subs = item.get("statistics", {}).get("subscriberCount", "0")
    try:
        n = int(subs)
        subs_str = f"{n / 10_000:.1f}만" if n >= 10_000 else str(n)
    except (ValueError, TypeError):
        subs_str = subs
    return {
        "name": item["snippet"]["title"],
        "subs": subs_str,
        "initial": item["snippet"]["title"][0] if item["snippet"]["title"] else "?",
    }


def get_channel_videos(api_key: str, channel_id: str, max_results: int = 15) -> list:
    """채널의 최근 영상 ID 목록 조회"""
    url = "https://www.googleapis.com/youtube/v3/search"
    params = {
        "key": api_key,
        "channelId": channel_id,
        "part": "snippet",
        "order": "date",
        "maxResults": max_results,
        "type": "video",
    }
    r = requests.get(url, params=params, timeout=10)
    data = r.json()
    items = data.get("items", [])
    return [item["id"]["videoId"] for item in items]

def get_video_details(api_key: str, video_ids: list) -> list:
    """영상 상세 정보 (길이, 조회수 등) 조회"""
    if not video_ids:
        return []
    url = "https://www.googleapis.com/youtube/v3/videos"
    params = {
        "key": api_key,
        "part": "snippet,contentDetails,statistics",
        "id": ",".join(video_ids[:50]),  # API 최대 50개
    }
    r = requests.get(url, params=params, timeout=10)
    data = r.json()
    return data.get("items", [])


def fetch_shorts(
    api_key: str,
    channels: list,
    max_results: int = 15,
    shorts_max_duration: int = 60,
):
    """채널별 쇼츠 수집"""
    all_channels = []
    all_shorts = []
    short_id = 1

    for ch in channels:
        yt_id = ch.get("youtubeChannelId") or ch.get("channelId")
        if not yt_id:
            continue

        print(f"채널 조회 중: {ch.get('name', yt_id)}...")

        # 채널 정보 (API에서 가져오거나 config 사용)
        info = get_channel_info(api_key, yt_id)
        ch_name = ch.get("name") or info.get("name", "Unknown")
        ch_subs = ch.get("subs") or info.get("subs", "0")
        ch_initial = ch.get("initial") or info.get("initial", "?")

        ch_obj = {
            "id": ch.get("id", short_id),
            "name": ch_name,
            "subs": ch_subs,
            "initial": ch_initial,
            "color": ch.get("color", "#e53935"),
            "youtubeChannelId": yt_id,
            "url": f"https://www.youtube.com/channel/{yt_id}",
        }
        all_channels.append(ch_obj)

        # 최근 영상 ID
        video_ids = get_channel_videos(api_key, yt_id, max_results)
        if not video_ids:
            continue

        # 상세 정보 (길이, 조회수)
        details = get_video_details(api_key, video_ids)
        ch_id = ch_obj["id"]

        for d in details:
            duration_str = d.get("contentDetails", {}).get("duration", "")
            duration_sec = parse_duration(duration_str)

            # 쇼츠만 (60초 이하)
            if duration_sec > shorts_max_duration:
                continue

            stats = d.get("statistics", {})
            view_count = stats.get("viewCount", "0")
            like_count = int(stats.get("likeCount", 0) or 0)

            # growthRate: 좋아요/조회수 비율로 대략 추정 (0.5~1.0)
            try:
                vc = int(view_count)
                growth = min(1.0, max(0.3, 0.5 + (like_count / max(vc, 1)) * 100)) if vc else 0.5
            except (ValueError, TypeError):
                growth = 0.5

            all_shorts.append({
                "id": short_id,
                "title": d["snippet"]["title"],
                "views": format_view_count(view_count),
                "growthRate": round(growth, 2),
                "color": ch_obj["color"],
                "youtubeVideoId": d["id"],
                "lat": None,
                "lng": None,
                "place": None,
                "placeName": None,
                "address": None,
                "channelId": ch_id,
            })
            short_id += 1
            print(f"  + {d['snippet']['title'][:40]}... ({format_view_count(view_count)} 조회)")

    return all_channels, all_shorts


def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    config_path = script_dir / "youtube_api_config.json"
    output_path = project_root / "public" / "data" / "shorts.json"

    # config 파일 찾기
    if "--config" in sys.argv:
        idx = sys.argv.index("--config")
        if idx + 1 < len(sys.argv):
            config_path = Path(sys.argv[idx + 1])

    if not config_path.exists():
        print(f"설정 파일이 없습니다: {config_path}")
        print("youtube_api_config.example.json 을 복사하여 youtube_api_config.json 을 만들고 API 키를 입력하세요.")
        sys.exit(1)

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    api_key = config.get("api_key") or os.environ.get("YOUTUBE_API_KEY")
    if not api_key or api_key == "YOUR_YOUTUBE_API_KEY":
        print("API 키를 설정하세요. youtube_api_config.json 의 api_key 또는 YOUTUBE_API_KEY 환경변수")
        sys.exit(1)

    channels = config.get("channels", [])
    if not channels:
        print("channels 목록이 비어 있습니다.")
        sys.exit(1)

    max_results = config.get("max_results_per_channel", 15)
    max_duration = config.get("shorts_max_duration_seconds", 60)

    print("YouTube Data API v3로 쇼츠 수집 시작...\n")
    all_channels, all_shorts = fetch_shorts(
        api_key, channels, max_results, max_duration
    )

    # 기존 DB와 병합 (--merge): 새 쇼츠만 추가, 기존 위치 정보 유지
    if "--merge" in sys.argv and output_path.exists():
        with open(output_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
        existing_by_vid = {s["youtubeVideoId"]: s for s in existing.get("shorts", [])}
        max_id = max((s["id"] for s in existing.get("shorts", [])), default=0)
        merged_shorts = list(existing.get("shorts", []))
        for s in all_shorts:
            if s["youtubeVideoId"] in existing_by_vid:
                continue  # 이미 있으면 스킵 (위치 정보 보존)
            max_id += 1
            s["id"] = max_id
            merged_shorts.append(s)
        all_shorts = merged_shorts
        all_channels = existing.get("channels", all_channels)

    result = {
        "channels": all_channels,
        "shorts": all_shorts,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n완료! {len(all_shorts)}개 쇼츠를 {output_path} 에 저장했습니다.")


if __name__ == "__main__":
    main()
