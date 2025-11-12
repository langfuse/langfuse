import socket
from ipaddress import IPv4Address, IPv6Address
from typing import Union, MutableSequence, Sequence

from clickhouse_connect.datatypes.base import ClickHouseType
from clickhouse_connect.driver.common import write_array, int_size
from clickhouse_connect.driver.insert import InsertContext
from clickhouse_connect.driver.query import QueryContext
from clickhouse_connect.driver.types import ByteSource
from clickhouse_connect.driver.ctypes import data_conv

IPV4_V6_MASK = b'\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff'
V6_NULL = bytes(b'\x00' * 16)


# pylint: disable=protected-access
class IPv4(ClickHouseType):
    _array_type = 'L' if int_size == 2 else 'I'
    valid_formats = 'string', 'native', 'int'
    python_type = IPv4Address
    byte_size = 4

    def _read_column_binary(self, source: ByteSource, num_rows: int, ctx: QueryContext):
        if self.read_format(ctx) == 'int':
            return source.read_array(self._array_type, num_rows)
        if self.read_format(ctx) == 'string':
            column = source.read_array(self._array_type, num_rows)
            return [socket.inet_ntoa(x.to_bytes(4, 'big')) for x in column]
        return data_conv.read_ipv4_col(source, num_rows)

    def _write_column_binary(self, column: Union[Sequence, MutableSequence], dest: bytearray, ctx: InsertContext):
        first = self._first_value(column)
        if isinstance(first, str):
            fixed = 24, 16, 8, 0
            # pylint: disable=consider-using-generator
            column = [(sum([int(b) << fixed[ix] for ix, b in enumerate(x.split('.'))])) if x else 0 for x in column]
        else:
            if self.nullable:
                column = [x._ip if x else 0 for x in column]
            else:
                column = [x._ip for x in column]
        write_array(self._array_type, column, dest)

    def _active_null(self, ctx: QueryContext):
        fmt = self.read_format(ctx)
        if ctx.use_none:
            return None
        if fmt == 'string':
            return '0.0.0.0'
        if fmt == 'int':
            return 0
        return None


# pylint: disable=protected-access
class IPv6(ClickHouseType):
    valid_formats = 'string', 'native'
    python_type = IPv6Address
    byte_size = 16

    def _read_column_binary(self, source: ByteSource, num_rows: int, ctx: QueryContext):
        if self.read_format(ctx) == 'string':
            return self._read_binary_str(source, num_rows)
        return self._read_binary_ip(source, num_rows)

    @staticmethod
    def _read_binary_ip(source: ByteSource, num_rows: int):
        fast_ip_v6 = IPv6Address.__new__
        fast_ip_v4 = IPv4Address.__new__
        with_scope_id = '_scope_id' in IPv6Address.__slots__
        new_col = []
        app = new_col.append
        ifb = int.from_bytes
        for _ in range(num_rows):
            int_value = ifb(source.read_bytes(16), 'big')
            if int_value >> 32 == 0xFFFF:
                ipv4 = fast_ip_v4(IPv4Address)
                ipv4._ip = int_value & 0xFFFFFFFF
                app(ipv4)
            else:
                ipv6 = fast_ip_v6(IPv6Address)
                ipv6._ip = int_value
                if with_scope_id:
                    ipv6._scope_id = None
                app(ipv6)
        return new_col

    @staticmethod
    def _read_binary_str(source: ByteSource, num_rows: int):
        new_col = []
        app = new_col.append
        v4mask = IPV4_V6_MASK
        tov4 = socket.inet_ntoa
        tov6 = socket.inet_ntop
        af6 = socket.AF_INET6
        for _ in range(num_rows):
            x = source.read_bytes(16)
            if x[:12] == v4mask:
                app(tov4(x[12:]))
            else:
                app(tov6(af6, x))
        return new_col

    def _write_column_binary(self, column: Union[Sequence, MutableSequence], dest: bytearray, ctx: InsertContext):
        v = V6_NULL
        first = self._first_value(column)
        v4mask = IPV4_V6_MASK
        af6 = socket.AF_INET6
        tov6 = socket.inet_pton
        if isinstance(first, str):
            for x in column:
                if x is None:
                    dest += v
                elif '.' in x:
                    dest += v4mask + bytes(int(b) for b in x.split('.'))
                else:
                    dest += tov6(af6, x)
        else:
            for x in column:
                if x is None:
                    dest += v
                else:
                    b = x.packed
                    dest += b if len(b) == 16 else (v4mask + b)

    def _active_null(self, ctx):
        if ctx.use_none:
            return None
        return '::' if self.read_format(ctx) == 'string' else V6_NULL
