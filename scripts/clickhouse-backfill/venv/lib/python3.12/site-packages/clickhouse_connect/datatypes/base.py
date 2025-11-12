import array
import logging

from abc import ABC
from math import log
from typing import NamedTuple, Dict, Type, Any, Sequence, MutableSequence, Optional, Union, Collection

from clickhouse_connect.driver.common import array_type, int_size, write_array, write_uint64, low_card_version
from clickhouse_connect.driver.context import BaseQueryContext
from clickhouse_connect.driver.ctypes import numpy_conv, data_conv
from clickhouse_connect.driver.exceptions import NotSupportedError
from clickhouse_connect.driver.insert import InsertContext
from clickhouse_connect.driver.query import QueryContext
from clickhouse_connect.driver.types import ByteSource
from clickhouse_connect.driver.options import np, pd

logger = logging.getLogger(__name__)
ch_read_formats = {}
ch_write_formats = {}


class TypeDef(NamedTuple):
    """
    Immutable tuple that contains all additional information needed to construct a particular ClickHouseType
    """
    wrappers: tuple = ()
    keys: tuple = ()
    values: tuple = ()

    @property
    def arg_str(self):
        return f"({', '.join(str(v) for v in self.values)})" if self.values else ''


class ClickHouseType(ABC):
    """
    Base class for all ClickHouseType objects.
    """
    __slots__ = 'nullable', 'low_card', 'wrappers', 'type_def', '__dict__'
    _name_suffix = ''
    encoding = 'utf8'
    np_type = 'O'  # Default to Numpy Object type
    nano_divisor = 0  # Only relevant for date like objects
    byte_size = 0
    valid_formats = 'native'

    python_type = None
    base_type = None

    def __init_subclass__(cls, registered: bool = True):
        if registered:
            cls.base_type = cls.__name__
            type_map[cls.base_type] = cls

    @classmethod
    def build(cls: Type['ClickHouseType'], type_def: TypeDef):
        return cls(type_def)

    @classmethod
    def _active_format(cls, fmt_map: Dict[Type['ClickHouseType'], str], ctx: BaseQueryContext):
        ctx_fmt = ctx.active_fmt(cls.base_type)
        if ctx_fmt:
            return ctx_fmt
        return fmt_map.get(cls, 'native')

    @classmethod
    def read_format(cls, ctx: BaseQueryContext):
        return cls._active_format(ch_read_formats, ctx)

    @classmethod
    def write_format(cls, ctx: BaseQueryContext):
        return cls._active_format(ch_write_formats, ctx)

    def __init__(self, type_def: TypeDef):
        """
        Base class constructor that sets Nullable and LowCardinality wrappers
        :param type_def:  ClickHouseType base configuration parameters
        """
        self.type_def = type_def
        self.wrappers = type_def.wrappers
        self.low_card = 'LowCardinality' in self.wrappers
        self.nullable = 'Nullable' in self.wrappers

    def __eq__(self, other):
        return other.__class__ == self.__class__ and self.type_def == other.type_def

    def __hash__(self):
        return hash((self.type_def, self.__class__))

    @property
    def name(self):
        name = f'{self.base_type}{self._name_suffix}'
        for wrapper in reversed(self.wrappers):
            name = f'{wrapper}({name})'
        return name

    def data_size(self, sample: Sequence) -> int:
        if self.low_card:
            values = set(sample)
            d_size = self._data_size(values) + 2
        else:
            d_size = self._data_size(sample)
        if self.nullable:
            d_size += 1
        return d_size

    def _data_size(self, _sample: Collection) -> int:
        if self.byte_size:
            return self.byte_size
        return 0

    def write_column_prefix(self, dest: bytearray):
        """
        Prefix is primarily used is for the LowCardinality version (but see the JSON data type).  Because of the
        way the ClickHouse C++ code is written, this must be done before any data is written even if the
        LowCardinality column is within a container.  The only recognized low cardinality version is 1
        :param dest: The native protocol binary write buffer
        """
        if self.low_card:
            write_uint64(low_card_version, dest)

    def read_column_prefix(self, source: ByteSource):
        """
        Read the low cardinality version.  Like the write method, this has to happen immediately for container classes
        :param source: The native protocol binary read buffer
        :return: updated read pointer
        """
        if self.low_card:
            v = source.read_uint64()
            if v != low_card_version:
                logger.warning('Unexpected low cardinality version %d reading type %s', v, self.name)

    def read_column(self, source: ByteSource, num_rows: int, ctx: QueryContext) -> Sequence:
        """
        Wrapping read method for all ClickHouseType data types.  Only overridden for container classes so that
         the LowCardinality version is read for the contained types
        :param source: Native protocol binary read buffer
        :param num_rows: Number of rows expected in the column
        :param ctx: QueryContext for query specific settings
        :return: The decoded column data as a sequence and the updated location pointer
        """
        self.read_column_prefix(source)
        return self.read_column_data(source, num_rows, ctx)

    def read_column_data(self, source: ByteSource, num_rows: int, ctx: QueryContext) -> Sequence:
        """
        Public read method for all ClickHouseType data type columns
        :param source: Native protocol binary read buffer
        :param num_rows: Number of rows expected in the column
        :param ctx: QueryContext for query specific settings
        :return: The decoded column plus the updated location pointer
        """
        if self.low_card:
            column = self._read_low_card_column(source, num_rows, ctx)
        elif self.nullable:
            column = self._read_nullable_column(source, num_rows, ctx)
        else:
            column = self._read_column_binary(source, num_rows, ctx)
        return self._finalize_column(column, ctx)

    def _read_nullable_column(self, source: ByteSource, num_rows: int, ctx: QueryContext) -> Sequence:
        null_map = source.read_bytes(num_rows)
        column = self._read_column_binary(source, num_rows, ctx)
        null_obj = self._active_null(ctx)
        return data_conv.build_nullable_column(column, null_map, null_obj)

    # The binary methods are really abstract, but they aren't implemented for container classes which
    # delegate binary operations to their elements

    # pylint: disable=no-self-use
    def _read_column_binary(self,
                            _source: ByteSource,
                            _num_rows: int, _ctx: QueryContext) -> Union[Sequence, MutableSequence]:
        """
        Lowest level read method for ClickHouseType native data columns
        :param _source: Native protocol binary read buffer
        :param _num_rows: Expected number of rows in the column
        :return: Decoded column plus updated read buffer
        """
        return [], 0

    def _finalize_column(self, column: Sequence, _ctx: QueryContext) -> Sequence:
        return column

    def _write_column_binary(self, column: Union[Sequence, MutableSequence], dest: bytearray, ctx: InsertContext):
        """
        Lowest level write method for ClickHouseType data columns
        :param column: Python data column
        :param dest: Native protocol write buffer
        :param ctx: Insert Context with insert specific settings
        """

    def write_column(self, column: Sequence, dest: bytearray, ctx: InsertContext):
        """
        Wrapping write method for ClickHouseTypes.  Only overridden for container types that so that
        the write_native_prefix is done at the right time for contained types
        :param column: Column/sequence of Python values to write
        :param dest: Native binary write buffer
        :param ctx: Insert Context with insert specific settings
        """
        self.write_column_prefix(dest)
        self.write_column_data(column, dest, ctx)

    def write_column_data(self, column: Sequence, dest: bytearray, ctx: InsertContext):
        """
        Public native write method for ClickHouseTypes.  Delegates the actual write to either the LowCardinality
        write method or the _write_native_binary method of the type
        :param column: Sequence of Python data
        :param dest: Native binary write buffer
        :param ctx: Insert Context with insert specific settings
        """
        if self.low_card:
            self._write_column_low_card(column, dest, ctx)
        else:
            if self.nullable:
                dest += bytes([1 if x is None else 0 for x in column])
            self._write_column_binary(column, dest, ctx)

    # pylint: disable=no-member
    def _read_low_card_column(self, source: ByteSource, num_rows: int, ctx: QueryContext):
        if num_rows == 0:
            return []
        key_data = source.read_uint64()
        key_sz = 2 ** (key_data & 0xff)
        index_cnt = source.read_uint64()
        index = self._read_column_binary(source, index_cnt, ctx)
        key_cnt = source.read_uint64()
        keys = source.read_array(array_type(key_sz, False), key_cnt)
        if self.nullable:
            return self._build_lc_nullable_column(index, keys, ctx)
        return self._build_lc_column(index, keys, ctx)

    def _build_lc_column(self, index: Sequence, keys: array.array, _ctx: QueryContext):
        return [index[key] for key in keys]

    def _build_lc_nullable_column(self, index: Sequence, keys: array.array, ctx: QueryContext):
        return data_conv.build_lc_nullable_column(index, keys, self._active_null(ctx))

    def _write_column_low_card(self, column: Sequence, dest: bytearray, ctx: InsertContext):
        if len(column) == 0:
            return
        keys = []
        index = []
        rev_map = {}
        rmg = rev_map.get
        if self.nullable:
            index.append(None)
            key = 1
            for x in column:
                if x is None:
                    keys.append(0)
                else:
                    ix = rmg(x)
                    if ix is None:
                        keys.append(key)
                        index.append(x)
                        rev_map[x] = key
                        key += 1
                    else:
                        keys.append(ix)
        else:
            key = 0
            for x in column:
                ix = rmg(x)
                if ix is None:
                    keys.append(key)
                    index.append(x)
                    rev_map[x] = key
                    key += 1
                else:
                    keys.append(ix)
        ix_type = int(log(len(index), 2)) >> 3  # power of two bytes needed to store the total number of keys
        write_uint64((1 << 9) | (1 << 10) | ix_type, dest)  # Index type plus new dictionary (9) and additional keys(10)
        write_uint64(len(index), dest)
        self._write_column_binary(index, dest, ctx)
        write_uint64(len(keys), dest)
        write_array(array_type(1 << ix_type, False), keys, dest)

    def _active_null(self, _ctx: QueryContext) -> Any:
        return None

    def _first_value(self, column: Sequence) -> Optional[Any]:
        if self.nullable:
            return next((x for x in column if x is not None), None)
        if len(column):
            return column[0]
        return None


