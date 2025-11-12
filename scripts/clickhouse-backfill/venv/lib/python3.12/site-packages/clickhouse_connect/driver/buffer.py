import sys
import array
from typing import Any, Iterable

from clickhouse_connect.driver.exceptions import StreamCompleteException
from clickhouse_connect.driver.types import ByteSource

must_swap = sys.byteorder == 'big'


class ResponseBuffer(ByteSource):
    slots = 'slice_sz', 'buf_loc', 'end', 'gen', 'buffer', 'slice'

    def __init__(self, source):
        self.slice_sz = 4096
        self.buf_loc = 0
        self.buf_sz = 0
        self.source = source
        self.gen = source.gen
        self.buffer = bytes()

    def read_bytes(self, sz: int):
        if self.buf_loc + sz <= self.buf_sz:
            self.buf_loc += sz
            return self.buffer[self.buf_loc - sz: self.buf_loc]
        # Create a temporary buffer that bridges two or more source chunks
        bridge = bytearray(self.buffer[self.buf_loc: self.buf_sz])
        self.buf_loc = 0
        self.buf_sz = 0
        while len(bridge) < sz:
            chunk = next(self.gen, None)
            if not chunk:
                raise StreamCompleteException
            x = len(chunk)
            if len(bridge) + x <= sz:
                bridge.extend(chunk)
            else:
                tail = sz - len(bridge)
                bridge.extend(chunk[:tail])
                self.buffer = chunk
                self.buf_sz = x
                self.buf_loc = tail
        return bridge

    def read_byte(self) -> int:
        if self.buf_loc < self.buf_sz:
            self.buf_loc += 1
            return self.buffer[self.buf_loc - 1]
        self.buf_sz = 0
        self.buf_loc = 0
        chunk = next(self.gen, None)
        if not chunk:
            raise StreamCompleteException
        x = len(chunk)
        if x > 1:
            self.buffer = chunk
            self.buf_loc = 1
            self.buf_sz = x
        return chunk[0]

    def read_leb128(self) -> int:
        sz = 0
        shift = 0
        while True:
            b = self.read_byte()
            sz += ((b & 0x7f) << shift)
            if (b & 0x80) == 0:
                return sz
            shift += 7

    def read_leb128_str(self) -> str:
        sz = self.read_leb128()
        return self.read_bytes(sz).decode()

    def read_uint64(self) -> int:
        return int.from_bytes(self.read_bytes(8), 'little', signed=False)

    def read_str_col(self,
                     num_rows: int,
                     encoding: str,
                     nullable: bool = False,
                     null_obj: Any = None) -> Iterable[str]:
        column = []
        app = column.append
        null_map = self.read_bytes(num_rows) if nullable else None
        for ix in range(num_rows):
            sz = 0
            shift = 0
            while True:
                b = self.read_byte()
                sz += ((b & 0x7f) << shift)
                if (b & 0x80) == 0:
                    break
                shift += 7
            x = self.read_bytes(sz)
            if null_map and null_map[ix]:
                app(null_obj)
            elif encoding:
                try:
                    app(x.decode(encoding))
                except UnicodeDecodeError:
                    app(x.hex())
            else:
                app(x)
        return column

    def read_bytes_col(self, sz: int, num_rows: int) -> Iterable[bytes]:
        source = self.read_bytes(sz * num_rows)
        return [bytes(source[x:x+sz]) for x in range(0, sz * num_rows, sz)]

    def read_fixed_str_col(self, sz: int, num_rows: int, encoding: str) -> Iterable[str]:
        source = self.read_bytes(sz * num_rows)
        column = []
        app = column.append
        for ix in range(0, sz * num_rows, sz):
            try:
                app(str(source[ix: ix + sz], encoding).rstrip('\x00'))
            except UnicodeDecodeError:
                app(source[ix: ix + sz].hex())
        return column

    def read_array(self, array_type: str, num_rows: int) -> Iterable[Any]:
        column = array.array(array_type)
        sz = column.itemsize * num_rows
        b = self.read_bytes(sz)
        column.frombytes(b)
        if must_swap:
            column.byteswap()
        return column

    @property
    def last_message(self):
        if len(self.buffer) == 0:
            return None
        return self.buffer.decode()

    def close(self):
        if self.source:
            self.source.close()
            self.source = None
