import array
import logging
from typing import Sequence, Collection

from clickhouse_connect.driver.insert import InsertContext
from clickhouse_connect.driver.query import QueryContext, quote_identifier
from clickhouse_connect.driver.types import ByteSource
from clickhouse_connect.json_impl import any_to_json
from clickhouse_connect.datatypes.base import ClickHouseType, TypeDef
from clickhouse_connect.driver.common import must_swap
from clickhouse_connect.datatypes.registry import get_from_name

logger = logging.getLogger(__name__)


class Array(ClickHouseType):
    __slots__ = ('element_type',)
    python_type = list

    def __init__(self, type_def: TypeDef):
        super().__init__(type_def)
        self.element_type = get_from_name(type_def.values[0])
        self._name_suffix = f'({self.element_type.name})'

    def read_column_prefix(self, source: ByteSource):
        return self.element_type.read_column_prefix(source)

    def _data_size(self, sample: Sequence) -> int:
        if len(sample) == 0:
            return 8
        total = 0
        for x in sample:
            total += self.element_type.data_size(x)
        return total // len(sample) + 8

    # pylint: disable=too-many-locals
    def read_column_data(self, source: ByteSource, num_rows: int, ctx: QueryContext):
        final_type = self.element_type
        depth = 1
        while isinstance(final_type, Array):
            depth += 1
            final_type = final_type.element_type
        level_size = num_rows
        offset_sizes = []
        for _ in range(depth):
            level_offsets = source.read_array('Q', level_size)
            offset_sizes.append(level_offsets)
            level_size = level_offsets[-1] if level_offsets else 0
        if level_size:
            all_values = final_type.read_column_data(source, level_size, ctx)
        else:
            all_values = []
        column = all_values if isinstance(all_values, list) else list(all_values)
        for offset_range in reversed(offset_sizes):
            data = []
            last = 0
            for x in offset_range:
                data.append(column[last: x])
                last = x
            column = data
        return column

    def write_column_prefix(self, dest: bytearray):
        self.element_type.write_column_prefix(dest)

    def write_column_data(self, column: Sequence, dest: bytearray, ctx: InsertContext):
        final_type = self.element_type
        depth = 1
        while isinstance(final_type, Array):
            depth += 1
            final_type = final_type.element_type
        for _ in range(depth):
            total = 0
            data = []
            offsets = array.array('Q')
            for x in column:
                total += len(x)
                offsets.append(total)
                data.extend(x)
            if must_swap:
                offsets.byteswap()
            dest += offsets.tobytes()
            column = data
        final_type.write_column_data(column, dest, ctx)


class Tuple(ClickHouseType):
    _slots = 'element_names', 'element_types'
    python_type = tuple
    valid_formats = 'tuple', 'dict', 'json', 'native'  # native is 'tuple' for unnamed tuples, and dict for named tuples

    def __init__(self, type_def: TypeDef):
        super().__init__(type_def)
        self.element_names = type_def.keys
        self.element_types = [get_from_name(name) for name in type_def.values]
        if self.element_names:
            self._name_suffix = f"({', '.join(quote_identifier(k) + ' ' + str(v) for k, v in zip(type_def.keys, type_def.values))})"
        else:
            self._name_suffix = type_def.arg_str

    def _data_size(self, sample: Collection) -> int:
        if len(sample) == 0:
            return 0
        elem_size = 0
        is_dict = self.element_names and isinstance(self._first_value(list(sample)), dict)
        for ix, e_type in enumerate(self.element_types):
            if e_type.byte_size > 0:
                elem_size += e_type.byte_size
            elif is_dict:
                elem_size += e_type.data_size([x.get(self.element_names[ix], None) for x in sample])
            else:
                elem_size += e_type.data_size([x[ix] for x in sample])
        return elem_size

    def read_column_prefix(self, source: ByteSource):
        for e_type in self.element_types:
            e_type.read_column_prefix(source)

    def read_column_data(self, source: ByteSource, num_rows: int, ctx: QueryContext):
        columns = []
        e_names = self.element_names
        for e_type in self.element_types:
            column = e_type.read_column_data(source, num_rows, ctx)
            columns.append(column)
        if e_names and self.read_format(ctx) != 'tuple':
            dicts = [{} for _ in range(num_rows)]
            for ix, x in enumerate(dicts):
                for y, key in enumerate(e_names):
                    x[key] = columns[y][ix]
            if self.read_format(ctx) == 'json':
                to_json = any_to_json
                return [to_json(x) for x in dicts]
            return dicts
        return tuple(zip(*columns))

    def write_column_prefix(self, dest: bytearray):
        for e_type in self.element_types:
            e_type.write_column_prefix(dest)

    def write_column_data(self, column: Sequence, dest: bytearray, ctx: InsertContext):
        if self.element_names and isinstance(self._first_value(column), dict):
            columns = self.convert_dict_insert(column)
        else:
            columns = list(zip(*column))
        for e_type, elem_column in zip(self.element_types, columns):
            e_type.write_column_data(elem_column, dest, ctx)

    def convert_dict_insert(self, column: Sequence) -> Sequence:
        names = self.element_names
        col = [[] for _ in names]
        for x in column:
            for ix, name in enumerate(names):
                col[ix].append(x.get(name))
        return col


