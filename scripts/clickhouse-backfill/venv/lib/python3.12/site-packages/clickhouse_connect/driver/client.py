import io
import logging
from datetime import tzinfo

import pytz

from abc import ABC, abstractmethod
from typing import Iterable, Optional, Any, Union, Sequence, Dict, Generator, BinaryIO
from pytz.exceptions import UnknownTimeZoneError

from clickhouse_connect import common
from clickhouse_connect.common import version
from clickhouse_connect.datatypes.registry import get_from_name
from clickhouse_connect.datatypes.base import ClickHouseType
from clickhouse_connect.driver import tzutil
from clickhouse_connect.driver.common import dict_copy, StreamContext, coerce_int, coerce_bool
from clickhouse_connect.driver.constants import CH_VERSION_WITH_PROTOCOL, PROTOCOL_VERSION_WITH_LOW_CARD
from clickhouse_connect.driver.exceptions import ProgrammingError, OperationalError
from clickhouse_connect.driver.external import ExternalData
from clickhouse_connect.driver.insert import InsertContext
from clickhouse_connect.driver.summary import QuerySummary
from clickhouse_connect.driver.models import ColumnDef, SettingDef, SettingStatus
from clickhouse_connect.driver.query import QueryResult, to_arrow, to_arrow_batches, QueryContext, arrow_buffer, \
    quote_identifier

io.DEFAULT_BUFFER_SIZE = 1024 * 256
logger = logging.getLogger(__name__)
arrow_str_setting = 'output_format_arrow_string_as_string'


