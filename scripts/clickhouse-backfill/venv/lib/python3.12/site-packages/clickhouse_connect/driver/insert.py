import logging
from math import log
from typing import Iterable, Sequence, Optional, Any, Dict, NamedTuple, Generator, Union, TYPE_CHECKING

from clickhouse_connect.driver.query import quote_identifier

from clickhouse_connect.driver.ctypes import data_conv
from clickhouse_connect.driver.context import BaseQueryContext
from clickhouse_connect.driver.options import np, pd, pd_time_test
from clickhouse_connect.driver.exceptions import ProgrammingError

if TYPE_CHECKING:
    from clickhouse_connect.datatypes.base import ClickHouseType

logger = logging.getLogger(__name__)
DEFAULT_BLOCK_BYTES = 1 << 21   # Try to generate blocks between 1MB and 2MB in raw size


class InsertBlock(NamedTuple):
    prefix: bytes
    column_count: int
    row_count: int
    column_names: Iterable[str]
    column_types: Iterable['ClickHouseType']
    column_data: Iterable[Sequence[Any]]


# pylint: disable=too-many-instance-attributes
class InsertContext(BaseQueryContext):
    """
    Reusable Argument/parameter object for inserts.
    """

    # pylint: disable=too-many-arguments
    def __init__(self,
                 table: str,
                 column_names: Sequence[str],
                 column_types: Sequence['ClickHouseType'],
                 data: Any = None,
                 column_oriented: Optional[bool] = None,
                 settings: Optional[Dict[str, Any]] = None,
                 compression: Optional[Union[str, bool]] = None,
                 query_formats: Optional[Dict[str, str]] = None,
                 column_formats: Optional[Dict[str, Union[str, Dict[str, str]]]] = None,
                 block_size: Optional[int] = None):
        super().__init__(settings, query_formats, column_formats)
        self.table = table
        self.column_names = column_names
        self.column_types = column_types
        self.column_oriented = False if column_oriented is None else column_oriented
        self.compression = compression
        self.req_block_size = block_size
        self.block_row_count = DEFAULT_BLOCK_BYTES
        self.data = data
        self.insert_exception = None

    @property
    def empty(self) -> bool:
        return self._data is None

    @property
    def data(self):
        return self._raw_data

    @data.setter
    def data(self, data: Any):
        self._raw_data = data
        self.current_block = 0
        self.current_row = 0
        self.row_count = 0
        self.column_count = 0
        self._data = None
        if data is None or len(data) == 0:
            return
        if pd and isinstance(data, pd.DataFrame):
            data = self._convert_pandas(data)
            self.column_oriented = True
        if np and isinstance(data, np.ndarray):
            data = self._convert_numpy(data)
        if self.column_oriented:
            self._next_block_data = self._column_block_data
            self._block_columns = data  # [SliceView(column) for column in data]
            self._block_rows = None
            self.column_count = len(data)
            self.row_count = len(data[0])
        else:
            self._next_block_data = self._row_block_data
            self._block_rows = data
            self._block_columns = None
            self.row_count = len(data)
            self.column_count = len(data[0])
        if self.row_count and self.column_count:
            if self.column_count != len(self.column_names):
                raise ProgrammingError('Insert data column count does not match column names')
            self._data = data
            self.block_row_count = self._calc_block_size()

    def _calc_block_size(self) -> int:
        if self.req_block_size:
            return self.req_block_size
        row_size = 0
        sample_size = min((log(self.row_count) + 1) * 2, 64)
        sample_freq = max(1, int(self.row_count / sample_size))
        for i, d_type in enumerate(self.column_types):
            if d_type.byte_size:
                row_size += d_type.byte_size
                continue
            if self.column_oriented:
                col_data = self._data[i]
                if sample_freq == 1:
                    d_size = d_type.data_size(col_data)
                else:
                    sample = [col_data[j] for j in range(0, self.row_count, sample_freq)]
                    d_size = d_type.data_size(sample)
            else:
                data = self._data
                sample = [data[j][i] for j in range(0, self.row_count, sample_freq)]
                d_size = d_type.data_size(sample)
            row_size += d_size
        shift_size = (21 - int(log(row_size, 2)))
        return 1 if shift_size < 0 else 1 << (21 - int(log(row_size, 2)))

    def next_block(self) -> Generator[InsertBlock, None, None]:
        while True:
            block_end = min(self.current_row + self.block_row_count, self.row_count)
            row_count = block_end - self.current_row
            if row_count <= 0:
                return
            if self.current_block == 0:
                cols = f" ({', '.join([quote_identifier(x) for x in self.column_names])})"
                prefix = f'INSERT INTO {self.table}{cols} FORMAT Native\n'.encode()
            else:
                prefix = bytes()
            self.current_block += 1
            data = self._next_block_data(self.current_row, block_end)
            yield InsertBlock(prefix, self.column_count, row_count, self.column_names, self.column_types, data)
            self.current_row = block_end

    def _column_block_data(self, block_start, block_end):
        if block_start == 0 and self.row_count <= block_end:
            return self._block_columns  # Optimization if we don't need to break up the block
        return [col[block_start: block_end] for col in self._block_columns]

    def _row_block_data(self, block_start, block_end):
        return data_conv.pivot(self._block_rows, block_start, block_end)

    def _convert_pandas(self, df):
        data = []
        for df_col_name, col_name, ch_type in zip(df.columns, self.column_names, self.column_types):
            df_col = df[df_col_name]
            d_type = str(df_col.dtype)
            if ch_type.python_type == int:
                if 'float' in d_type:
                    df_col = df_col.round().astype(ch_type.base_type, copy=False)
                else:
                    df_col = df_col.astype(ch_type.base_type, copy=False)
            elif 'datetime' in ch_type.np_type and (pd_time_test(df_col) or 'datetime64[ns' in d_type):
                div = ch_type.nano_divisor
                data.append([None if pd.isnull(x) else x.value // div for x in df_col])
                self.column_formats[col_name] = 'int'
                continue
            if ch_type.nullable:
                if d_type == 'object':
                    #  This is ugly, but the multiple replaces seem required as a result of this bug:
                    #  https://github.com/pandas-dev/pandas/issues/29024
                    df_col = df_col.replace({pd.NaT: None}).replace({np.nan: None})
                elif 'Float' in ch_type.base_type:
                    #  This seems to be the only way to convert any null looking things to nan
                    df_col = df_col.astype(ch_type.np_type)
                else:
                    df_col = df_col.replace({np.nan: None})
            data.append(df_col.to_numpy(copy=False))
        return data

    def _convert_numpy(self, np_array):
        if np_array.dtype.names is None:
            if 'date' in str(np_array.dtype):
                for col_name, col_type in zip(self.column_names, self.column_types):
                    if 'date' in col_type.np_type:
                        self.column_formats[col_name] = 'int'
                return np_array.astype('int').tolist()
            for col_type in self.column_types:
                if col_type.byte_size == 0 or col_type.byte_size > np_array.dtype.itemsize:
                    return np_array.tolist()
            return np_array

        if set(self.column_names).issubset(set(np_array.dtype.names)):
            data = [np_array[col_name] for col_name in self.column_names]
        else:
            # Column names don't match, so we have to assume they are in order
            data = [np_array[col_name] for col_name in np_array.dtype.names]
        for ix, (col_name, col_type) in enumerate(zip(self.column_names, self.column_types)):
            d_type = data[ix].dtype
            if 'date' in str(d_type) and 'date' in col_type.np_type:
                self.column_formats[col_name] = 'int'
                data[ix] = data[ix].astype(int).tolist()
            elif col_type.byte_size == 0 or col_type.byte_size > d_type.itemsize:
                data[ix] = data[ix].tolist()
        self.column_oriented = True
        return data