class Point(Tuple):

    def __init__(self, type_def):
        super().__init__(type_def)
        self._name_suffix = ''


class Map(ClickHouseType):
    _slots = 'key_type', 'value_type'
    python_type = dict

    def __init__(self, type_def: TypeDef):
        super().__init__(type_def)
        self.key_type = get_from_name(type_def.values[0])
        self.value_type = get_from_name(type_def.values[1])
        self._name_suffix = type_def.arg_str

    def _data_size(self, sample: Collection) -> int:
        total = 0
        if len(sample) == 0:
            return 0
        for x in sample:
            total += self.key_type.data_size(x.keys())
            total += self.value_type.data_size(x.values())
        return total // len(sample)

    def read_column_prefix(self, source: ByteSource):
        self.key_type.read_column_prefix(source)
        self.value_type.read_column_prefix(source)

    # pylint: disable=too-many-locals
    def read_column_data(self, source: ByteSource, num_rows: int, ctx: QueryContext):
        offsets = source.read_array('Q', num_rows)
        total_rows = 0 if len(offsets) == 0 else offsets[-1]
        keys = self.key_type.read_column_data(source, total_rows, ctx)
        values = self.value_type.read_column_data(source, total_rows, ctx)
        all_pairs = tuple(zip(keys, values))
        column = []
        app = column.append
        last = 0
        for offset in offsets:
            app(dict(all_pairs[last: offset]))
            last = offset
        return column

    def write_column_prefix(self, dest: bytearray):
        self.key_type.write_column_prefix(dest)
        self.value_type.write_column_prefix(dest)

    def write_column_data(self, column: Sequence, dest: bytearray, ctx: InsertContext):
        offsets = array.array('Q')
        keys = []
        values = []
        total = 0
        for v in column:
            total += len(v)
            offsets.append(total)
            keys.extend(v.keys())
            values.extend(v.values())
        if must_swap:
            offsets.byteswap()
        dest += offsets.tobytes()
        self.key_type.write_column_data(keys, dest, ctx)
        self.value_type.write_column_data(values, dest, ctx)


class Nested(ClickHouseType):
    __slots__ = 'tuple_array', 'element_names', 'element_types'
    python_type = Sequence[dict]

    def __init__(self, type_def):
        super().__init__(type_def)
        self.element_names = type_def.keys
        self.tuple_array = get_from_name(f"Array(Tuple({','.join(type_def.values)}))")
        self.element_types = self.tuple_array.element_type.element_types
        cols = [f'{x[0]} {x[1].name}' for x in zip(type_def.keys, self.element_types)]
        self._name_suffix = f"({', '.join(cols)})"

    def _data_size(self, sample: Collection) -> int:
        keys = self.element_names
        array_sample = [[tuple(sub_row[key] for key in keys) for sub_row in row] for row in sample]
        return self.tuple_array.data_size(array_sample)

    def read_column_prefix(self, source: ByteSource):
        self.tuple_array.read_column_prefix(source)

    def read_column_data(self, source: ByteSource, num_rows: int, ctx: QueryContext):
        keys = self.element_names
        data = self.tuple_array.read_column_data(source, num_rows, ctx)
        return [[dict(zip(keys, x)) for x in row] for row in data]

    def write_column_prefix(self, dest: bytearray):
        self.tuple_array.write_column_prefix(dest)

    def write_column_data(self, column: Sequence, dest: bytearray, ctx: InsertContext):
        keys = self.element_names
        data = [[tuple(sub_row[key] for key in keys) for sub_row in row] for row in column]
        self.tuple_array.write_column_data(data, dest, ctx)


class JSON(ClickHouseType):
    python_type = dict
    # Native is a Python type (primitive, dict, array), string is an actual JSON string
    valid_formats = 'string', 'native'

    def write_column_prefix(self, dest: bytearray):
        dest.append(0x01)

    def _data_size(self, sample: Collection) -> int:
        if len(sample) == 0:
            return 0
        total = 0
        for x in sample:
            if isinstance(x, str):
                total += len(x)
            elif x:
                total += len(any_to_json(x))
        return total // len(sample) + 1

    # pylint: disable=duplicate-code
    def write_column_data(self, column: Sequence, dest: bytearray, ctx: InsertContext):
        app = dest.append
        first = self._first_value(column)
        if isinstance(first, str) or self.write_format(ctx) == 'string':
            for x in column:
                v = x.encode()
                sz = len(v)
                while True:
                    b = sz & 0x7f
                    sz >>= 7
                    if sz == 0:
                        app(b)
                        break
                    app(0x80 | b)
                dest += v
        else:
            to_json = any_to_json
            for x in column:
                v = to_json(x)
                sz = len(v)
                while True:
                    b = sz & 0x7f
                    sz >>= 7
                    if sz == 0:
                        app(b)
                        break
                    app(0x80 | b)
                dest += v


class Object(JSON):
    python_type = dict

    def __init__(self, type_def):
        data_type = type_def.values[0].lower().replace(' ', '')
        if data_type not in ("'json'", "nullable('json')"):
            raise NotImplementedError('Only json or Nullable(json) Object type is currently supported')
        super().__init__(type_def)
        self._name_suffix = type_def.arg_str
