import ipaddress
import logging
import re
import uuid
import pytz

from enum import Enum
from io import IOBase
from typing import Any, Tuple, Dict, Sequence, Optional, Union, Generator
from datetime import date, datetime, tzinfo

from pytz.exceptions import UnknownTimeZoneError

from clickhouse_connect import common
from clickhouse_connect.driver import tzutil
from clickhouse_connect.driver.common import dict_copy, empty_gen, StreamContext
from clickhouse_connect.driver.external import ExternalData
from clickhouse_connect.driver.types import Matrix, Closable
from clickhouse_connect.json_impl import any_to_json
from clickhouse_connect.driver.exceptions import StreamClosedError, ProgrammingError
from clickhouse_connect.driver.options import check_arrow, pd_extended_dtypes
from clickhouse_connect.driver.context import BaseQueryContext

logger = logging.getLogger(__name__)
commands = 'CREATE|ALTER|SYSTEM|GRANT|REVOKE|CHECK|DETACH|ATTACH|DROP|DELETE|KILL|' + \
           'OPTIMIZE|SET|RENAME|TRUNCATE|USE'

limit_re = re.compile(r'\s+LIMIT($|\s)', re.IGNORECASE)
select_re = re.compile(r'(^|\s)SELECT\s', re.IGNORECASE)
insert_re = re.compile(r'(^|\s)INSERT\s*INTO', re.IGNORECASE)
command_re = re.compile(r'(^\s*)(' + commands + r')\s', re.IGNORECASE)
external_bind_re = re.compile(r'{.+:.+}')


