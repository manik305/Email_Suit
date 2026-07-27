from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from app.scheduler import is_within_business_hours, clamp_to_business_hours, calculate_next_send_at

def test_clamp_to_business_hours():
    # 4:00 AM -> 7:30 AM
    h, m = clamp_to_business_hours(4, 0)
    assert (h, m) == (7, 30)

    # 1:00 AM -> 7:30 AM
    h, m = clamp_to_business_hours(1, 15)
    assert (h, m) == (7, 30)

    # 8:00 PM -> 6:30 PM
    h, m = clamp_to_business_hours(20, 0)
    assert (h, m) == (18, 30)

    # 10:30 AM -> 10:30 AM
    h, m = clamp_to_business_hours(10, 30)
    assert (h, m) == (10, 30)


def test_is_within_business_hours_uk():
    # Friday 10:00 AM London time (Within business hours)
    dt_uk = datetime(2026, 7, 24, 10, 0, tzinfo=ZoneInfo("Europe/London"))
    is_ok, _ = is_within_business_hours(dt_uk, "Europe/London")
    assert is_ok is True

    # Friday 4:00 AM London time (Off-hours -> should defer to 7:30 AM Friday)
    dt_early = datetime(2026, 7, 24, 4, 0, tzinfo=ZoneInfo("Europe/London"))
    is_ok_early, next_start = is_within_business_hours(dt_early, "Europe/London")
    assert is_ok_early is False
    assert next_start.hour == 7
    assert next_start.minute == 30
    assert next_start.day == 24

    # Saturday 10:00 AM London time (Weekend -> should defer to 7:30 AM Monday July 27)
    dt_sat = datetime(2026, 7, 25, 10, 0, tzinfo=ZoneInfo("Europe/London"))
    is_ok_sat, next_start_sat = is_within_business_hours(dt_sat, "Europe/London")
    assert is_ok_sat is False
    assert next_start_sat.weekday() == 0  # Monday
    assert next_start_sat.hour == 7
    assert next_start_sat.minute == 30


def test_calculate_next_send_at_business_hours():
    # 4:00 AM send_at string should be clamped to 7:30 AM
    send_at_str = "2026-07-27T04:00:00+00:00"
    next_send = calculate_next_send_at(send_at_str, "Daily", "Europe/London")
    assert next_send is not None
    next_dt = datetime.fromisoformat(next_send).astimezone(ZoneInfo("Europe/London"))
    assert next_dt.hour == 7
    assert next_dt.minute == 30
