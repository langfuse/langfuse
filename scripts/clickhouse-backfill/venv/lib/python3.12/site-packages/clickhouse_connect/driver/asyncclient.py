import asyncio
import io
from datetime import tzinfo
from typing import Optional, Union, Dict, Any, Sequence, Iterable, Generator, BinaryIO

from clickhouse_connect.driver.client import Client
from clickhouse_connect.driver.common import StreamContext
from clickhouse_connect.driver.httpclient import HttpClient
from clickhouse_connect.driver.external import ExternalData
from clickhouse_connect.driver.query import QueryContext, QueryResult
from clickhouse_connect.driver.summary import QuerySummary
from clickhouse_connect.datatypes.base import ClickHouseType
from clickhouse_connect.driver.insert import InsertContext


# pylint: disable=too-many-public-methods, too-many-instance-attributes, too-many-arguments, too-many-locals
class AsyncClient:
    """
    AsyncClient is a wrapper around the ClickHouse Client object that allows for async calls to the ClickHouse server.
    Internally, each of the methods that uses IO is wrapped in a call to EventLoop.run_in_executor.
    """

    def __init__(self, *, client: Client):
        if isinstance(client, HttpClient):
            client.headers['User-Agent'] = client.headers['User-Agent'].replace('mode:sync;', 'mode:async;')
        self.client = client


    def set_client_setting(self, key, value):
        """
        Set a clickhouse setting for the client after initialization.  If a setting is not recognized by ClickHouse,
        or the setting is identified as "read_only", this call will either throw a Programming exception or attempt
        to send the setting anyway based on the common setting 'invalid_setting_action'.
        :param key: ClickHouse setting name
        :param value: ClickHouse setting value
        """
        self.client.set_client_setting(key=key, value=value)

    def get_client_setting(self, key) -> Optional[str]:
        """
        :param key: The setting key
        :return: The string value of the setting, if it exists, or None
        """
        return self.client.get_client_setting(key=key)

    def min_version(self, version_str: str) -> bool:
        """
        Determine whether the connected server is at least the submitted version
        For Altinity Stable versions like 22.8.15.25.altinitystable
        the last condition in the first list comprehension expression is added
        :param version_str: A version string consisting of up to 4 integers delimited by dots
        :return: True if version_str is greater than the server_version, False if less than
        """
        return self.client.min_version(version_str)

    def close(self):
        """
        Subclass implementation to close the connection to the server/deallocate the client
        """
        self.client.close()

    async def query(self,
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
        Main query method for SELECT, DESCRIBE and other SQL statements that return a result matrix.
        For parameters, see the create_query_context method.
        :return: QueryResult -- data and metadata from response
        """

        def _query():
            return self.client.query(query=query, parameters=parameters, settings=settings, query_formats=query_formats,
                                     column_formats=column_formats, encoding=encoding, use_none=use_none,
                                     column_oriented=column_oriented, use_numpy=use_numpy, max_str_len=max_str_len,
                                     context=context, query_tz=query_tz, column_tzs=column_tzs,
                                     external_data=external_data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _query)
        return result

    async def query_column_block_stream(self,
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
        Variation of main query method that returns a stream of column oriented blocks.
        For parameters, see the create_query_context method.
        :return: StreamContext -- Iterable stream context that returns column oriented blocks
        """

        def _query_column_block_stream():
            return self.client.query_column_block_stream(query=query, parameters=parameters, settings=settings,
                                                         query_formats=query_formats, column_formats=column_formats,
                                                         encoding=encoding, use_none=use_none, context=context,
                                                         query_tz=query_tz, column_tzs=column_tzs,
                                                         external_data=external_data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _query_column_block_stream)
        return result

    async def query_row_block_stream(self,
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
        Variation of main query method that returns a stream of row oriented blocks.
        For parameters, see the create_query_context method.
        :return: StreamContext -- Iterable stream context that returns blocks of rows
        """

        def _query_row_block_stream():
            return self.client.query_row_block_stream(query=query, parameters=parameters, settings=settings,
                                                      query_formats=query_formats, column_formats=column_formats,
                                                      encoding=encoding, use_none=use_none, context=context,
                                                      query_tz=query_tz, column_tzs=column_tzs,
                                                      external_data=external_data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _query_row_block_stream)
        return result

    async def query_rows_stream(self,
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
        Variation of main query method that returns a stream of row oriented blocks.
        For parameters, see the create_query_context method.
        :return: StreamContext -- Iterable stream context that returns blocks of rows
        """

        def _query_rows_stream():
            return self.client.query_rows_stream(query=query, parameters=parameters, settings=settings,
                                                 query_formats=query_formats, column_formats=column_formats,
                                                 encoding=encoding, use_none=use_none, context=context,
                                                 query_tz=query_tz, column_tzs=column_tzs,
                                                 external_data=external_data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _query_rows_stream)
        return result

    async def raw_query(self,
                        query: str,
                        parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                        settings: Optional[Dict[str, Any]] = None,
                        fmt: str = None,
                        use_database: bool = True,
                        external_data: Optional[ExternalData] = None) -> bytes:
        """
        Query method that simply returns the raw ClickHouse format bytes.
        :param query: Query statement/format string
        :param parameters: Optional dictionary used to format the query
        :param settings: Optional dictionary of ClickHouse settings (key/string values)
        :param fmt: ClickHouse output format
        :param use_database  Send the database parameter to ClickHouse so the command will be executed in the client
         database context
        :param external_data  External data to send with the query
        :return: bytes representing raw ClickHouse return value based on format
        """

        def _raw_query():
            return self.client.raw_query(query=query, parameters=parameters, settings=settings, fmt=fmt,
                                         use_database=use_database, external_data=external_data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _raw_query)
        return result

    async def raw_stream(self, query: str,
                         parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                         settings: Optional[Dict[str, Any]] = None,
                         fmt: str = None,
                         use_database: bool = True,
                         external_data: Optional[ExternalData] = None) -> io.IOBase:
        """
        Query method that returns the result as an io.IOBase iterator.
        :param query: Query statement/format string
        :param parameters: Optional dictionary used to format the query
        :param settings: Optional dictionary of ClickHouse settings (key/string values)
        :param fmt: ClickHouse output format
        :param use_database  Send the database parameter to ClickHouse so the command will be executed in the client
         database context
        :param external_data  External data to send with the query
        :return: io.IOBase stream/iterator for the result
        """

        def _raw_stream():
            return self.client.raw_stream(query=query, parameters=parameters, settings=settings, fmt=fmt,
                                          use_database=use_database, external_data=external_data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _raw_stream)
        return result

    async def query_np(self,
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
        Query method that returns the results as a numpy array.
        For parameter values, see the create_query_context method.
        :return: Numpy array representing the result set
        """

        def _query_np():
            return self.client.query_np(query=query, parameters=parameters, settings=settings,
                                        query_formats=query_formats, column_formats=column_formats, encoding=encoding,
                                        use_none=use_none, max_str_len=max_str_len, context=context,
                                        external_data=external_data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _query_np)
        return result

    async def query_np_stream(self,
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
        Query method that returns the results as a stream of numpy arrays.
        For parameter values, see the create_query_context method.
        :return: Generator that yield a numpy array per block representing the result set
        """

        def _query_np_stream():
            return self.client.query_np_stream(query=query, parameters=parameters, settings=settings,
                                               query_formats=query_formats, column_formats=column_formats,
                                               encoding=encoding, use_none=use_none, max_str_len=max_str_len,
                                               context=context, external_data=external_data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _query_np_stream)
        return result

    async def query_df(self,
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
        Query method that results the results as a pandas dataframe.
        For parameter values, see the create_query_context method.
        :return: Pandas dataframe representing the result set
        """

        def _query_df():
            return self.client.query_df(query=query, parameters=parameters, settings=settings,
                                        query_formats=query_formats, column_formats=column_formats, encoding=encoding,
                                        use_none=use_none, max_str_len=max_str_len, use_na_values=use_na_values,
                                        query_tz=query_tz, column_tzs=column_tzs, context=context,
                                        external_data=external_data, use_extended_dtypes=use_extended_dtypes)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _query_df)
        return result

    async def query_df_stream(self,
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
        Query method that returns the results as a StreamContext.
        For parameter values, see the create_query_context method.
        :return: Generator that yields a Pandas dataframe per block representing the result set
        """

        def _query_df_stream():
            return self.client.query_df_stream(query=query, parameters=parameters, settings=settings,
                                               query_formats=query_formats, column_formats=column_formats,
                                               encoding=encoding,
                                               use_none=use_none, max_str_len=max_str_len, use_na_values=use_na_values,
                                               query_tz=query_tz, column_tzs=column_tzs, context=context,
                                               external_data=external_data, use_extended_dtypes=use_extended_dtypes)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _query_df_stream)
        return result

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
          objects with the selected timezone
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

        return self.client.create_query_context(query=query, parameters=parameters, settings=settings,
                                                query_formats=query_formats, column_formats=column_formats,
                                                encoding=encoding, use_none=use_none,
                                                column_oriented=column_oriented,
                                                use_numpy=use_numpy, max_str_len=max_str_len, context=context,
                                                query_tz=query_tz, column_tzs=column_tzs,
                                                use_na_values=use_na_values,
                                                streaming=streaming, as_pandas=as_pandas,
                                                external_data=external_data,
                                                use_extended_dtypes=use_extended_dtypes)

    async def query_arrow(self,
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

        def _query_arrow():
            return self.client.query_arrow(query=query, parameters=parameters, settings=settings,
                                           use_strings=use_strings, external_data=external_data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _query_arrow)
        return result

    async def query_arrow_stream(self,
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

        def _query_arrow_stream():
            return self.client.query_arrow_stream(query=query, parameters=parameters, settings=settings,
                                                  use_strings=use_strings, external_data=external_data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _query_arrow_stream)
        return result

    async def command(self,
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

        def _command():
            return self.client.command(cmd=cmd, parameters=parameters, data=data, settings=settings,
                                       use_database=use_database, external_data=external_data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _command)
        return result

    async def ping(self) -> bool:
        """
        Validate the connection, does not throw an Exception (see debug logs)
        :return: ClickHouse server is up and reachable
        """

        def _ping():
            return self.client.ping()

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _ping)
        return result

    async def insert(self,
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

        def _insert():
            return self.client.insert(table=table, data=data, column_names=column_names, database=database,
                                      column_types=column_types, column_type_names=column_type_names,
                                      column_oriented=column_oriented, settings=settings, context=context)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _insert)
        return result

    async def insert_df(self, table: str = None,
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

        def _insert_df():
            return self.client.insert_df(table=table, df=df, database=database, settings=settings,
                                         column_names=column_names,
                                         column_types=column_types, column_type_names=column_type_names,
                                         context=context)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _insert_df)
        return result

    async def insert_arrow(self, table: str,
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

        def _insert_arrow():
            return self.client.insert_arrow(table=table, arrow_table=arrow_table, database=database, settings=settings)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _insert_arrow)
        return result

    async def create_insert_context(self,
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

        def _create_insert_context():
            return self.client.create_insert_context(table=table, column_names=column_names, database=database,
                                                     column_types=column_types, column_type_names=column_type_names,
                                                     column_oriented=column_oriented, settings=settings, data=data)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _create_insert_context)
        return result

    async def data_insert(self, context: InsertContext) -> QuerySummary:
        """
        Subclass implementation of the data insert
        :context: InsertContext parameter object
        :return: No return, throws an exception if the insert fails
        """

        def _data_insert():
            return self.client.data_insert(context=context)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _data_insert)
        return result

    async def raw_insert(self, table: str,
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

        def _raw_insert():
            return self.client.raw_insert(table=table, column_names=column_names, insert_block=insert_block,
                                          settings=settings, fmt=fmt, compression=compression)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _raw_insert)
        return result
