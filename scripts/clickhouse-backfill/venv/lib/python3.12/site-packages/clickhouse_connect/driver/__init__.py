import asyncio
from inspect import signature
from typing import Optional, Union, Dict, Any
from urllib.parse import urlparse, parse_qs

import clickhouse_connect.driver.ctypes
from clickhouse_connect.driver.client import Client
from clickhouse_connect.driver.common import dict_copy
from clickhouse_connect.driver.exceptions import ProgrammingError
from clickhouse_connect.driver.httpclient import HttpClient
from clickhouse_connect.driver.asyncclient import AsyncClient


# pylint: disable=too-many-arguments,too-many-locals,too-many-branches
def create_client(*,
                  host: str = None,
                  username: str = None,
                  password: str = '',
                  database: str = '__default__',
                  interface: Optional[str] = None,
                  port: int = 0,
                  secure: Union[bool, str] = False,
                  dsn: Optional[str] = None,
                  settings: Optional[Dict[str, Any]] = None,
                  generic_args: Optional[Dict[str, Any]] = None,
                  **kwargs) -> Client:
    """
    The preferred method to get a ClickHouse Connect Client instance

    :param host: The hostname or IP address of the ClickHouse server. If not set, localhost will be used.
    :param username: The ClickHouse username. If not set, the default ClickHouse user will be used.
    :param password: The password for username.
    :param database:  The default database for the connection. If not set, ClickHouse Connect will use the
     default database for username.
    :param interface: Must be http or https.  Defaults to http, or to https if port is set to 8443 or 443
    :param port: The ClickHouse HTTP or HTTPS port. If not set will default to 8123, or to 8443 if secure=True
      or interface=https.
    :param secure: Use https/TLS. This overrides inferred values from the interface or port arguments.
    :param dsn: A string in standard DSN (Data Source Name) format. Other connection values (such as host or user)
      will be extracted from this string if not set otherwise.
    :param settings: ClickHouse server settings to be used with the session/every request
    :param generic_args: Used internally to parse DBAPI connection strings into keyword arguments and ClickHouse settings.
      It is not recommended to use this parameter externally.

    :param kwargs -- Recognized keyword arguments (used by the HTTP client), see below

    :param compress: Enable compression for ClickHouse HTTP inserts and query results.  True will select the preferred
      compression method (lz4).  A str of 'lz4', 'zstd', 'brotli', or 'gzip' can be used to use a specific compression type
    :param query_limit: Default LIMIT on returned rows.  0 means no limit
    :param connect_timeout:  Timeout in seconds for the http connection
    :param send_receive_timeout: Read timeout in seconds for http connection
    :param client_name: client_name prepended to the HTTP User Agent header. Set this to track client queries
      in the ClickHouse system.query_log.
    :param send_progress: Deprecated, has no effect.  Previous functionality is now automatically determined
    :param verify: Verify the server certificate in secure/https mode
    :param ca_cert: If verify is True, the file path to Certificate Authority root to validate ClickHouse server
     certificate, in .pem format.  Ignored if verify is False.  This is not necessary if the ClickHouse server
     certificate is trusted by the operating system.  To trust the maintained list of "global" public root
     certificates maintained by the Python 'certifi' package, set ca_cert to 'certifi'
    :param client_cert: File path to a TLS Client certificate in .pem format.  This file should contain any
      applicable intermediate certificates
    :param client_cert_key: File path to the private key for the Client Certificate.  Required if the private key
      is not included the Client Certificate key file
    :param session_id ClickHouse session id.  If not specified and the common setting 'autogenerate_session_id'
      is True, the client will generate a UUID1 session id
    :param pool_mgr Optional urllib3 PoolManager for this client.  Useful for creating separate connection
      pools for multiple client endpoints for applications with many clients
    :param http_proxy  http proxy address.  Equivalent to setting the HTTP_PROXY environment variable
    :param https_proxy https proxy address.  Equivalent to setting the HTTPS_PROXY environment variable
    :param server_host_name  This is the server host name that will be checked against a TLS certificate for
      validity.  This option can be used if using an ssh_tunnel or other indirect means to an ClickHouse server
      where the `host` argument refers to the tunnel or proxy and not the actual ClickHouse server
    :param autogenerate_session_id  If set, this will override the 'autogenerate_session_id' common setting.
    :return: ClickHouse Connect Client instance
    """
    if dsn:
        parsed = urlparse(dsn)
        username = username or parsed.username
        password = password or parsed.password
        host = host or parsed.hostname
        port = port or parsed.port
        if parsed.path and (not database or database == '__default__'):
            database = parsed.path[1:].split('/')[0]
        database = database or parsed.path
        for k, v in parse_qs(parsed.query).items():
            kwargs[k] = v[0]
    use_tls = str(secure).lower() == 'true' or interface == 'https' or (not interface and port in (443, 8443))
    if not host:
        host = 'localhost'
    if not interface:
        interface = 'https' if use_tls else 'http'
    port = port or default_port(interface, use_tls)
    if username is None and 'user' in kwargs:
        username = kwargs.pop('user')
    if username is None and 'user_name' in kwargs:
        username = kwargs.pop('user_name')
    if password and username is None:
        username = 'default'
    if 'compression' in kwargs and 'compress' not in kwargs:
        kwargs['compress'] = kwargs.pop('compression')
    settings = settings or {}
    if interface.startswith('http'):
        if generic_args:
            client_params = signature(HttpClient).parameters
            for name, value in generic_args.items():
                if name in client_params:
                    kwargs[name] = value
                elif name == 'compression':
                    if 'compress' not in kwargs:
                        kwargs['compress'] = value
                else:
                    if name.startswith('ch_'):
                        name = name[3:]
                    settings[name] = value
        return HttpClient(interface, host, port, username, password, database, settings=settings, **kwargs)
    raise ProgrammingError(f'Unrecognized client type {interface}')


