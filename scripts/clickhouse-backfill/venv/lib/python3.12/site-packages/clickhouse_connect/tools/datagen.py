import struct
import uuid
from decimal import Decimal as PyDecimal
from ipaddress import IPv4Address, IPv6Address
from random import random, choice
from typing import Sequence, Union, NamedTuple, Callable, Type, Dict
from datetime import date, datetime, timedelta, tzinfo

import pytz

from clickhouse_connect.datatypes.base import ClickHouseType
from clickhouse_connect.datatypes.container import Array, Tuple, Map, Nested
from clickhouse_connect.datatypes.network import IPv4, IPv6
from clickhouse_connect.datatypes.numeric import BigInt, Float32, Float64, Enum, Bool, Boolean, Decimal
from clickhouse_connect.datatypes.registry import get_from_name
from clickhouse_connect.datatypes.special import UUID
from clickhouse_connect.datatypes.string import String, FixedString
from clickhouse_connect.datatypes.temporal import Date, Date32, DateTime, DateTime64
from clickhouse_connect.driver.common import array_sizes

dt_from_ts = datetime.utcfromtimestamp
dt_from_ts_tz = datetime.fromtimestamp
epoch_date = date(1970, 1, 1)
date32_start_date = date(1925, 1, 1)


class RandomValueDef(NamedTuple):
    """
    Parameter object to control the generation of random data values for testing
    """
    server_tz: tzinfo = pytz.UTC
    null_pct: float = 0.15
    str_len: int = 200
    arr_len: int = 12
    ascii_only: bool = False


def random_col_data(ch_type: Union[str, ClickHouseType], cnt: int, col_def: RandomValueDef = RandomValueDef()):
    """
    Generate a column of random data for insert tests
    :param ch_type: ClickHouseType or ClickHouse type name
    :param cnt: Number of values to generate
    :param col_def: Parameters to use for random data generation
    :return: A tuple of length cnt of random Python data values of the requested ClickHouseType
    """
    if isinstance(ch_type, str):
        ch_type = get_from_name(ch_type)
    gen = random_value_gen(ch_type, col_def)
    if ch_type.nullable:
        x = col_def.null_pct
        return tuple(gen() if random() > x else None for _ in range(cnt))
    return tuple(gen() for _ in range(cnt))


# pylint: disable=too-many-return-statements,too-many-branches,protected-access
def random_value_gen(ch_type: ClickHouseType, col_def: RandomValueDef):
    """
    Returns a generator function of random values of the requested ClickHouseType
    :param ch_type: ClickHouseType to generate
    :param col_def: Parameters for the generated values
    :return: Function or lambda that will return a random value of the requested type
    """
    if ch_type.__class__ in gen_map:
        return gen_map[ch_type.__class__]
    if isinstance(ch_type, BigInt) or ch_type.python_type == int:
        if isinstance(ch_type, BigInt):
            sz = 2 ** (ch_type.byte_size * 8)
            signed = ch_type._signed
        else:
            sz = 2 ** (array_sizes[ch_type._array_type.lower()] * 8)
            signed = ch_type._array_type == ch_type._array_type.lower()
        if signed:
            sub = sz >> 1
            return lambda: int(random() * sz) - sub
        return lambda: int(random() * sz)
    if isinstance(ch_type, Array):
        return lambda: list(random_col_data(ch_type.element_type, int(random() * col_def.arr_len), col_def))
    if isinstance(ch_type, Decimal):
        return lambda: random_decimal(ch_type.prec, ch_type.scale)
    if isinstance(ch_type, Map):
        return lambda: random_map(ch_type.key_type, ch_type.value_type, int(random() * col_def.arr_len), col_def)
    if isinstance(ch_type, Tuple):
        return lambda: random_tuple(ch_type.element_types, col_def)
    if isinstance(ch_type, Enum):
        keys = list(ch_type._name_map.keys())
        return lambda: choice(keys)
    if isinstance(ch_type, Nested):
        return lambda: random_nested(ch_type.element_names, ch_type.element_types, col_def)
    if isinstance(ch_type, String):
        if col_def.ascii_only:
            return lambda: random_ascii_str(col_def.str_len)
        return lambda: random_utf8_str(col_def.str_len)
    if isinstance(ch_type, FixedString):
        return lambda: bytes((int(random() * 256) for _ in range(ch_type.byte_size)))
    if isinstance(ch_type, DateTime):
        if col_def.server_tz == pytz.UTC:
            return random_datetime
        timezone = col_def.server_tz
        return lambda: random_datetime_tz(timezone)
    if isinstance(ch_type, DateTime64):
        prec = ch_type.prec
        if col_def.server_tz == pytz.UTC:
            return lambda: random_datetime64(prec)
        timezone = col_def.server_tz
        return lambda: random_datetime64_tz(prec, timezone)
    raise ValueError(f'Invalid ClickHouse type {ch_type.name} for random column data')