# pylint: disable=too-many-instance-attributes
class QueryContext(BaseQueryContext):
    """
    Argument/parameter object for queries.  This context is used to set thread/query specific formats
    """

    # pylint: disable=duplicate-code,too-many-arguments,too-many-locals
    def __init__(self,
                 query: Union[str, bytes] = '',
                 parameters: Optional[Dict[str, Any]] = None,
                 settings: Optional[Dict[str, Any]] = None,
                 query_formats: Optional[Dict[str, str]] = None,
                 column_formats: Optional[Dict[str, Union[str, Dict[str, str]]]] = None,
                 encoding: Optional[str] = None,
                 server_tz: tzinfo = pytz.UTC,
                 use_none: Optional[bool] = None,
                 column_oriented: Optional[bool] = None,
                 use_numpy: Optional[bool] = None,
                 max_str_len: Optional[int] = 0,
                 query_tz: Optional[Union[str, tzinfo]] = None,
                 column_tzs: Optional[Dict[str, Union[str, tzinfo]]] = None,
                 use_extended_dtypes: Optional[bool] = None,
                 as_pandas: bool = False,
                 streaming: bool = False,
                 apply_server_tz: bool = False,
                 external_data: Optional[ExternalData] = None):
        """
        Initializes various configuration settings for the query context

        :param query:  Query string with Python style format value replacements
        :param parameters: Optional dictionary of substitution values
        :param settings: Optional ClickHouse settings for the query
        :param query_formats: Optional dictionary of query formats with the key of a ClickHouse type name
          (with * wildcards) and a value of valid query formats for those types.
          The value 'encoding' can be sent to change the expected encoding for this query, with a value of
          the desired encoding such as `latin-1`
        :param column_formats: Optional dictionary of column specific formats.  The key is the column name,
          The value is either the format for the data column (such as 'string' for a UUID column) or a
          second level "format" dictionary of a ClickHouse type name and a value of query formats.  This
          secondary dictionary can be used for nested column types such as Tuples or Maps
        :param encoding: Optional string encoding for this query, such as 'latin-1'
        :param column_formats: Optional dictionary
        :param use_none: Use a Python None for ClickHouse NULL values in nullable columns.  Otherwise the default
          value of the column (such as 0 for numbers) will be returned in the result_set
        :param max_str_len Limit returned ClickHouse String values to this length, which allows a Numpy
          structured array even with ClickHouse variable length String columns.  If 0, Numpy arrays for
          String columns will always be object arrays
        :param query_tz  Either a string or a pytz tzinfo object.  (Strings will be converted to tzinfo objects).
          Values for any DateTime or DateTime64 column in the query will be converted to Python datetime.datetime
          objects with the selected timezone
        :param column_tzs A dictionary of column names to tzinfo objects (or strings that will be converted to
          tzinfo objects).  The timezone will be applied to datetime objects returned in the query
        """
        super().__init__(settings,
                         query_formats,
                         column_formats,
                         encoding,
                         use_extended_dtypes if use_extended_dtypes is not None else False,
                         use_numpy if use_numpy is not None else False)
        self.query = query
        self.parameters = parameters or {}
        self.use_none = True if use_none is None else use_none
        self.column_oriented = False if column_oriented is None else column_oriented
        self.use_numpy = use_numpy
        self.max_str_len = 0 if max_str_len is None else max_str_len
        self.server_tz = server_tz
        self.apply_server_tz = apply_server_tz
        self.external_data = external_data
        if isinstance(query_tz, str):
            try:
                query_tz = pytz.timezone(query_tz)
            except UnknownTimeZoneError as ex:
                raise ProgrammingError(f'query_tz {query_tz} is not recognized') from ex
        self.query_tz = query_tz
        if column_tzs is not None:
            for col_name, timezone in column_tzs.items():
                if isinstance(timezone, str):
                    try:
                        timezone = pytz.timezone(timezone)
                        column_tzs[col_name] = timezone
                    except UnknownTimeZoneError as ex:
                        raise ProgrammingError(f'column_tz {timezone} is not recognized') from ex
        self.column_tzs = column_tzs
        self.column_tz = None
        self.response_tz = None
        self.block_info = False
        self.as_pandas = as_pandas
        self.use_pandas_na = as_pandas and pd_extended_dtypes
        self.streaming = streaming
        self._update_query()

    @property
    def is_select(self) -> bool:
        return select_re.search(self.uncommented_query) is not None

    @property
    def has_limit(self) -> bool:
        return limit_re.search(self.uncommented_query) is not None

    @property
    def is_insert(self) -> bool:
        return insert_re.search(self.uncommented_query) is not None

    @property
    def is_command(self) -> bool:
        return command_re.search(self.uncommented_query) is not None

    def set_parameters(self, parameters: Dict[str, Any]):
        self.parameters = parameters
        self._update_query()

    def set_parameter(self, key: str, value: Any):
        if not self.parameters:
            self.parameters = {}
        self.parameters[key] = value
        self._update_query()

    def set_response_tz(self, response_tz: tzinfo):
        self.response_tz = response_tz

    def start_column(self, name: str):
        super().start_column(name)
        if self.column_tzs and name in self.column_tzs:
            self.column_tz = self.column_tzs[name]
        else:
            self.column_tz = None

    def active_tz(self, datatype_tz: Optional[tzinfo]):
        if self.column_tz:
            active_tz = self.column_tz
        elif datatype_tz:
            active_tz = datatype_tz
        elif self.query_tz:
            active_tz = self.query_tz
        elif self.response_tz:
            active_tz = self.response_tz
        elif self.apply_server_tz:
            active_tz = self.server_tz
        else:
            active_tz = tzutil.local_tz
        if active_tz == pytz.UTC:
            return None
        return active_tz

    def updated_copy(self,
                     query: Optional[Union[str, bytes]] = None,
                     parameters: Optional[Dict[str, Any]] = None,
                     settings: Optional[Dict[str, Any]] = None,
                     query_formats: Optional[Dict[str, str]] = None,
                     column_formats: Optional[Dict[str, Union[str, Dict[str, str]]]] = None,
                     encoding: Optional[str] = None,
                     server_tz: Optional[tzinfo] = None,
                     use_none: Optional[bool] = None,
                     column_oriented: Optional[bool] = None,
                     use_numpy: Optional[bool] = None,
                     max_str_len: Optional[int] = None,
                     query_tz: Optional[Union[str, tzinfo]] = None,
                     column_tzs: Optional[Dict[str, Union[str, tzinfo]]] = None,
                     use_extended_dtypes: Optional[bool] = None,
                     as_pandas: bool = False,
                     streaming: bool = False,
                     external_data: Optional[ExternalData] = None) -> 'QueryContext':
        """
        Creates Query context copy with parameters overridden/updated as appropriate.
        """
        return QueryContext(query or self.query,
                            dict_copy(self.parameters, parameters),
                            dict_copy(self.settings, settings),
                            dict_copy(self.query_formats, query_formats),
                            dict_copy(self.column_formats, column_formats),
                            encoding if encoding else self.encoding,
                            server_tz if server_tz else self.server_tz,
                            self.use_none if use_none is None else use_none,
                            self.column_oriented if column_oriented is None else column_oriented,
                            self.use_numpy if use_numpy is None else use_numpy,
                            self.max_str_len if max_str_len is None else max_str_len,
                            self.query_tz if query_tz is None else query_tz,
                            self.column_tzs if column_tzs is None else column_tzs,
                            self.use_extended_dtypes if use_extended_dtypes is None else use_extended_dtypes,
                            as_pandas,
                            streaming,
                            self.apply_server_tz,
                            self.external_data if external_data is None else external_data)

    def _update_query(self):
        self.final_query, self.bind_params = bind_query(self.query, self.parameters, self.server_tz)
        if isinstance(self.final_query, bytes):
            # If we've embedded binary data in the query, all bets are off, and we check the original query for comments
            self.uncommented_query = remove_sql_comments(self.query)
        else:
            self.uncommented_query = remove_sql_comments(self.final_query)


