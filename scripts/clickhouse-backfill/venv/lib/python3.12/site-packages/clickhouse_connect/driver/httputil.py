import atexit
import http
import logging
import multiprocessing
import os
import sys
import socket
import time
from typing import Dict, Any, Optional

import certifi
import lz4.frame
import urllib3
import zstandard
from urllib3.poolmanager import PoolManager, ProxyManager
from urllib3.response import HTTPResponse

from clickhouse_connect.driver.exceptions import ProgrammingError
from clickhouse_connect import common

logger = logging.getLogger(__name__)

# We disable this warning.  Verify must be explicitly set to false, so we assume the user knows what they're doing
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Increase this number just to be safe when ClickHouse is returning progress headers
http.client._MAXHEADERS = 10000  # pylint: disable=protected-access

DEFAULT_KEEP_INTERVAL = 30
DEFAULT_KEEP_COUNT = 3
DEFAULT_KEEP_IDLE = 30

SOCKET_TCP = socket.IPPROTO_TCP

core_socket_options = [
    (socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1),
    (SOCKET_TCP, socket.TCP_NODELAY, 1),
    (socket.SOL_SOCKET, socket.SO_SNDBUF, 1024 * 256),
    (socket.SOL_SOCKET, socket.SO_SNDBUF, 1024 * 256)
]

logging.getLogger('urllib3').setLevel(logging.WARNING)
_proxy_managers = {}
all_managers = {}


@atexit.register
def close_managers():
    for manager in all_managers:
        manager.clear()


# pylint: disable=no-member,too-many-arguments,too-many-branches
def get_pool_manager_options(keep_interval: int = DEFAULT_KEEP_INTERVAL,
                             keep_count: int = DEFAULT_KEEP_COUNT,
                             keep_idle: int = DEFAULT_KEEP_IDLE,
                             ca_cert: str = None,
                             verify: bool = True,
                             client_cert: str = None,
                             client_cert_key: str = None,
                             **options) -> Dict[str, Any]:
    socket_options = core_socket_options.copy()
    if getattr(socket, 'TCP_KEEPINTVL', None) is not None:
        socket_options.append((SOCKET_TCP, socket.TCP_KEEPINTVL, keep_interval))
    if getattr(socket, 'TCP_KEEPCNT', None) is not None:
        socket_options.append((SOCKET_TCP, socket.TCP_KEEPCNT, keep_count))
    if getattr(socket, 'TCP_KEEPIDLE', None) is not None:
        socket_options.append((SOCKET_TCP, socket.TCP_KEEPIDLE, keep_idle))
    if sys.platform == 'darwin':
        socket_options.append((SOCKET_TCP, getattr(socket, 'TCP_KEEPALIVE', 0x10), keep_interval))
    options['maxsize'] = options.get('maxsize', 8)
    options['retries'] = options.get('retries', 1)
    if ca_cert == 'certifi':
        ca_cert = certifi.where()
    options['cert_reqs'] = 'CERT_REQUIRED' if verify else 'CERT_NONE'
    if ca_cert:
        options['ca_certs'] = ca_cert
    if client_cert:
        options['cert_file'] = client_cert
    if client_cert_key:
        options['key_file'] = client_cert_key
    options['socket_options'] = socket_options
    options['block'] = options.get('block', False)
    return options


def get_pool_manager(keep_interval: int = DEFAULT_KEEP_INTERVAL,
                     keep_count: int = DEFAULT_KEEP_COUNT,
                     keep_idle: int = DEFAULT_KEEP_IDLE,
                     ca_cert: str = None,
                     verify: bool = True,
                     client_cert: str = None,
                     client_cert_key: str = None,
                     http_proxy: str = None,
                     https_proxy: str = None,
                     **options):
    options = get_pool_manager_options(keep_interval,
                                       keep_count,
                                       keep_idle,
                                       ca_cert,
                                       verify,
                                       client_cert,
                                       client_cert_key,
                                       **options)
    if http_proxy:
        if https_proxy:
            raise ProgrammingError('Only one of http_proxy or https_proxy should be specified')
        if not http_proxy.startswith('http'):
            http_proxy = f'http://{http_proxy}'
        manager = ProxyManager(http_proxy, **options)
    elif https_proxy:
        if not https_proxy.startswith('http'):
            https_proxy = f'https://{https_proxy}'
        manager = ProxyManager(https_proxy, **options)
    else:
        manager = PoolManager(**options)
    all_managers[manager] = int(time.time())
    return manager


