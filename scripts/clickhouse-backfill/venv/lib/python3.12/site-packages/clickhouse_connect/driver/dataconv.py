import array
from datetime import datetime, date, tzinfo
from ipaddress import IPv4Address
from typing import Sequence, Optional, Any
from uuid import UUID, SafeUUID

from clickhouse_connect.driver.common import int_size
from clickhouse_connect.driver.errors import NONE_IN_NULLABLE_COLUMN
from clickhouse_connect.driver.types import ByteSource
from clickhouse_connect.driver.options import np


MONTH_DAYS = (0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365)
MONTH_DAYS_LEAP = (0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366)


def read_ipv4_col(source: ByteSource, num_rows: int):
    column = source.read_array('I', num_rows)
    fast_ip_v4 = IPv4Address.__new__
    new_col = []
    app = new_col.append
    for x in column:
        ipv4 = fast_ip_v4(IPv4Address)
        ipv4._ip = x  # pylint: disable=protected-access
        app(ipv4)
    return new_col


def read_datetime_col(source: ByteSource, num_rows: int, tz_info: Optional[tzinfo]):
    src_array = source.read_array('I', num_rows)
    if tz_info is None:
        fts = datetime.utcfromtimestamp
        return [fts(ts) for ts in src_array]
    fts = datetime.fromtimestamp
    return [fts(ts, tz_info) for ts in src_array]


def epoch_days_to_date(days: int) -> date:
    cycles400, rem = divmod(days + 134774, 146097)
    cycles100, rem = divmod(rem, 36524)
    cycles, rem = divmod(rem, 1461)
    years, rem = divmod(rem, 365)
    year = (cycles << 2) + cycles400 * 400 + cycles100 * 100 + years + 1601
    if years == 4 or cycles100 == 4:
        return date(year - 1, 12, 31)
    m_list = MONTH_DAYS_LEAP if years == 3 and (year == 2000 or year % 100 != 0) else MONTH_DAYS
    month = (rem + 24) >> 5
    while rem < m_list[month]:
        month -= 1
    return date(year, month + 1, rem + 1 - m_list[month])


def read_date_col(source: ByteSource, num_rows: int):
    column = source.read_array('H', num_rows)
    return [epoch_days_to_date(x) for x in column]


def read_date32_col(source: ByteSource, num_rows: int):
    column = source.read_array('l' if int_size == 2 else 'i', num_rows)
    return [epoch_days_to_date(x) for x in column]


def read_uuid_col(source: ByteSource, num_rows: int):
    v = source.read_array('Q', num_rows * 2)
    empty_uuid = UUID(int=0)
    new_uuid = UUID.__new__
    unsafe = SafeUUID.unsafe
    oset = object.__setattr__
    column = []
    app = column.append
    for i in range(num_rows):
        ix = i << 1
        int_value = v[ix] << 64 | v[ix + 1]
        if int_value == 0:
            app(empty_uuid)
        else:
            fast_uuid = new_uuid(UUID)
            oset(fast_uuid, 'int', int_value)
            oset(fast_uuid, 'is_safe', unsafe)
            app(fast_uuid)
    return column


def read_nullable_array(source: ByteSource, array_type: str, num_rows: int, null_obj: Any):
    null_map = source.read_bytes(num_rows)
    column = source.read_array(array_type, num_rows)
    return [null_obj if null_map[ix] else column[ix] for ix in range(num_rows)]


def build_nullable_column(source: Sequence, null_map: bytes, null_obj: Any):
    return [source[ix] if null_map[ix] == 0 else null_obj for ix in range(len(source))]


def build_lc_nullable_column(index: Sequence, keys: array.array, null_obj: Any):
    column = []
    for key in keys:
        if key == 0:
            column.append(null_obj)
        else:
            column.append(index[key])
    return column


def to_numpy_array(column: Sequence):
    arr = np.empty((len(column),), dtype=np.object)
    arr[:] = column
    return arr


def pivot(data: Sequence[Sequence], start_row: int, end_row: int) -> Sequence[Sequence]:
    return tuple(zip(*data[start_row: end_row]))


def write_str_col(column: Sequence, nullable: bool, encoding: Optional[str], dest: bytearray) -> int:
    app = dest.append
    for x in column:
        if not x:
            if not nullable and x is None:
                return NONE_IN_NULLABLE_COLUMN
            app(0)
        else:
            if encoding:
                x = x.encode(encoding)
            else:
                x = bytes(x)
            sz = len(x)
            while True:
                b = sz & 0x7f
                sz >>= 7
                if sz == 0:
                    app(b)
                    break
                app(0x80 | b)
            dest += x
    return 0