# pylint: disable=too-many-public-methods, too-many-instance-attributes
class Client(ABC):
    """
    Base ClickHouse Connect client
    """
    compression: str = None
    write_compression: str = None
    protocol_version = 0
    valid_transport_settings = set()
    optional_transport_settings = set()
    database = None
    max_error_message = 0
    apply_server_timezone = False
    show_clickhouse_errors = True

    def __init__(self,
                 database: str,
                 query_limit: int,
                 uri: str,
                 query_retries: int,
                 server_host_name: Optional[str],
                 apply_server_timezone: Optional[Union[str, bool]],
                 show_clickhouse_errors: Optional[bool]):
        """
        Shared initialization of ClickHouse Connect client
        :param database: database name
        :param query_limit: default LIMIT for queries
        :param uri: uri for error messages
        """
        self.query_limit = coerce_int(query_limit)
        self.query_retries = coerce_int(query_retries)
        if show_clickhouse_errors is not None:
            self.show_clickhouse_errors = coerce_bool(show_clickhouse_errors)
        self.server_host_name = server_host_name
        self.server_tz, dst_safe = pytz.UTC, True
        self.server_version, server_tz = \
            tuple(self.command('SELECT version(), timezone()', use_database=False))
        try:
            server_tz = pytz.timezone(server_tz)
            server_tz, dst_safe = tzutil.normalize_timezone(server_tz)
            if apply_server_timezone is None:
                apply_server_timezone = dst_safe
            self.apply_server_timezone = apply_server_timezone == 'always' or coerce_bool(apply_server_timezone)
            self.server_tz = server_tz
        except UnknownTimeZoneError:
            logger.warning('Warning, server is using an unrecognized timezone %s, will use UTC default', server_tz)

        if not self.apply_server_timezone and not tzutil.local_tz_dst_safe:
            logger.warning('local timezone %s may return unexpected times due to Daylight Savings Time/' +
                           'Summer Time differences', tzutil.local_tz.tzname(None))
        readonly = 'readonly'
        if not self.min_version('19.17'):
            readonly = common.get_setting('readonly')
        server_settings = self.query(f'SELECT name, value, {readonly} as readonly FROM system.settings LIMIT 10000')
        self.server_settings = {row['name']: SettingDef(**row) for row in server_settings.named_results()}
        if database and not database == '__default__':
            self.database = database
        if self.min_version(CH_VERSION_WITH_PROTOCOL):
            #  Unfortunately we have to validate that the client protocol version is actually used by ClickHouse
            #  since the query parameter could be stripped off (in particular, by CHProxy)
            test_data = self.raw_query('SELECT 1 AS check', fmt='Native', settings={
                'client_protocol_version': PROTOCOL_VERSION_WITH_LOW_CARD
            })
            if test_data[8:16] == b'\x01\x01\x05check':
                self.protocol_version = PROTOCOL_VERSION_WITH_LOW_CARD
        self.uri = uri

    def _validate_settings(self, settings: Optional[Dict[str, Any]]) -> Dict[str, str]:
        """
        This strips any ClickHouse settings that are not recognized or are read only.
        :param settings:  Dictionary of setting name and values
        :return: A filtered dictionary of settings with values rendered as strings
        """
        validated = {}
        invalid_action = common.get_setting('invalid_setting_action')
        for key, value in settings.items():
            str_value = self._validate_setting(key, value, invalid_action)
            if str_value is not None:
                validated[key] = value
        return validated

    def _validate_setting(self, key: str, value: Any, invalid_action: str) -> Optional[str]:
        if key not in self.valid_transport_settings:
            setting_def = self.server_settings.get(key)
            if setting_def is None or setting_def.readonly:
                if key in self.optional_transport_settings:
                    return None
                if invalid_action == 'send':
                    logger.warning('Attempting to send unrecognized or readonly setting %s', key)
                elif invalid_action == 'drop':
                    logger.warning('Dropping unrecognized or readonly settings %s', key)
                    return None
                else:
                    raise ProgrammingError(f'Setting {key} is unknown or readonly') from None
        if isinstance(value, bool):
            return '1' if value else '0'
        return str(value)

    def _setting_status(self, key: str) -> SettingStatus:
        comp_setting = self.server_settings.get(key)
        if not comp_setting:
            return SettingStatus(False, False)
        return SettingStatus(comp_setting.value != '0', comp_setting.readonly != 1)

    def _prep_query(self, context: QueryContext):
        if context.is_select and not context.has_limit and self.query_limit:
            limit = f'\n LIMIT {self.query_limit}'
            if isinstance(context.query, bytes):
                return context.final_query + limit.encode()
            return context.final_query + limit
        return context.final_query

    def _check_tz_change(self, new_tz) -> Optional[tzinfo]:
        if new_tz:
            try:
                new_tzinfo = pytz.timezone(new_tz)
                if new_tzinfo != self.server_tz:
                    return new_tzinfo
            except UnknownTimeZoneError:
                logger.warning('Unrecognized timezone %s received from ClickHouse', new_tz)
        return None

    @abstractmethod
    def _query_with_context(self, context: QueryContext):
        pass

    @abstractmethod
    def set_client_setting(self, key, value):
        """
        Set a clickhouse setting for the client after initialization.  If a setting is not recognized by ClickHouse,
        or the setting is identified as "read_only", this call will either throw a Programming exception or attempt
        to send the setting anyway based on the common setting 'invalid_setting_action'
        :param key: ClickHouse setting name
        :param value: ClickHouse setting value
        """

    @abstractmethod
    def get_client_setting(self, key) -> Optional[str]:
        """
        :param key: The setting key
        :return: The string value of the setting, if it exists, or None
        """

    # pylint: disable=too-many-arguments,unused-argument,too-many-locals
    def query(self,
              query: Optional[str] = None,
              parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
              settings: Optional[Dict[str, Any]] = None,
              query_formats: Optional[Dict[str, str]] = None,
              column_formats: Optional[Dict[str, Union[str, Dict[str, str]]]] = None,
              encoding: Optional[str] = None,
              use_none: Optional[bool] = None,
              column_oriented: Optional[bool] = None,
              use_numpy: Optional[bool] = None,
              max_str_len: Optional[int] = None,
              context: QueryContext = None,
              query_tz: Optional[Union[str, tzinfo]] = None,
              column_tzs: Optional[Dict[str, Union[str, tzinfo]]] = None,
              external_data: Optional[ExternalData] = None) -> QueryResult:
        """
        Main query method for SELECT, DESCRIBE and other SQL statements that return a result matrix.  For
        parameters, see the create_query_context method
        :return: QueryResult -- data and metadata from response
        """
        if query and query.lower().strip().startswith('select __connect_version__'):
            return QueryResult([[f'ClickHouse Connect v.{version()}  ⓒ ClickHouse Inc.']], None,
                               ('connect_version',), (get_from_name('String'),))
        kwargs = locals().copy()
        del kwargs['self']
        query_context = self.create_query_context(**kwargs)
        if query_context.is_command:
            response = self.command(query,
                                    parameters=query_context.parameters,
                                    settings=query_context.settings,
                                    external_data=query_context.external_data)
            if isinstance(response, QuerySummary):
                return response.as_query_result()
            return QueryResult([response] if isinstance(response, list) else [[response]])
        return self._query_with_context(query_context)

    def query_column_block_stream(self,
                                  query: Optional[str] = None,
                                  parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                                  settings: Optional[Dict[str, Any]] = None,
                                  query_formats: Optional[Dict[str, str]] = None,
                                  column_formats: Optional[Dict[str, Union[str, Dict[str, str]]]] = None,
                                  encoding: Optional[str] = None,
                                  use_none: Optional[bool] = None,
                                  context: QueryContext = None,
                                  query_tz: Optional[Union[str, tzinfo]] = None,
                                  column_tzs: Optional[Dict[str, Union[str, tzinfo]]] = None,
                                  external_data: Optional[ExternalData] = None) -> StreamContext:
        """
        Variation of main query method that returns a stream of column oriented blocks. For
        parameters, see the create_query_context method.
        :return: StreamContext -- Iterable stream context that returns column oriented blocks
        """
        return self._context_query(locals(), use_numpy=False, streaming=True).column_block_stream

    def query_row_block_stream(self,
                               query: Optional[str] = None,
                               parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                               settings: Optional[Dict[str, Any]] = None,
                               query_formats: Optional[Dict[str, str]] = None,
                               column_formats: Optional[Dict[str, Union[str, Dict[str, str]]]] = None,
                               encoding: Optional[str] = None,
                               use_none: Optional[bool] = None,
                               context: QueryContext = None,
                               query_tz: Optional[Union[str, tzinfo]] = None,
                               column_tzs: Optional[Dict[str, Union[str, tzinfo]]] = None,
                               external_data: Optional[ExternalData] = None) -> StreamContext:
        """
        Variation of main query method that returns a stream of row oriented blocks. For
        parameters, see the create_query_context method.
        :return: StreamContext -- Iterable stream context that returns blocks of rows
        """
        return self._context_query(locals(), use_numpy=False, streaming=True).row_block_stream

    def query_rows_stream(self,
                          query: Optional[str] = None,
                          parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                          settings: Optional[Dict[str, Any]] = None,
                          query_formats: Optional[Dict[str, str]] = None,
                          column_formats: Optional[Dict[str, Union[str, Dict[str, str]]]] = None,
                          encoding: Optional[str] = None,
                          use_none: Optional[bool] = None,
                          context: QueryContext = None,
                          query_tz: Optional[Union[str, tzinfo]] = None,
                          column_tzs: Optional[Dict[str, Union[str, tzinfo]]] = None,
                          external_data: Optional[ExternalData] = None) -> StreamContext:
        """
        Variation of main query method that returns a stream of row oriented blocks. For
        parameters, see the create_query_context method.
        :return: StreamContext -- Iterable stream context that returns blocks of rows
        """
        return self._context_query(locals(), use_numpy=False, streaming=True).rows_stream

    @abstractmethod
    def raw_query(self, query: str,
                  parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                  settings: Optional[Dict[str, Any]] = None,
                  fmt: str = None,
                  use_database: bool = True,
                  external_data: Optional[ExternalData] = None) -> bytes:
        """
        Query method that simply returns the raw ClickHouse format bytes
        :param query: Query statement/format string
        :param parameters: Optional dictionary used to format the query
        :param settings: Optional dictionary of ClickHouse settings (key/string values)
        :param fmt: ClickHouse output format
        :param use_database  Send the database parameter to ClickHouse so the command will be executed in the client
         database context.
        :param external_data  External data to send with the query
        :return: bytes representing raw ClickHouse return value based on format
        """

    @abstractmethod
    def raw_stream(self, query: str,
                   parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                   settings: Optional[Dict[str, Any]] = None,
                   fmt: str = None,
                   use_database: bool = True,
                   external_data: Optional[ExternalData] = None) -> io.IOBase:
        """
       Query method that returns the result as an io.IOBase iterator
       :param query: Query statement/format string
       :param parameters: Optional dictionary used to format the query
       :param settings: Optional dictionary of ClickHouse settings (key/string values)
       :param fmt: ClickHouse output format
       :param use_database  Send the database parameter to ClickHouse so the command will be executed in the client
        database context.
       :param external_data  External data to send with the query
       :return: io.IOBase stream/iterator for the result
       """

    # pylint: disable=duplicate-code,too-many-arguments,unused-argument
    def query_np(self,
                 query: Optional[str] = None,
                 parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                 settings: Optional[Dict[str, Any]] = None,
                 query_formats: Optional[Dict[str, str]] = None,
                 column_formats: Optional[Dict[str, str]] = None,
                 encoding: Optional[str] = None,
                 use_none: Optional[bool] = None,
                 max_str_len: Optional[int] = None,
                 context: QueryContext = None,
                 external_data: Optional[ExternalData] = None):
        """
        Query method that returns the results as a numpy array.  For parameter values, see the
        create_query_context method
        :return: Numpy array representing the result set
        """
        return self._context_query(locals(), use_numpy=True).np_result

    # pylint: disable=duplicate-code,too-many-arguments,unused-argument
    def query_np_stream(self,
                        query: Optional[str] = None,
                        parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                        settings: Optional[Dict[str, Any]] = None,
                        query_formats: Optional[Dict[str, str]] = None,
                        column_formats: Optional[Dict[str, str]] = None,
                        encoding: Optional[str] = None,
                        use_none: Optional[bool] = None,
                        max_str_len: Optional[int] = None,
                        context: QueryContext = None,
                        external_data: Optional[ExternalData] = None) -> StreamContext:
        """
        Query method that returns the results as a stream of numpy arrays.  For parameter values, see the
        create_query_context method
        :return: Generator that yield a numpy array per block representing the result set
        """
        return self._context_query(locals(), use_numpy=True, streaming=True).np_stream

    # pylint: disable=duplicate-code,too-many-arguments,unused-argument
    def query_df(self,
                 query: Optional[str] = None,
                 parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                 settings: Optional[Dict[str, Any]] = None,
                 query_formats: Optional[Dict[str, str]] = None,
                 column_formats: Optional[Dict[str, str]] = None,
                 encoding: Optional[str] = None,
                 use_none: Optional[bool] = None,
                 max_str_len: Optional[int] = None,
                 use_na_values: Optional[bool] = None,
                 query_tz: Optional[str] = None,
                 column_tzs: Optional[Dict[str, Union[str, tzinfo]]] = None,
                 context: QueryContext = None,
                 external_data: Optional[ExternalData] = None,
                 use_extended_dtypes: Optional[bool] = None):
        """
        Query method that results the results as a pandas dataframe.  For parameter values, see the
        create_query_context method
        :return: Pandas dataframe representing the result set
        """
        return self._context_query(locals(), use_numpy=True, as_pandas=True).df_result

    # pylint: disable=duplicate-code,too-many-arguments,unused-argument
    def query_df_stream(self,
                        query: Optional[str] = None,
                        parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                        settings: Optional[Dict[str, Any]] = None,
                        query_formats: Optional[Dict[str, str]] = None,
                        column_formats: Optional[Dict[str, str]] = None,
                        encoding: Optional[str] = None,
                        use_none: Optional[bool] = None,
                        max_str_len: Optional[int] = None,
                        use_na_values: Optional[bool] = None,
                        query_tz: Optional[str] = None,
                        column_tzs: Optional[Dict[str, Union[str, tzinfo]]] = None,
                        context: QueryContext = None,
                        external_data: Optional[ExternalData] = None,
                        use_extended_dtypes: Optional[bool] = None) -> StreamContext:
        """
        Query method that returns the results as a StreamContext.  For parameter values, see the
        create_query_context method
        :return: Generator that yields a Pandas dataframe per block representing the result set
        """
        return self._context_query(locals(), use_numpy=True,
                                   as_pandas=True,
                                   streaming=True).df_stream

    def create_query_context(self,
                             query: Optional[Union[str, bytes]] = None,
                             parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                             settings: Optional[Dict[str, Any]] = None,
                             query_formats: Optional[Dict[str, str]] = None,
                             column_formats: Optional[Dict[str, Union[str, Dict[str, str]]]] = None,
                             encoding: Optional[str] = None,
                             use_none: Optional[bool] = None,
                             column_oriented: Optional[bool] = None,
                             use_numpy: Optional[bool] = False,
                             max_str_len: Optional[int] = 0,
                             context: Optional[QueryContext] = None,
                             query_tz: Optional[Union[str, tzinfo]] = None,
                             column_tzs: Optional[Dict[str, Union[str, tzinfo]]] = None,
                             use_na_values: Optional[bool] = None,
                             streaming: bool = False,
                             as_pandas: bool = False,
                             external_data: Optional[ExternalData] = None,
                             use_extended_dtypes: Optional[bool] = None) -> QueryContext:
        """
        Creates or updates a reusable QueryContext object
        :param query: Query statement/format string
        :param parameters: Optional dictionary used to format the query
        :param settings: Optional dictionary of ClickHouse settings (key/string values)
        :param query_formats: See QueryContext __init__ docstring
        :param column_formats: See QueryContext __init__ docstring
        :param encoding: See QueryContext __init__ docstring
        :param use_none: Use None for ClickHouse NULL instead of default values.  Note that using None in Numpy
          arrays will force the numpy array dtype to 'object', which is often inefficient.  This effect also
          will impact the performance of Pandas dataframes.
        :param column_oriented: Deprecated. Controls orientation of the QueryResult result_set property
        :param use_numpy: Return QueryResult columns as one-dimensional numpy arrays
        :param max_str_len: Limit returned ClickHouse String values to this length, which allows a Numpy
          structured array even with ClickHouse variable length String columns.  If 0, Numpy arrays for
          String columns will always be object arrays
        :param context: An existing QueryContext to be updated with any provided parameter values
        :param query_tz  Either a string or a pytz tzinfo object.  (Strings will be converted to tzinfo objects).
          Values for any DateTime or DateTime64 column in the query will be converted to Python datetime.datetime
          objects with the selected timezone.
        :param column_tzs A dictionary of column names to tzinfo objects (or strings that will be converted to
          tzinfo objects).  The timezone will be applied to datetime objects returned in the query
        :param use_na_values: Deprecated alias for use_advanced_dtypes
        :param as_pandas Return the result columns as pandas.Series objects
        :param streaming Marker used to correctly configure streaming queries
        :param external_data ClickHouse "external data" to send with query
        :param use_extended_dtypes:  Only relevant to Pandas Dataframe queries.  Use Pandas "missing types", such as
          pandas.NA and pandas.NaT for ClickHouse NULL values, as well as extended Pandas dtypes such as IntegerArray
          and StringArray.  Defaulted to True for query_df methods
        :return: Reusable QueryContext
        """
        if context:
            return context.updated_copy(query=query,
                                        parameters=parameters,
                                        settings=settings,
                                        query_formats=query_formats,
                                        column_formats=column_formats,
                                        encoding=encoding,
                                        server_tz=self.server_tz,
                                        use_none=use_none,
                                        column_oriented=column_oriented,
                                        use_numpy=use_numpy,
                                        max_str_len=max_str_len,
                                        query_tz=query_tz,
                                        column_tzs=column_tzs,
                                        as_pandas=as_pandas,
                                        use_extended_dtypes=use_extended_dtypes,
                                        streaming=streaming,
                                        external_data=external_data)
        if use_numpy and max_str_len is None:
            max_str_len = 0
        if use_extended_dtypes is None:
            use_extended_dtypes = use_na_values
        if as_pandas and use_extended_dtypes is None:
            use_extended_dtypes = True
        return QueryContext(query=query,
                            parameters=parameters,
                            settings=settings,
                            query_formats=query_formats,
                            column_formats=column_formats,
                            encoding=encoding,
                            server_tz=self.server_tz,
                            use_none=use_none,
                            column_oriented=column_oriented,
                            use_numpy=use_numpy,
                            max_str_len=max_str_len,
                            query_tz=query_tz,
                            column_tzs=column_tzs,
                            use_extended_dtypes=use_extended_dtypes,
                            as_pandas=as_pandas,
                            streaming=streaming,
                            apply_server_tz=self.apply_server_timezone,
                            external_data=external_data)

    def query_arrow(self,
                    query: str,
                    parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                    settings: Optional[Dict[str, Any]] = None,
                    use_strings: Optional[bool] = None,
                    external_data: Optional[ExternalData] = None):
        """
        Query method using the ClickHouse Arrow format to return a PyArrow table
        :param query: Query statement/format string
        :param parameters: Optional dictionary used to format the query
        :param settings: Optional dictionary of ClickHouse settings (key/string values)
        :param use_strings:  Convert ClickHouse String type to Arrow string type (instead of binary)
        :param external_data ClickHouse "external data" to send with query
        :return: PyArrow.Table
        """
        settings = self._update_arrow_settings(settings, use_strings)
        return to_arrow(self.raw_query(query,
                                       parameters,
                                       settings,
                                       fmt='Arrow',
                                       external_data=external_data))

    def query_arrow_stream(self,
                           query: str,
                           parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                           settings: Optional[Dict[str, Any]] = None,
                           use_strings: Optional[bool] = None,
                           external_data: Optional[ExternalData] = None) -> StreamContext:
        """
        Query method that returns the results as a stream of Arrow tables
        :param query: Query statement/format string
        :param parameters: Optional dictionary used to format the query
        :param settings: Optional dictionary of ClickHouse settings (key/string values)
        :param use_strings:  Convert ClickHouse String type to Arrow string type (instead of binary)
        :param external_data ClickHouse "external data" to send with query
        :return: Generator that yields a PyArrow.Table for per block representing the result set
        """
        settings = self._update_arrow_settings(settings, use_strings)
        return to_arrow_batches(self.raw_stream(query,
                                                parameters,
                                                settings,
                                                fmt='ArrowStream',
                                                external_data=external_data))

    def _update_arrow_settings(self,
                               settings: Optional[Dict[str, Any]],
                               use_strings: Optional[bool]) -> Dict[str, Any]:
        settings = dict_copy(settings)
        if self.database:
            settings['database'] = self.database
        str_status = self._setting_status(arrow_str_setting)
        if use_strings is None:
            if str_status.is_writable and not str_status.is_set:
                settings[arrow_str_setting] = '1'  # Default to returning strings if possible
        elif use_strings != str_status.is_set:
            if not str_status.is_writable:
                raise OperationalError(f'Cannot change readonly {arrow_str_setting} to {use_strings}')
            settings[arrow_str_setting] = '1' if use_strings else '0'
        return settings

    @abstractmethod
    def command(self,
                cmd: str,
                parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                data: Union[str, bytes] = None,
                settings: Dict[str, Any] = None,
                use_database: bool = True,
                external_data: Optional[ExternalData] = None) -> Union[str, int, Sequence[str], QuerySummary]:
        """
        Client method that returns a single value instead of a result set
        :param cmd: ClickHouse query/command as a python format string
        :param parameters: Optional dictionary of key/values pairs to be formatted
        :param data: Optional 'data' for the command (for INSERT INTO in particular)
        :param settings: Optional dictionary of ClickHouse settings (key/string values)
        :param use_database: Send the database parameter to ClickHouse so the command will be executed in the client
         database context.  Otherwise, no database will be specified with the command.  This is useful for determining
         the default user database
        :param external_data ClickHouse "external data" to send with command/query
        :return: Decoded response from ClickHouse as either a string, int, or sequence of strings, or QuerySummary
        if no data returned
        """

    @abstractmethod
    def ping(self) -> bool:
        """
        Validate the connection, does not throw an Exception (see debug logs)
        :return: ClickHouse server is up and reachable
        """

    # pylint: disable=too-many-arguments
    def insert(self,
               table: Optional[str] = None,
               data: Sequence[Sequence[Any]] = None,
               column_names: Union[str, Iterable[str]] = '*',
               database: Optional[str] = None,
               column_types: Sequence[ClickHouseType] = None,
               column_type_names: Sequence[str] = None,
               column_oriented: bool = False,
               settings: Optional[Dict[str, Any]] = None,
               context: InsertContext = None) -> QuerySummary:
        """
        Method to insert multiple rows/data matrix of native Python objects.  If context is specified arguments
        other than data are ignored
        :param table: Target table
        :param data: Sequence of sequences of Python data
        :param column_names: Ordered list of column names or '*' if column types should be retrieved from the
            ClickHouse table definition
        :param database: Target database -- will use client default database if not specified.
        :param column_types: ClickHouse column types.  If set then column data does not need to be retrieved from
            the server
        :param column_type_names: ClickHouse column type names.  If set then column data does not need to be
            retrieved from the server
        :param column_oriented: If true the data is already "pivoted" in column form
        :param settings: Optional dictionary of ClickHouse settings (key/string values)
        :param context: Optional reusable insert context to allow repeated inserts into the same table with
            different data batches
        :return: QuerySummary with summary information, throws exception if insert fails
        """
        if (context is None or context.empty) and data is None:
            raise ProgrammingError('No data specified for insert') from None
        if context is None:
            context = self.create_insert_context(table,
                                                 column_names,
                                                 database,
                                                 column_types,
                                                 column_type_names,
                                                 column_oriented,
                                                 settings)
        if data is not None:
            if not context.empty:
                raise ProgrammingError('Attempting to insert new data with non-empty insert context') from None
            context.data = data
        return self.data_insert(context)

    def insert_df(self, table: str = None,
                  df=None,
                  database: Optional[str] = None,
                  settings: Optional[Dict] = None,
                  column_names: Optional[Sequence[str]] = None,
                  column_types: Sequence[ClickHouseType] = None,
                  column_type_names: Sequence[str] = None,
                  context: InsertContext = None) -> QuerySummary:
        """
        Insert a pandas DataFrame into ClickHouse.  If context is specified arguments other than df are ignored
        :param table: ClickHouse table
        :param df: two-dimensional pandas dataframe
        :param database: Optional ClickHouse database
        :param settings: Optional dictionary of ClickHouse settings (key/string values)
        :param column_names: An optional list of ClickHouse column names.  If not set, the DataFrame column names
           will be used
        :param column_types: ClickHouse column types.  If set then column data does not need to be retrieved from
            the server
        :param column_type_names: ClickHouse column type names.  If set then column data does not need to be
            retrieved from the server
        :param context: Optional reusable insert context to allow repeated inserts into the same table with
            different data batches
        :return: QuerySummary with summary information, throws exception if insert fails
        """
        if context is None:
            if column_names is None:
                column_names = df.columns
            elif len(column_names) != len(df.columns):
                raise ProgrammingError('DataFrame column count does not match insert_columns') from None
        return self.insert(table,
                           df,
                           column_names,
                           database,
                           column_types=column_types,
                           column_type_names=column_type_names,
                           settings=settings, context=context)

    def insert_arrow(self, table: str,
                     arrow_table, database: str = None,
                     settings: Optional[Dict] = None) -> QuerySummary:
        """
        Insert a PyArrow table DataFrame into ClickHouse using raw Arrow format
        :param table: ClickHouse table
        :param arrow_table: PyArrow Table object
        :param database: Optional ClickHouse database
        :param settings: Optional dictionary of ClickHouse settings (key/string values)
        :return: QuerySummary with summary information, throws exception if insert fails
        """
        full_table = table if '.' in table or not database else f'{database}.{table}'
        column_names, insert_block = arrow_buffer(arrow_table)
        return self.raw_insert(full_table, column_names, insert_block, settings, 'Arrow')

    def create_insert_context(self,
                              table: str,
                              column_names: Optional[Union[str, Sequence[str]]] = None,
                              database: Optional[str] = None,
                              column_types: Sequence[ClickHouseType] = None,
                              column_type_names: Sequence[str] = None,
                              column_oriented: bool = False,
                              settings: Optional[Dict[str, Any]] = None,
                              data: Optional[Sequence[Sequence[Any]]] = None) -> InsertContext:
        """
        Builds a reusable insert context to hold state for a duration of an insert
        :param table: Target table
        :param database: Target database.  If not set, uses the client default database
        :param column_names: Optional ordered list of column names.  If not set, all columns ('*') will be assumed
          in the order specified by the table definition
        :param database: Target database -- will use client default database if not specified
        :param column_types: ClickHouse column types.  Optional  Sequence of ClickHouseType objects.  If neither column
           types nor column type names are set, actual column types will be retrieved from the server.
        :param column_type_names: ClickHouse column type names.  Specified column types by name string
        :param column_oriented: If true the data is already "pivoted" in column form
        :param settings: Optional dictionary of ClickHouse settings (key/string values)
        :param data: Initial dataset for insert
        :return Reusable insert context
        """
        full_table = table
        if '.' not in table:
            if database:
                full_table = f'{quote_identifier(database)}.{quote_identifier(table)}'
            else:
                full_table = quote_identifier(table)
        column_defs = []
        if column_types is None and column_type_names is None:
            describe_result = self.query(f'DESCRIBE TABLE {full_table}')
            column_defs = [ColumnDef(**row) for row in describe_result.named_results()
                           if row['default_type'] not in ('ALIAS', 'MATERIALIZED')]
        if column_names is None or isinstance(column_names, str) and column_names == '*':
            column_names = [cd.name for cd in column_defs]
            column_types = [cd.ch_type for cd in column_defs]
        elif isinstance(column_names, str):
            column_names = [column_names]
        if len(column_names) == 0:
            raise ValueError('Column names must be specified for insert')
        if not column_types:
            if column_type_names:
                column_types = [get_from_name(name) for name in column_type_names]
            else:
                column_map = {d.name: d for d in column_defs}
                try:
                    column_types = [column_map[name].ch_type for name in column_names]
                except KeyError as ex:
                    raise ProgrammingError(f'Unrecognized column {ex} in table {table}') from None
        if len(column_names) != len(column_types):
            raise ProgrammingError('Column names do not match column types') from None
        return InsertContext(full_table,
                             column_names,
                             column_types,
                             column_oriented=column_oriented,
                             settings=settings,
                             data=data)

    def min_version(self, version_str: str) -> bool:
        """
        Determine whether the connected server is at least the submitted version
        For Altinity Stable versions like 22.8.15.25.altinitystable
        the last condition in the first list comprehension expression is added
        :param version_str: A version string consisting of up to 4 integers delimited by dots
        :return: True if version_str is greater than the server_version, False if less than
        """
        try:
            server_parts = [int(x) for x in self.server_version.split('.') if x.isnumeric()]
            server_parts.extend([0] * (4 - len(server_parts)))
            version_parts = [int(x) for x in version_str.split('.')]
            version_parts.extend([0] * (4 - len(version_parts)))
        except ValueError:
            logger.warning('Server %s or requested version %s does not match format of numbers separated by dots',
                           self.server_version, version_str)
            return False
        for x, y in zip(server_parts, version_parts):
            if x > y:
                return True
            if x < y:
                return False
        return True

    @abstractmethod
    def data_insert(self, context: InsertContext) -> QuerySummary:
        """
        Subclass implementation of the data insert
        :context: InsertContext parameter object
        :return: No return, throws an exception if the insert fails
        """

    @abstractmethod
    def raw_insert(self, table: str,
                   column_names: Optional[Sequence[str]] = None,
                   insert_block: Union[str, bytes, Generator[bytes, None, None], BinaryIO] = None,
                   settings: Optional[Dict] = None,
                   fmt: Optional[str] = None,
                   compression: Optional[str] = None) -> QuerySummary:
        """
        Insert data already formatted in a bytes object
        :param table: Table name (whether qualified with the database name or not)
        :param column_names: Sequence of column names
        :param insert_block: Binary or string data already in a recognized ClickHouse format
        :param settings:  Optional dictionary of ClickHouse settings (key/string values)
        :param compression:  Recognized ClickHouse `Accept-Encoding` header compression value
        :param fmt: Valid clickhouse format
        """

    def close(self):
        """
        Subclass implementation to close the connection to the server/deallocate the client
        """

    def _context_query(self, lcls: dict, **overrides):
        kwargs = lcls.copy()
        kwargs.pop('self')
        kwargs.update(overrides)
        return self._query_with_context((self.create_query_context(**kwargs)))

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, exc_traceback):
        self.close()
