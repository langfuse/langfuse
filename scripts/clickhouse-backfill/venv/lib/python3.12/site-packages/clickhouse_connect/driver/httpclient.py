import io
import json
import logging
import re
import uuid
from base64 import b64encode
from typing import Optional, Dict, Any, Sequence, Union, List, Callable, Generator, BinaryIO
from urllib.parse import urlencode

from urllib3 import Timeout
from urllib3.exceptions import HTTPError
from urllib3.poolmanager import PoolManager
from urllib3.response import HTTPResponse

from clickhouse_connect import common
from clickhouse_connect.datatypes import registry
from clickhouse_connect.datatypes.base import ClickHouseType
from clickhouse_connect.driver.client import Client
from clickhouse_connect.driver.common import dict_copy, coerce_bool, coerce_int, dict_add
from clickhouse_connect.driver.compression import available_compression
from clickhouse_connect.driver.ctypes import RespBuffCls
from clickhouse_connect.driver.exceptions import DatabaseError, OperationalError, ProgrammingError
from clickhouse_connect.driver.external import ExternalData
from clickhouse_connect.driver.httputil import ResponseSource, get_pool_manager, get_response_data, \
    default_pool_manager, get_proxy_manager, all_managers, check_env_proxy, check_conn_expiration
from clickhouse_connect.driver.insert import InsertContext
from clickhouse_connect.driver.query import QueryResult, QueryContext, quote_identifier, bind_query
from clickhouse_connect.driver.summary import QuerySummary
from clickhouse_connect.driver.transform import NativeTransform

logger = logging.getLogger(__name__)
columns_only_re = re.compile(r'LIMIT 0\s*$', re.IGNORECASE)