def random_float():
    return (random() * random() * 65536) / (random() * (random() * 256 - 128))


def random_float32():
    f64 = (random() * random() * 65536) / (random() * (random() * 256 - 128))
    return struct.unpack('f', struct.pack('f', f64))[0]


def random_decimal(prec: int, scale: int):
    digits = ''.join(str(int(random() * 12000000000)) for _ in range(prec // 10 + 1)).rjust(prec, '0')[:prec]
    sign = '' if ord(digits[0]) & 0x01 else '-'
    if scale == 0:
        return PyDecimal(f'{sign}{digits}')
    return PyDecimal(f'{sign}{digits[:-scale]}.{digits[-scale:]}')


def random_tuple(element_types: Sequence[ClickHouseType], col_def):
    return tuple(random_value_gen(x, col_def)() for x in element_types)


def random_map(key_type, value_type, sz: int, col_def):
    keys = random_col_data(key_type, sz, col_def)
    values = random_col_data(value_type, sz, col_def)
    return dict(zip(keys, values))


def random_datetime():
    return dt_from_ts(int(random() * 2 ** 32)).replace(microsecond=0)


def random_datetime_tz(timezone: tzinfo):
    return dt_from_ts_tz(int(random() * 2 ** 32), timezone).replace(microsecond=0)


def random_ascii_str(max_len: int = 200, min_len: int = 0):
    return ''.join((chr(int(random() * 95) + 32) for _ in range(int(random() * (max_len - min_len)) + min_len)))


def random_utf8_str(max_len: int = 200):
    random_chars = [chr(int(random() * 65000) + 32) for _ in range(int(random() * max_len))]
    return ''.join((c for c in random_chars if c.isprintable()))


def fixed_len_ascii_str(str_len: int = 200):
    return ''.join((chr(int(random() * 95) + 32) for _ in range(str_len)))


#   Only accepts precisions in multiples of 3 because others are extremely unlikely to be actually used
def random_datetime64(prec: int):
    if prec == 1:
        u_sec = 0
    elif prec == 1000:
        u_sec = int(random() * 1000) * 1000
    else:
        u_sec = int(random() * 1000000)
    return dt_from_ts(int(random() * 4294967296)).replace(microsecond=u_sec)


def random_datetime64_tz(prec: int, timezone: tzinfo):
    if prec == 1:
        u_sec = 0
    elif prec == 1000:
        u_sec = int(random() * 1000) * 1000
    else:
        u_sec = int(random() * 1000000)
    return dt_from_ts_tz(int(random() * 4294967296), timezone).replace(microsecond=u_sec)


def random_ipv6():
    if random() > 0.2:
        # multiple randoms because of random float multiply limitations
        ip_int = (int(random() * 4294967296) << 96) | (int(random() * 4294967296)) | (
                    int(random() * 4294967296) << 32) | ( int(random() * 4294967296) << 64)
        return IPv6Address(ip_int)
    return IPv4Address(int(random() * 2 ** 32))


def random_nested(keys: Sequence[str], types: Sequence[ClickHouseType], col_def: RandomValueDef):
    sz = int(random() * col_def.arr_len) // 2
    row = []
    for _ in range(sz):
        nested_element = {}
        for name, col_type in zip(keys, types):
            nested_element[name] = random_value_gen(col_type, col_def)()
        row.append(nested_element)
    return row


gen_map: Dict[Type[ClickHouseType], Callable] = {
    Float64: random_float,
    Float32: random_float32,
    Date: lambda: epoch_date + timedelta(days=int(random() * 65536)),
    Date32: lambda: date32_start_date + timedelta(days=random() * 130000),
    UUID: uuid.uuid4,
    IPv4: lambda: IPv4Address(int(random() * 4294967296)),
    IPv6: random_ipv6,
    Boolean: lambda: random() > .5,
    Bool: lambda: random() > .5
}