class QueryResult(Closable):
    """
    Wrapper class for query return values and metadata
    """

    # pylint: disable=too-many-arguments
    def __init__(self,
                 result_set: Matrix = None,
                 block_gen: Generator[Matrix, None, None] = None,
                 column_names: Tuple = (),
                 column_types: Tuple = (),
                 column_oriented: bool = False,
                 source: Closable = None,
                 query_id: str = None,
                 summary: Dict[str, Any] = None):
        self._result_rows = result_set
        self._result_columns = None
        self._block_gen = block_gen or empty_gen()
        self._in_context = False
        self._query_id = query_id
        self.column_names = column_names
        self.column_types = column_types
        self.column_oriented = column_oriented
        self.source = source
        self.summary = {} if summary is None else summary

    @property
    def result_set(self) -> Matrix:
        if self.column_oriented:
            return self.result_columns
        return self.result_rows

    @property
    def result_columns(self) -> Matrix:
        if self._result_columns is None:
            result = [[] for _ in range(len(self.column_names))]
            with self.column_block_stream as stream:
                for block in stream:
                    for base, added in zip(result, block):
                        base.extend(added)
            self._result_columns = result
        return self._result_columns

    @property
    def result_rows(self) -> Matrix:
        if self._result_rows is None:
            result = []
            with self.row_block_stream as stream:
                for block in stream:
                    result.extend(block)
            self._result_rows = result
        return self._result_rows

    @property
    def query_id(self) -> str:
        query_id = self.summary.get('query_id')
        if query_id:
            return query_id
        return self._query_id

    def _column_block_stream(self):
        if self._block_gen is None:
            raise StreamClosedError
        block_stream = self._block_gen
        self._block_gen = None
        return block_stream

    def _row_block_stream(self):
        for block in self._column_block_stream():
            yield list(zip(*block))

    @property
    def column_block_stream(self) -> StreamContext:
        return StreamContext(self, self._column_block_stream())

    @property
    def row_block_stream(self):
        return StreamContext(self, self._row_block_stream())

    @property
    def rows_stream(self) -> StreamContext:
        def stream():
            for block in self._row_block_stream():
                yield from block

        return StreamContext(self, stream())

    def named_results(self) -> Generator[dict, None, None]:
        for row in zip(*self.result_set) if self.column_oriented else self.result_set:
            yield dict(zip(self.column_names, row))

    @property
    def row_count(self) -> int:
        if self.column_oriented:
            return 0 if len(self.result_set) == 0 else len(self.result_set[0])
        return len(self.result_set)

    @property
    def first_item(self):
        if self.column_oriented:
            return {name: col[0] for name, col in zip(self.column_names, self.result_set)}
        return dict(zip(self.column_names, self.result_set[0]))

    @property
    def first_row(self):
        if self.column_oriented:
            return [col[0] for col in self.result_set]
        return self.result_set[0]

    def close(self):
        if self.source:
            self.source.close()
            self.source = None
        if self._block_gen is not None:
            self._block_gen.close()
            self._block_gen = None