# pylint: disable=too-many-instance-attributes
class HttpClient(Client):
    params = {}
    valid_transport_settings = {'database', 'buffer_size', 'session_id',
                                'compress', 'decompress', 'session_timeout',
                                'session_check', 'query_id', 'quota_key',
                                'wait_end_of_query', 'client_protocol_version'}
    optional_transport_settings = {'send_progress_in_http_headers',
                                   'http_headers_progress_interval_ms',
                                   'enable_http_compression'}
    _owns_pool_manager = False

    # pylint: disable=too-many-arguments,too-many-locals,too-many-branches,too-many-statements,unused-argument
    def __init__(self,
                 interface: str,
                 host: str,
                 port: int,
                 username: str,
                 password: str,
                 database: str,
                 compress: Union[bool, str] = True,
                 query_limit: int = 0,
                 query_retries: int = 2,
                 connect_timeout: int = 10,
                 send_receive_timeout: int = 300,
                 client_name: Optional[str] = None,
                 verify: Union[bool, str] = True,
                 ca_cert: Optional[str] = None,
                 client_cert: Optional[str] = None,
                 client_cert_key: Optional[str] = None,
                 session_id: Optional[str] = None,
                 settings: Optional[Dict[str, Any]] = None,
                 pool_mgr: Optional[PoolManager] = None,
                 http_proxy: Optional[str] = None,
                 https_proxy: Optional[str] = None,
                 server_host_name: Optional[str] = None,
                 apply_server_timezone: Optional[Union[str, bool]] = None,
                 show_clickhouse_errors: Optional[bool] = None,
                 autogenerate_session_id: Optional[bool] = None):
        """
        Create an HTTP ClickHouse Connect client
        See clickhouse_connect.get_client for parameters
        """
        self.url = f'{interface}://{host}:{port}'
        self.headers = {}
        ch_settings = dict_copy(settings, self.params)
        self.http = pool_mgr
        if interface == 'https':
            if not https_proxy:
                https_proxy = check_env_proxy('https', host, port)
            if https_proxy and isinstance(verify, str) and verify.lower() == 'proxy':
                verify = 'proxy'
            else:
                verify = coerce_bool(verify)
            if client_cert and verify != 'proxy':
                if not username:
                    raise ProgrammingError('username parameter is required for Mutual TLS authentication')
                self.headers['X-ClickHouse-User'] = username
                self.headers['X-ClickHouse-SSL-Certificate-Auth'] = 'on'
            # pylint: disable=too-many-boolean-expressions
            if not self.http and (server_host_name or ca_cert or client_cert or not verify or https_proxy):
                options = {'verify': verify is not False}
                dict_add(options, 'ca_cert', ca_cert)
                dict_add(options, 'client_cert', client_cert)
                dict_add(options, 'client_cert_key', client_cert_key)
                if server_host_name:
                    if options['verify']:
                        options['assert_hostname'] = server_host_name
                    options['server_hostname'] = server_host_name
                self.http = get_pool_manager(https_proxy=https_proxy, **options)
                self._owns_pool_manager = True
        if not self.http:
            if not http_proxy:
                http_proxy = check_env_proxy('http', host, port)
            if http_proxy:
                self.http = get_proxy_manager(host, http_proxy)
            else:
                self.http = default_pool_manager()

        if (not client_cert or verify == 'proxy') and username:
            self.headers['Authorization'] = 'Basic ' + b64encode(f'{username}:{password}'.encode()).decode()
        self.headers['User-Agent'] = common.build_client_name(client_name)
        self._read_format = self._write_format = 'Native'
        self._transform = NativeTransform()

        # There are use cases when the client needs to disable timeouts.
        if connect_timeout is not None:
            connect_timeout = coerce_int(connect_timeout)
        if send_receive_timeout is not None:
            send_receive_timeout = coerce_int(send_receive_timeout)
        self.timeout = Timeout(connect=connect_timeout, read=send_receive_timeout)
        self.http_retries = 1
        self._send_progress = None
        self._send_comp_setting = False
        self._progress_interval = None
        self._active_session = None

        # allow to override the global autogenerate_session_id setting via the constructor params
        _autogenerate_session_id = common.get_setting('autogenerate_session_id') \
            if autogenerate_session_id is None \
            else autogenerate_session_id

        if session_id:
            ch_settings['session_id'] = session_id
        elif 'session_id' not in ch_settings and _autogenerate_session_id:
            ch_settings['session_id'] = str(uuid.uuid4())

        if coerce_bool(compress):
            compression = ','.join(available_compression)
            self.write_compression = available_compression[0]
        elif compress and compress not in ('False', 'false', '0'):
            if compress not in available_compression:
                raise ProgrammingError(f'Unsupported compression method {compress}')
            compression = compress
            self.write_compression = compress
        else:
            compression = None

        super().__init__(database=database,
                         uri=self.url,
                         query_limit=query_limit,
                         query_retries=query_retries,
                         server_host_name=server_host_name,
                         apply_server_timezone=apply_server_timezone,
                         show_clickhouse_errors=show_clickhouse_errors)
        self.params = self._validate_settings(ch_settings)
        comp_setting = self._setting_status('enable_http_compression')
        self._send_comp_setting = not comp_setting.is_set and comp_setting.is_writable
        if comp_setting.is_set or comp_setting.is_writable:
            self.compression = compression
        send_setting = self._setting_status('send_progress_in_http_headers')
        self._send_progress = not send_setting.is_set and send_setting.is_writable
        if (send_setting.is_set or send_setting.is_writable) and \
                self._setting_status('http_headers_progress_interval_ms').is_writable:
            self._progress_interval = str(min(120000, max(10000, (send_receive_timeout - 5) * 1000)))

    def set_client_setting(self, key, value):
        str_value = self._validate_setting(key, value, common.get_setting('invalid_setting_action'))
        if str_value is not None:
            self.params[key] = str_value

    def get_client_setting(self, key) -> Optional[str]:
        return self.params.get(key)

    def _prep_query(self, context: QueryContext):
        final_query = super()._prep_query(context)
        if context.is_insert:
            return final_query
        fmt = f'\n FORMAT {self._read_format}'
        if isinstance(final_query, bytes):
            return final_query + fmt.encode()
        return final_query + fmt

    def _query_with_context(self, context: QueryContext) -> QueryResult:
        headers = {}
        params = {}
        if self.database:
            params['database'] = self.database
        if self.protocol_version:
            params['client_protocol_version'] = self.protocol_version
            context.block_info = True
        params.update(context.bind_params)
        params.update(self._validate_settings(context.settings))
        if columns_only_re.search(context.uncommented_query):
            response = self._raw_request(f'{context.final_query}\n FORMAT JSON',
                                         params, headers, retries=self.query_retries)
            json_result = json.loads(response.data)
            # ClickHouse will respond with a JSON object of meta, data, and some other objects
            # We just grab the column names and column types from the metadata sub object
            names: List[str] = []
            types: List[ClickHouseType] = []
            for col in json_result['meta']:
                names.append(col['name'])
                types.append(registry.get_from_name(col['type']))
            return QueryResult([], None, tuple(names), tuple(types))

        if self.compression:
            headers['Accept-Encoding'] = self.compression
            if self._send_comp_setting:
                params['enable_http_compression'] = '1'
        final_query = self._prep_query(context)
        if context.external_data:
            body = bytes()
            params['query'] = final_query
            params.update(context.external_data.query_params)
            fields = context.external_data.form_data
        else:
            body = final_query
            fields = None
            headers['Content-Type'] = 'text/plain; charset=utf-8'
        response = self._raw_request(body,
                                     params,
                                     headers,
                                     stream=True,
                                     retries=self.query_retries,
                                     fields=fields,
                                     server_wait=not context.streaming)
        byte_source = RespBuffCls(ResponseSource(response))  # pylint: disable=not-callable
        context.set_response_tz(self._check_tz_change(response.headers.get('X-ClickHouse-Timezone')))
        query_result = self._transform.parse_response(byte_source, context)
        query_result.summary = self._summary(response)
        return query_result

    def data_insert(self, context: InsertContext) -> QuerySummary:
        """
        See BaseClient doc_string for this method
        """
        if context.empty:
            logger.debug('No data included in insert, skipping')
            return QuerySummary()

        def error_handler(resp: HTTPResponse):
            # If we actually had a local exception when building the insert, throw that instead
            if context.insert_exception:
                ex = context.insert_exception
                context.insert_exception = None
                raise ex
            self._error_handler(resp)

        headers = {'Content-Type': 'application/octet-stream'}
        if context.compression is None:
            context.compression = self.write_compression
        if context.compression:
            headers['Content-Encoding'] = context.compression
        block_gen = self._transform.build_insert(context)

        params = {}
        if self.database:
            params['database'] = self.database
        params.update(self._validate_settings(context.settings))

        response = self._raw_request(block_gen, params, headers, error_handler=error_handler, server_wait=False)
        logger.debug('Context insert response code: %d, content: %s', response.status, response.data)
        context.data = None
        return QuerySummary(self._summary(response))

    def raw_insert(self, table: str = None,
                   column_names: Optional[Sequence[str]] = None,
                   insert_block: Union[str, bytes, Generator[bytes, None, None], BinaryIO] = None,
                   settings: Optional[Dict] = None,
                   fmt: Optional[str] = None,
                   compression: Optional[str] = None) -> QuerySummary:
        """
        See BaseClient doc_string for this method
        """
        params = {}
        headers = {'Content-Type': 'application/octet-stream'}
        if compression:
            headers['Content-Encoding'] = compression
        if table:
            cols = f" ({', '.join([quote_identifier(x) for x in column_names])})" if column_names is not None else ''
            query = f'INSERT INTO {table}{cols} FORMAT {fmt if fmt else self._write_format}'
            if not compression and isinstance(insert_block, str):
                insert_block = query + '\n' + insert_block
            elif not compression and isinstance(insert_block, (bytes, bytearray, BinaryIO)):
                insert_block = (query + '\n').encode() + insert_block
            else:
                params['query'] = query
        if self.database:
            params['database'] = self.database
        params.update(self._validate_settings(settings or {}))
        response = self._raw_request(insert_block, params, headers, server_wait=False)
        logger.debug('Raw insert response code: %d, content: %s', response.status, response.data)
        return QuerySummary(self._summary(response))

    @staticmethod
    def _summary(response: HTTPResponse):
        summary = {}
        if 'X-ClickHouse-Summary' in response.headers:
            try:
                summary = json.loads(response.headers['X-ClickHouse-Summary'])
            except json.JSONDecodeError:
                pass
        summary['query_id'] = response.headers.get('X-ClickHouse-Query-Id', '')
        return summary

    def command(self,
                cmd,
                parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                data: Union[str, bytes] = None,
                settings: Optional[Dict] = None,
                use_database: int = True,
                external_data: Optional[ExternalData] = None) -> Union[str, int, Sequence[str], QuerySummary]:
        """
        See BaseClient doc_string for this method
        """
        cmd, params = bind_query(cmd, parameters, self.server_tz)
        headers = {}
        payload = None
        fields = None
        if external_data:
            if data:
                raise ProgrammingError('Cannot combine command data with external data') from None
            fields = external_data.form_data
            params.update(external_data.query_params)
        elif isinstance(data, str):
            headers['Content-Type'] = 'text/plain; charset=utf-8'
            payload = data.encode()
        elif isinstance(data, bytes):
            headers['Content-Type'] = 'application/octet-stream'
            payload = data
        if payload is None and not cmd:
            raise ProgrammingError('Command sent without query or recognized data') from None
        if payload or fields:
            params['query'] = cmd
        else:
            payload = cmd
        if use_database and self.database:
            params['database'] = self.database
        params.update(self._validate_settings(settings or {}))

        method = 'POST' if payload or fields else 'GET'
        response = self._raw_request(payload, params, headers, method, fields=fields)
        if response.data:
            try:
                result = response.data.decode()[:-1].split('\t')
                if len(result) == 1:
                    try:
                        return int(result[0])
                    except ValueError:
                        return result[0]
                return result
            except UnicodeDecodeError:
                return str(response.data)
        return QuerySummary(self._summary(response))

    def _error_handler(self, response: HTTPResponse, retried: bool = False) -> None:
        if self.show_clickhouse_errors:
            try:
                err_content = get_response_data(response)
            except Exception:  # pylint: disable=broad-except
                err_content = None
            finally:
                response.close()

            err_str = f'HTTPDriver for {self.url} returned response code {response.status})'
            if err_content:
                err_msg = common.format_error(err_content.decode(errors='backslashreplace'))
                err_str = f'{err_str}\n {err_msg}'
        else:
            err_str = 'The ClickHouse server returned an error.'

        raise OperationalError(err_str) if retried else DatabaseError(err_str) from None

    def _raw_request(self,
                     data,
                     params: Dict[str, str],
                     headers: Optional[Dict[str, Any]] = None,
                     method: str = 'POST',
                     retries: int = 0,
                     stream: bool = False,
                     server_wait: bool = True,
                     fields: Optional[Dict[str, tuple]] = None,
                     error_handler: Callable = None) -> HTTPResponse:
        if isinstance(data, str):
            data = data.encode()
        headers = dict_copy(self.headers, headers)
        attempts = 0
        if server_wait:
            params['wait_end_of_query'] = '1'
        # We can't actually read the progress headers, but we enable them so ClickHouse sends something
        # to keep the connection alive when waiting for long-running queries and (2) to get summary information
        # if not streaming
        if self._send_progress:
            params['send_progress_in_http_headers'] = '1'
        if self._progress_interval:
            params['http_headers_progress_interval_ms'] = self._progress_interval
        final_params = dict_copy(self.params, params)
        url = f'{self.url}?{urlencode(final_params)}'
        kwargs = {
            'headers': headers,
            'timeout': self.timeout,
            'retries': self.http_retries,
            'preload_content': not stream
        }
        if self.server_host_name:
            kwargs['assert_same_host'] = False
            kwargs['headers'].update({'Host': self.server_host_name})
        if fields:
            kwargs['fields'] = fields
        else:
            kwargs['body'] = data
        check_conn_expiration(self.http)
        query_session = final_params.get('session_id')
        while True:
            attempts += 1
            if query_session:
                if query_session == self._active_session:
                    raise ProgrammingError('Attempt to execute concurrent queries within the same session.' +
                                           'Please use a separate client instance per thread/process.')
                # There is a race condition here when using multiprocessing -- in that case the server will
                # throw an error instead, but in most cases this more helpful error will be thrown first
                self._active_session = query_session
            try:
                response = self.http.request(method, url, **kwargs)
            except HTTPError as ex:
                if isinstance(ex.__context__, ConnectionResetError):
                    # The server closed the connection, probably because the Keep Alive has expired
                    # We should be safe to retry, as ClickHouse should not have processed anything on a connection
                    # that it killed.  We also only retry this once, as multiple disconnects are unlikely to be
                    # related to the Keep Alive settings
                    if attempts == 1:
                        logger.debug('Retrying remotely closed connection')
                        continue
                logger.warning('Unexpected Http Driver Exception')
                err_url = f' ({self.url})' if self.show_clickhouse_errors else ''
                raise OperationalError(f'Error {ex} executing HTTP request attempt {attempts}{err_url}') from ex
            finally:
                if query_session:
                    self._active_session = None  # Make sure we always clear this
            if 200 <= response.status < 300:
                return response
            if response.status in (429, 503, 504):
                if attempts > retries:
                    self._error_handler(response, True)
                logger.debug('Retrying requests with status code %d', response.status)
            elif error_handler:
                error_handler(response)
            else:
                self._error_handler(response)

    def raw_query(self, query: str,
                  parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                  settings: Optional[Dict[str, Any]] = None,
                  fmt: str = None,
                  use_database: bool = True,
                  external_data: Optional[ExternalData] = None) -> bytes:
        """
        See BaseClient doc_string for this method
        """
        body, params, fields = self._prep_raw_query(query, parameters, settings, fmt, use_database, external_data)
        return self._raw_request(body, params, fields=fields).data

    def raw_stream(self, query: str,
                   parameters: Optional[Union[Sequence, Dict[str, Any]]] = None,
                   settings: Optional[Dict[str, Any]] = None,
                   fmt: str = None,
                   use_database: bool = True,
                   external_data: Optional[ExternalData] = None) -> io.IOBase:
        """
        See BaseClient doc_string for this method
        """
        body, params, fields = self._prep_raw_query(query, parameters, settings, fmt, use_database, external_data)
        return self._raw_request(body, params, fields=fields, stream=True)

    def _prep_raw_query(self, query: str,
                        parameters: Optional[Union[Sequence, Dict[str, Any]]],
                        settings: Optional[Dict[str, Any]],
                        fmt: str,
                        use_database: bool,
                        external_data: Optional[ExternalData]):
        if fmt:
            query += f'\n FORMAT {fmt}'
        final_query, bind_params = bind_query(query, parameters, self.server_tz)
        params = self._validate_settings(settings or {})
        if use_database and self.database:
            params['database'] = self.database
        params.update(bind_params)
        if external_data:
            if isinstance(final_query, bytes):
                raise ProgrammingError('Cannot combine binary query data with `External Data`')
            body = bytes()
            params['query'] = final_query
            params.update(external_data.query_params)
            fields = external_data.form_data
        else:
            body = final_query
            fields = None
        return body, params, fields

    def ping(self):
        """
        See BaseClient doc_string for this method
        """
        try:
            response = self.http.request('GET', f'{self.url}/ping', timeout=3)
            return 200 <= response.status < 300
        except HTTPError:
            logger.debug('ping failed', exc_info=True)
            return False

    def close(self):
        if self._owns_pool_manager:
            self.http.clear()
            all_managers.pop(self.http, None)