def check_conn_expiration(manager: PoolManager):
    reset_seconds = common.get_setting('max_connection_age')
    if reset_seconds:
        last_reset = all_managers.get(manager, 0)
        now = int(time.time())
        if last_reset < now - reset_seconds:
            logger.debug('connection expiration')
            manager.clear()
            all_managers[manager] = now


def get_proxy_manager(host: str, http_proxy):
    key = f'{host}__{http_proxy}'
    if key in _proxy_managers:
        return _proxy_managers[key]
    proxy_manager = get_pool_manager(http_proxy=http_proxy)
    _proxy_managers[key] = proxy_manager
    return proxy_manager


def get_response_data(response: HTTPResponse) -> bytes:
    encoding = response.headers.get('content-encoding', None)
    if encoding == 'zstd':
        try:
            zstd_decom = zstandard.ZstdDecompressor()
            return zstd_decom.stream_reader(response.data).read()
        except zstandard.ZstdError:
            pass
    if encoding == 'lz4':
        lz4_decom = lz4.frame.LZ4FrameDecompressor()
        return lz4_decom.decompress(response.data, len(response.data))
    return response.data


def check_env_proxy(scheme: str, host: str, port: int) -> Optional[str]:
    env_var = f'{scheme}_proxy'.lower()
    proxy = os.environ.get(env_var)
    if not proxy:
        proxy = os.environ.get(env_var.upper())
        if not proxy:
            return None
    no_proxy = os.environ.get('no_proxy')
    if not no_proxy:
        no_proxy = os.environ.get('NO_PROXY')
        if not no_proxy:
            return proxy
    if no_proxy == '*':
        return None  # Wildcard no proxy means don't actually proxy anything
    host = host.lower()
    for name in no_proxy.split(','):
        name = name.strip()
        if name:
            name = name.lstrip('.').lower()
            if name in (host, f'{host}:{port}'):
                return None  # Host or host/port matches
            if host.endswith('.' + name):
                return None  # Domain matches
    return proxy


_default_pool_manager = get_pool_manager()


def default_pool_manager():
    if multiprocessing.current_process().name == 'MainProcess':
        return _default_pool_manager
    #  PoolManagers don't seem to be safe for some multiprocessing environments, always return a new one
    return get_pool_manager()


class ResponseSource:
    def __init__(self, response: HTTPResponse, chunk_size: int = 1024 * 1024):
        self.response = response
        compression = response.headers.get('content-encoding')
        if compression == 'zstd':
            zstd_decom = zstandard.ZstdDecompressor().decompressobj()

            def decompress():
                while True:
                    chunk = response.read(chunk_size, decode_content=False)
                    if not chunk:
                        break
                    yield zstd_decom.decompress(chunk)

            self.gen = decompress()
        elif compression == 'lz4':
            lz4_decom = lz4.frame.LZ4FrameDecompressor()

            def decompress():
                while lz4_decom.needs_input:
                    data = self.response.read(chunk_size, decode_content=False)
                    if lz4_decom.unused_data:
                        data = lz4_decom.unused_data + data
                    if not data:
                        return
                    chunk = lz4_decom.decompress(data)
                    if chunk:
                        yield chunk

            self.gen = decompress()
        else:
            self.gen = response.stream(amt=chunk_size, decode_content=True)

    def close(self):
        self.response.drain_conn()
        self.response.close()
