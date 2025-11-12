import getpass
import sys
from dataclasses import dataclass
from typing import Any, Sequence, Optional, Dict
from clickhouse_connect import __version__


from clickhouse_connect.driver.exceptions import ProgrammingError


def version():
    return __version__.version


def format_error(msg: str) -> str:
    max_size = _common_settings['max_error_size'].value
    if max_size:
        return msg[:max_size]
    return msg


@dataclass
class CommonSetting:
    name: str
    options: Sequence[Any]
    default: Any
    value: Optional[Any] = None


_common_settings: Dict[str, CommonSetting] = {}


def build_client_name(client_name: str):
    product_name = get_setting('product_name')
    product_name = product_name.strip() + ' ' if product_name else ''
    client_name = client_name.strip() + ' ' if client_name else ''
    py_version = sys.version.split(' ', maxsplit=1)[0]
    os_user = ''
    if get_setting('send_os_user'):
        try:
            os_user = f'; os_user:{getpass.getuser()}'
        except Exception:  # pylint: disable=broad-except
            pass
    return (f'{client_name}{product_name}clickhouse-connect/{version()}' +
            f' (lv:py/{py_version}; mode:sync; os:{sys.platform}{os_user})')


def get_setting(name: str):
    setting = _common_settings.get(name)
    if setting is None:
        raise ProgrammingError(f'Unrecognized common setting {name}')
    return setting.value if setting.value is not None else setting.default


def set_setting(name: str, value: Any):
    setting = _common_settings.get(name)
    if setting is None:
        raise ProgrammingError(f'Unrecognized common setting {name}')
    if setting.options and value not in setting.options:
        raise ProgrammingError(f'Unrecognized option {value} for setting {name})')
    if value == setting.default:
        setting.value = None
    else:
        setting.value = value


def _init_common(name: str, options: Sequence[Any], default: Any):
    _common_settings[name] = CommonSetting(name, options, default)


_init_common('autogenerate_session_id', (True, False), True)
_init_common('dict_parameter_format', ('json', 'map'), 'json')
_init_common('invalid_setting_action', ('send', 'drop', 'error'), 'error')
_init_common('max_connection_age', (), 10 * 60)  # Max time in seconds to keep reusing a database TCP connection
_init_common('product_name', (), '')  # Product name used as part of client identification for ClickHouse query_log
_init_common('readonly', (0, 1), 0)  # Implied "read_only" ClickHouse settings for versions prior to 19.17
_init_common('send_os_user', (True, False), True)

# Use the client protocol version  This is needed for DateTime timezone columns but breaks with current version of
# chproxy
_init_common('use_protocol_version', (True, False), True)

_init_common('max_error_size', (), 1024)
