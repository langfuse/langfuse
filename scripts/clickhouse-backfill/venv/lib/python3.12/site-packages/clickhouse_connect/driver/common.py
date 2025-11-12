import array
import struct
import sys

from typing import Sequence, MutableSequence, Dict, Optional, Union, Generator

from clickhouse_connect.driver.exceptions import ProgrammingError, StreamClosedError, DataError
from clickhouse_connect.driver.types import Closable

# pylint: disable=invalid-name
must_swap = sys.byteorder == 'big'
int_size = array.array('i').itemsize
low_card_version = 1

array_map = {1: 'b', 2: 'h', 4: 'i', 8: 'q'}
decimal_prec = {32: 9, 64: 18, 128: 38, 256: 79}

if int_size == 2:
    array_map[4] = 'l'

array_sizes = {v: k for k, v in array_map.items()}
array_sizes['f'] = 4
array_sizes['d'] = 8
np_date_types = {0: '[s]', 3: '[ms]', 6: '[us]', 9: '[ns]'}


def array_type(size: int, signed: bool):
    """
    Determines the Python array.array code for the requested byte size
    :param size: byte size
    :param signed: whether int types should be signed or unsigned
    :return: Python array.array code
    """
    try:
        code = array_map[size]
    except KeyError:
        return None
    return code if signed else code.upper()


def write_array(code: str, column: Sequence, dest: MutableSequence):
    """
    Write a column of native Python data matching the array.array code
    :param code: Python array.array code matching the column data type
    :param column: Column of native Python values
    :param dest: Destination byte buffer
    """
    if len(column) and not isinstance(column[0], (int, float)):
        if code in ('f', 'F', 'd', 'D'):
            column = [float(x) for x in column]
        else:
            column = [int(x) for x in column]
    try:
        buff = struct.Struct(f'<{len(column)}{code}')
        dest += buff.pack(*column)
    except (TypeError, OverflowError, struct.error) as ex:
        raise DataError('Unable to create Python array.  This is usually caused by trying to insert None ' +
                        'values into a ClickHouse column that is not Nullable') from ex


def write_uint64(value: int, dest: MutableSequence):
    """
    Write a single UInt64 value to a binary write buffer
    :param value: UInt64 value to write
    :param dest: Destination byte buffer
    """
    dest.extend(value.to_bytes(8, 'little'))


def write_leb128(value: int, dest: MutableSequence):
    """
    Write a LEB128 encoded integer to a target binary buffer
    :param value: Integer value (positive only)
    :param dest: Target buffer
    """
    while True:
        b = value & 0x7f
        value >>= 7
        if value == 0:
            dest.append(b)
            return
        dest.append(0x80 | b)


def decimal_size(prec: int):
    """
    Determine the bit size of a ClickHouse or Python Decimal needed to store a value of the requested precision
    :param prec: Precision of the Decimal in total number of base 10 digits
    :return: Required bit size
    """
    if prec < 1 or prec > 79:
        raise ArithmeticError(f'Invalid precision {prec} for ClickHouse Decimal type')
    if prec < 10:
        return 32
    if prec < 19:
        return 64
    if prec < 39:
        return 128
    return 256


def unescape_identifier(x: str) -> str:
    if x.startswith('`') and x.endswith('`'):
        return x[1:-1]
    return x


def dict_copy(source: Dict = None, update: Optional[Dict] = None) -> Dict:
    copy = source.copy() if source else {}
    if update:
        copy.update(update)
    return copy


def dict_add(source: Dict, key: str, value: any) -> Dict:
    if value is not None:
        source[key] = value
    return source


def empty_gen():
    yield from ()


def coerce_int(val: Optional[Union[str, int]]) -> int:
    if not val:
        return 0
    return int(val)


def coerce_bool(val: Optional[Union[str, bool]]):
    if not val:
        return False
    return val is True or (isinstance(val, str) and val.lower() in ('true', '1', 'y', 'yes'))


class SliceView(Sequence):
    """
    Provides a view into a sequence rather than copying.  Borrows liberally from
    https://gist.github.com/mathieucaroff/0cf094325fb5294fb54c6a577f05a2c1
    Also see the discussion on SO: https://stackoverflow.com/questions/3485475/can-i-create-a-view-on-a-python-list
    """
    slots = ('_source', '_range')

    def __init__(self, source: Sequence, source_slice: Optional[slice] = None):
        if isinstance(source, SliceView):
            self._source = source._source
            self._range = source._range[source_slice]
        else:
            self._source = source
            if source_slice is None:
                self._range = range(len(source))
            else:
                self._range = range(len(source))[source_slice]

    def __len__(self):
        return len(self._range)

    def __getitem__(self, i):
        if isinstance(i, slice):
            return SliceView(self._source, i)
        return self._source[self._range[i]]

    def __str__(self):
        r = self._range
        return str(self._source[slice(r.start, r.stop, r.step)])

    def __repr__(self):
        r = self._range
        return f'SliceView({self._source[slice(r.start, r.stop, r.step)]})'

    def __eq__(self, other):
        if self is other:
            return True
        if len(self) != len(other):
            return False
        for v, w in zip(self, other):
            if v != w:
                return False
        return True


class StreamContext:
    """
    Wraps a generator and its "source" in a Context.  This ensures that the source will be "closed" even if the
    generator is not fully consumed or there is an exception during consumption
    """
    __slots__ = 'source', 'gen', '_in_context'

    def __init__(self, source: Closable, gen: Generator):
        self.source = source
        self.gen = gen
        self._in_context = False

    def __iter__(self):
        return self

    def __next__(self):
        if not self._in_context:
            raise ProgrammingError('Stream should be used within a context')
        return next(self.gen)

    def __enter__(self):
        if not self.gen:
            raise StreamClosedError
        self._in_context = True
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._in_context = False
        self.source.close()
        self.gen = None