EMPTY_TYPE_DEF = TypeDef()
NULLABLE_TYPE_DEF = TypeDef(wrappers=('Nullable',))
LC_TYPE_DEF = TypeDef(wrappers=('LowCardinality',))
type_map: Dict[str, Type[ClickHouseType]] = {}


class ArrayType(ClickHouseType, ABC, registered=False):
    """
    ClickHouse type that utilizes Python or Numpy arrays for fast reads and writes of binary data.
    arrays can only be used for ClickHouse types that can be translated into UInt64 (and smaller) integers
    or Float32/64
    """
    _signed = True
    _array_type = None
    _struct_type = None
    valid_formats = 'string', 'native'
    python_type = int

    def __init_subclass__(cls, registered: bool = True):
        super().__init_subclass__(registered)
        if cls._array_type in ('i', 'I') and int_size == 2:
            cls._array_type = 'L' if cls._array_type.isupper() else 'l'
        if isinstance(cls._array_type, str) and cls._array_type:
            cls._struct_type = '<' + cls._array_type
            cls.byte_size = array.array(cls._array_type).itemsize

    def _read_column_binary(self, source: ByteSource, num_rows: int, ctx: QueryContext):
        if ctx.use_numpy:
            return numpy_conv.read_numpy_array(source, self.np_type, num_rows)
        return source.read_array(self._array_type, num_rows)

    def _read_nullable_column(self, source: ByteSource, num_rows: int, ctx: QueryContext) -> Sequence:
        return data_conv.read_nullable_array(source, self._array_type, num_rows, self._active_null(ctx))

    def _build_lc_column(self, index: Sequence, keys: array.array, ctx: QueryContext):
        if ctx.use_numpy:
            return np.fromiter((index[key] for key in keys), dtype=index.dtype, count=len(index))
        return super()._build_lc_column(index, keys, ctx)

    def _finalize_column(self, column: Sequence, ctx: QueryContext) -> Sequence:
        if self.read_format(ctx) == 'string':
            return [str(x) for x in column]
        if ctx.use_extended_dtypes and self.nullable:
            return pd.array(column, dtype=self.base_type)
        if ctx.use_numpy and self.nullable and (not ctx.use_none):
            return np.array(column, dtype=self.np_type)
        return column

    def _write_column_binary(self, column: Union[Sequence, MutableSequence], dest: bytearray, ctx: InsertContext):
        if len(column) and self.nullable:
            column = [0 if x is None else x for x in column]
        write_array(self._array_type, column, dest)

    def _active_null(self, ctx: QueryContext):
        if ctx.as_pandas and ctx.use_extended_dtypes:
            return pd.NA
        if ctx.use_none:
            return None
        return 0


class UnsupportedType(ClickHouseType, ABC, registered=False):
    """
    Base class for ClickHouse types that can't be serialized/deserialized into Python types.
    Mostly useful just for DDL statements
    """
    def __init__(self, type_def: TypeDef):
        super().__init__(type_def)
        self._name_suffix = type_def.arg_str

    def _read_column_binary(self, source: Sequence, num_rows: int, ctx: QueryContext):
        raise NotSupportedError(f'{self.name} deserialization not supported')

    def _write_column_binary(self, column: Union[Sequence, MutableSequence], dest: bytearray, ctx: InsertContext):
        raise NotSupportedError(f'{self.name} serialization  not supported')