def default_port(interface: str, secure: bool):
    if interface.startswith('http'):
        return 8443 if secure else 8123
    raise ValueError('Unrecognized ClickHouse interface')


async def create_async_client(*,
                              host: str = None,
                              username: str = None,
                              password: str = '',
                              database: str = '__default__',
                              interface: Optional[str] = None,
                              port: int = 0,
                              secure: Union[bool, str] = False,
                              dsn: Optional[str] = None,
                              settings: Optional[Dict[str, Any]] = None,
                              generic_args: Optional[Dict[str, Any]] = None,
                              **kwargs) -> AsyncClient:
    """
    The preferred method to get an async ClickHouse Connect Client instance.
    For sync version, see create_client.

    Unlike sync version, the 'autogenerate_session_id' setting by default is False.

    :param host: The hostname or IP address of the ClickHouse server. If not set, localhost will be used.
    :param username: The ClickHouse username. If not set, the default ClickHouse user will be used.
    :param password: The password for username.
    :param database:  The default database for the connection. If not set, ClickHouse Connect will use the
     default database for username.
    :param interface: Must be http or https.  Defaults to http, or to https if port is set to 8443 or 443
    :param port: The ClickHouse HTTP or HTTPS port. If not set will default to 8123, or to 8443 if secure=True
      or interface=https.
    :param secure: Use https/TLS. This overrides inferred values from the interface or port arguments.
    :param dsn: A string in standard DSN (Data Source Name) format. Other connection values (such as host or user)
      will be extracted from this string if not set otherwise.
    :param settings: ClickHouse server settings to be used with the session/every request
    :param generic_args: Used internally to parse DBAPI connection strings into keyword arguments and ClickHouse settings.
      It is not recommended to use this parameter externally
    :param kwargs -- Recognized keyword arguments (used by the HTTP client), see below

    :param compress: Enable compression for ClickHouse HTTP inserts and query results.  True will select the preferred
      compression method (lz4).  A str of 'lz4', 'zstd', 'brotli', or 'gzip' can be used to use a specific compression type
    :param query_limit: Default LIMIT on returned rows.  0 means no limit
    :param connect_timeout:  Timeout in seconds for the http connection
    :param send_receive_timeout: Read timeout in seconds for http connection
    :param client_name: client_name prepended to the HTTP User Agent header. Set this to track client queries
      in the ClickHouse system.query_log.
    :param send_progress: Deprecated, has no effect.  Previous functionality is now automatically determined
    :param verify: Verify the server certificate in secure/https mode
    :param ca_cert: If verify is True, the file path to Certificate Authority root to validate ClickHouse server
     certificate, in .pem format.  Ignored if verify is False.  This is not necessary if the ClickHouse server
     certificate is trusted by the operating system.  To trust the maintained list of "global" public root
     certificates maintained by the Python 'certifi' package, set ca_cert to 'certifi'
    :param client_cert: File path to a TLS Client certificate in .pem format.  This file should contain any
      applicable intermediate certificates
    :param client_cert_key: File path to the private key for the Client Certificate.  Required if the private key
      is not included the Client Certificate key file
    :param session_id ClickHouse session id.  If not specified and the common setting 'autogenerate_session_id'
      is True, the client will generate a UUID1 session id
    :param pool_mgr Optional urllib3 PoolManager for this client.  Useful for creating separate connection
      pools for multiple client endpoints for applications with many clients
    :param http_proxy  http proxy address.  Equivalent to setting the HTTP_PROXY environment variable
    :param https_proxy https proxy address.  Equivalent to setting the HTTPS_PROXY environment variable
    :param server_host_name  This is the server host name that will be checked against a TLS certificate for
      validity.  This option can be used if using an ssh_tunnel or other indirect means to an ClickHouse server
      where the `host` argument refers to the tunnel or proxy and not the actual ClickHouse server
    :param autogenerate_session_id  If set, this will override the 'autogenerate_session_id' common setting.
    :return: ClickHouse Connect Client instance
    """

    def _create_client():
        if 'autogenerate_session_id' not in kwargs:
            kwargs['autogenerate_session_id'] = False
        return create_client(host=host, username=username, password=password, database=database, interface=interface,
                             port=port, secure=secure, dsn=dsn, settings=settings, generic_args=generic_args, **kwargs)

    loop = asyncio.get_running_loop()
    _client = await loop.run_in_executor(None, _create_client)
    return AsyncClient(client=_client)