BS = '\\'
must_escape = (BS, '\'', '`', '\t', '\n')


def quote_identifier(identifier: str):
    first_char = identifier[0]
    if first_char in ('`', '"') and identifier[-1] == first_char:
        # Identifier is already quoted, assume that it's valid
        return identifier
    return f'`{escape_str(identifier)}`'


def finalize_query(query: str, parameters: Optional[Union[Sequence, Dict[str, Any]]],
                   server_tz: Optional[tzinfo] = None) -> str:
    while query.endswith(';'):
        query = query[:-1]
    if not parameters:
        return query
    if hasattr(parameters, 'items'):
        return query % {k: format_query_value(v, server_tz) for k, v in parameters.items()}
    return query % tuple(format_query_value(v) for v in parameters)


def bind_query(query: str, parameters: Optional[Union[Sequence, Dict[str, Any]]],
               server_tz: Optional[tzinfo] = None) -> Tuple[str, Dict[str, str]]:
    while query.endswith(';'):
        query = query[:-1]
    if not parameters:
        return query, {}

    binary_binds = None
    if isinstance(parameters, dict):
        binary_binds = {k: v for k, v in parameters.items() if k.startswith('$') and k.endswith('$') and len(k) > 1}
        for key in binary_binds.keys():
            del parameters[key]
    if external_bind_re.search(query) is None:
        query, bound_params = finalize_query(query, parameters, server_tz), {}
    else:
        bound_params = {f'param_{k}': format_bind_value(v, server_tz) for k, v in parameters.items()}
    if binary_binds:
        binary_query = query.encode()
        binary_indexes = {}
        for k, v in binary_binds.items():
            key = k.encode()
            item_index = 0
            while True:
                item_index = binary_query.find(key, item_index)
                if item_index == -1:
                    break
                binary_indexes[item_index + len(key)] = key, v
                item_index += len(key)
        query = b''
        start = 0
        for loc in sorted(binary_indexes.keys()):
            key, value = binary_indexes[loc]
            query += binary_query[start:loc] + value + key
            start = loc
        query += binary_query[start:]
    return query, bound_params


def format_str(value: str):
    return f"'{escape_str(value)}'"


def escape_str(value: str):
    return ''.join(f'{BS}{c}' if c in must_escape else c for c in value)


# pylint: disable=too-many-return-statements
def format_query_value(value: Any, server_tz: tzinfo = pytz.UTC):
    """
    Format Python values in a ClickHouse query
    :param value: Python object
    :param server_tz: Server timezone for adjusting datetime values
    :return: Literal string for python value
    """
    if value is None:
        return 'NULL'
    if isinstance(value, str):
        return format_str(value)
    if isinstance(value, datetime):
        if value.tzinfo is not None or server_tz != pytz.UTC:
            value = value.astimezone(server_tz)
        return f"'{value.strftime('%Y-%m-%d %H:%M:%S')}'"
    if isinstance(value, date):
        return f"'{value.isoformat()}'"
    if isinstance(value, list):
        return f"[{', '.join(str_query_value(x, server_tz) for x in value)}]"
    if isinstance(value, tuple):
        return f"({', '.join(str_query_value(x, server_tz) for x in value)})"
    if isinstance(value, dict):
        if common.get_setting('dict_parameter_format') == 'json':
            return format_str(any_to_json(value).decode())
        pairs = [str_query_value(k, server_tz) + ':' + str_query_value(v, server_tz)
                 for k, v in value.items()]
        return f"{{{', '.join(pairs)}}}"
    if isinstance(value, Enum):
        return format_query_value(value.value, server_tz)
    if isinstance(value, (uuid.UUID, ipaddress.IPv4Address, ipaddress.IPv6Address)):
        return f"'{value}'"
    return value


