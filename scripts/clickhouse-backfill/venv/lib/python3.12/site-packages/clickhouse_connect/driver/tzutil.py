import os
from datetime import datetime
from typing import Tuple

import pytz

tzlocal = None
try:
    import tzlocal  # Maybe we can use the tzlocal module to get a safe timezone
except ImportError:
    pass

# Set the local timezone for DateTime conversions.  Note in most cases we want to use either UTC or the server
# timezone, but if someone insists on using the local timezone we will try to convert.  The problem is we
# never have anything but an epoch timestamp returned from ClickHouse, so attempts to convert times when the
# local timezone is "DST" aware (like 'CEST' vs 'CET') will be wrong approximately half the time
local_tz: pytz.timezone
local_tz_dst_safe: bool = False


def normalize_timezone(timezone: pytz.timezone) -> Tuple[pytz.timezone, bool]:
    if timezone.tzname(None) in ('UTC', 'GMT', 'Universal', 'GMT-0', 'Zulu', 'Greenwich'):
        return pytz.UTC, True

    if timezone.tzname(None) in pytz.common_timezones:
        return timezone, True

    if tzlocal is not None:  # Maybe we can use the tzlocal module to get a safe timezone
        local_name = tzlocal.get_localzone_name()
        if local_name in pytz.common_timezones:
            return pytz.timezone(local_name), True

    return timezone, False


try:
    local_tz = pytz.timezone(os.environ.get('TZ', ''))
except pytz.UnknownTimeZoneError:
    local_tz = datetime.now().astimezone().tzinfo

local_tz, local_tz_dst_safe = normalize_timezone(local_tz)
