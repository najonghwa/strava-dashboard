import os
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv
from supabase import create_client


load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

STRAVA_CLIENT_ID = os.getenv("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.getenv("STRAVA_CLIENT_SECRET")
STRAVA_REFRESH_TOKEN = os.getenv("STRAVA_REFRESH_TOKEN")

TABLE_NAME = os.getenv("SUPABASE_ACTIVITIES_TABLE", "activities")
DETAIL_FROM_DATE = os.getenv("DETAIL_FROM_DATE")


def require_env(name, value):
    if not value:
        raise RuntimeError(f".env에 {name} 값이 없습니다.")


def month_start_utc():
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc)


def parse_detail_from_date():
    if not DETAIL_FROM_DATE:
        return month_start_utc()
    return datetime.fromisoformat(DETAIL_FROM_DATE).replace(tzinfo=timezone.utc)


def to_epoch_seconds(dt):
    return int(dt.timestamp())


def refresh_access_token():
    response = requests.post(
        "https://www.strava.com/oauth/token",
        data={
            "client_id": STRAVA_CLIENT_ID,
            "client_secret": STRAVA_CLIENT_SECRET,
            "refresh_token": STRAVA_REFRESH_TOKEN,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def strava_get(path, headers, params=None):
    response = requests.get(
        f"https://www.strava.com/api/v3{path}",
        headers=headers,
        params=params or {},
        timeout=30,
    )
    response.raise_for_status()
    time.sleep(0.25)
    return response.json()


def fetch_activities(headers, after_epoch):
    activities = []
    page = 1

    while True:
        print(f"활동 목록 {page}페이지 조회 중...")
        data = strava_get(
            "/athlete/activities",
            headers,
            params={
                "after": after_epoch,
                "per_page": 100,
                "page": page,
            },
        )

        if not data:
            break

        activities.extend(data)
        page += 1

    return activities


def fetch_activity_detail(activity_id, headers):
    return strava_get(f"/activities/{activity_id}", headers)


def fetch_activity_streams(activity_id, headers):
    stream_keys = [
        "time",
        "distance",
        "latlng",
        "altitude",
        "velocity_smooth",
        "heartrate",
        "cadence",
        "watts",
    ]

    try:
        streams = strava_get(
            f"/activities/{activity_id}/streams",
            headers,
            params={
                "keys": ",".join(stream_keys),
                "key_by_type": "true",
            },
        )
    except requests.HTTPError as error:
        print(f"  - streams 조회 실패: {activity_id} ({error})")
        return {}

    result = {}
    for key, value in streams.items():
        if isinstance(value, dict) and "data" in value:
            result[key] = value["data"]
    return result


def already_has_detail(raw):
    if not isinstance(raw, dict):
        return False
    return bool(raw.get("detail_synced_at") and (raw.get("splits_metric") or raw.get("streams")))


def get_existing_raw_by_id(supabase, activity_ids):
    if not activity_ids:
        return {}

    existing = {}
    chunk_size = 100
    for start in range(0, len(activity_ids), chunk_size):
        ids = activity_ids[start:start + chunk_size]
        response = (
            supabase.table(TABLE_NAME)
            .select("id, raw")
            .in_("id", ids)
            .execute()
        )
        for row in response.data or []:
            existing[row["id"]] = row.get("raw") or {}
    return existing


def build_row(summary, detail=None, streams=None):
    activity = detail or summary
    raw = {
        **summary,
        **(detail or {}),
        "streams": streams or {},
    }

    if detail:
        raw["detail_synced_at"] = datetime.now(timezone.utc).isoformat()

    distance_m = activity.get("distance", 0) or 0
    distance_km = distance_m / 1000
    moving_time = activity.get("moving_time", 0) or 0
    pace = (moving_time / 60) / distance_km if distance_km > 0 else None

    return {
        "id": activity.get("id"),
        "athlete_id": activity.get("athlete", {}).get("id"),
        "name": activity.get("name"),
        "sport_type": activity.get("sport_type") or activity.get("type"),
        "start_date": activity.get("start_date"),
        "start_date_local": activity.get("start_date_local"),
        "timezone": activity.get("timezone"),
        "distance_m": distance_m,
        "distance_km": distance_km,
        "moving_time": moving_time,
        "elapsed_time": activity.get("elapsed_time"),
        "pace_min_per_km": pace,
        "average_speed": activity.get("average_speed"),
        "max_speed": activity.get("max_speed"),
        "average_heartrate": activity.get("average_heartrate"),
        "max_heartrate": activity.get("max_heartrate"),
        "average_cadence": activity.get("average_cadence"),
        "average_watts": activity.get("average_watts"),
        "max_watts": activity.get("max_watts"),
        "total_elevation_gain": activity.get("total_elevation_gain"),
        "elev_high": activity.get("elev_high"),
        "elev_low": activity.get("elev_low"),
        "device_name": activity.get("device_name"),
        "visibility": activity.get("visibility"),
        "raw": raw,
    }


def main():
    require_env("SUPABASE_URL", SUPABASE_URL)
    require_env("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_KEY)
    require_env("STRAVA_CLIENT_ID", STRAVA_CLIENT_ID)
    require_env("STRAVA_CLIENT_SECRET", STRAVA_CLIENT_SECRET)
    require_env("STRAVA_REFRESH_TOKEN", STRAVA_REFRESH_TOKEN)

    detail_from = parse_detail_from_date()
    after_epoch = to_epoch_seconds(detail_from)
    print(f"상세 동기화 기준일: {detail_from.date()}")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    access_token = refresh_access_token()
    headers = {"Authorization": f"Bearer {access_token}"}
    print("Strava 토큰 갱신 성공")

    activities = fetch_activities(headers, after_epoch)
    print(f"이번 기간 활동 수집: {len(activities)}개")

    existing_raw = get_existing_raw_by_id(supabase, [activity["id"] for activity in activities])
    rows = []
    detail_count = 0
    skipped_detail_count = 0

    for summary in activities:
      activity_id = summary.get("id")
      raw = existing_raw.get(activity_id, {})

      if already_has_detail(raw):
          rows.append(build_row(summary, detail=raw, streams=raw.get("streams") or {}))
          skipped_detail_count += 1
          continue

      print(f"상세 조회 중: {activity_id} / {summary.get('name')}")
      detail = fetch_activity_detail(activity_id, headers)
      streams = fetch_activity_streams(activity_id, headers)
      rows.append(build_row(summary, detail=detail, streams=streams))
      detail_count += 1

    if rows:
        supabase.table(TABLE_NAME).upsert(rows, on_conflict="id").execute()

    print(f"Supabase 저장 완료: {len(rows)}개")
    print(f"상세 새로 조회: {detail_count}개")
    print(f"상세 이미 있어서 건너뜀: {skipped_detail_count}개")


if __name__ == "__main__":
    main()