def str_query_value(value: Any, server_tz: tzinfo = pytz.UTC):
    return str(format_query_value(value, server_tz))


# pylint: disable=too-many-branches
def format_bind_value(value: Any, server_tz: tzinfo = pytz.UTC, top_level: bool = True):
    """
    Format Python values in a ClickHouse query
    :param value: Python object
    :param server_tz: Server timezone for adjusting datetime values
    :param top_level: Flag for top level for nested structures
    :return: Literal string for python value
    """

    def recurse(x):
        return format_bind_value(x, server_tz, False)

    if value is None:
        return '\\N'
    if isinstance(value, str):
        if top_level:
            # At the top levels, strings must not be surrounded by quotes
            return escape_str(value)
        return format_str(value)
    if isinstance(value, datetime):
        value = value.astimezone(server_tz)
        val = value.strftime('%Y-%m-%d %H:%M:%S')
        if top_level:
            return val
        return f"'{val}'"
    if isinstance(value, date):
        if top_level:
            return value.isoformat()
        return f"'{value.isoformat()}'"
    if isinstance(value, list):
        return f"[{', '.join(recurse(x) for x in value)}]"
    if isinstance(value, tuple):
        return f"({', '.join(recurse(x) for x in value)})"
    if isinstance(value, dict):
        if common.get_setting('dict_parameter_format') == 'json':
            return any_to_json(value).decode()
        pairs = [recurse(k) + ':' + recurse(v)
                 for k, v in value.items()]
        return f"{{{', '.join(pairs)}}}"
    if isinstance(value, Enum):
        return recurse(value.value)
    return str(value)


comment_re = re.compile(r"(\".*?\"|\'.*?\')|(/\*.*?\*/|(--\s)[^\n]*$)", re.MULTILINE | re.DOTALL)


def remove_sql_comments(sql: str) -> str:
    """
    Remove SQL comments.  This is useful to determine the type of SQL query, such as SELECT or INSERT, but we
    don't fully trust it to correctly ignore weird quoted strings, and other edge cases, so we always pass the
    original SQL to ClickHouse (which uses a full-fledged AST/ token parser)
    :param sql:  SQL query
    :return: SQL Query without SQL comments
    """

    def replacer(match):
        # if the 2nd group (capturing comments) is not None, it means we have captured a
        # non-quoted, actual comment string, so return nothing to remove the comment
        if match.group(2):
            return ''
        # Otherwise we've actually captured a quoted string, so return it
        return match.group(1)

    return comment_re.sub(replacer, sql)


def to_arrow(content: bytes):
    pyarrow = check_arrow()
    reader = pyarrow.ipc.RecordBatchFileReader(content)
    return reader.read_all()


def to_arrow_batches(buffer: IOBase) -> StreamContext:
    pyarrow = check_arrow()
    reader = pyarrow.ipc.open_stream(buffer)
    return StreamContext(buffer, reader)


def arrow_buffer(table) -> Tuple[Sequence[str], bytes]:
    pyarrow = check_arrow()
    sink = pyarrow.BufferOutputStream()
    with pyarrow.RecordBatchFileWriter(sink, table.schema) as writer:
        writer.write(table)
    return table.schema.names, sink.getvalue()
