import logging
import json as py_json
from collections import OrderedDict
from typing import Any

try:
    import orjson
    any_to_json = orjson.dumps  # pylint: disable=no-member
except ImportError:
    orjson = None

try:
    import ujson

    def _ujson_to_json(obj: Any) -> bytes:
        return ujson.dumps(obj).encode()  # pylint: disable=c-extension-no-member
except ImportError:
    ujson = None
    _ujson_to_json = None


def _pyjson_to_json(obj: Any) -> bytes:
    return py_json.dumps(obj, separators=(',', ':')).encode()


logger = logging.getLogger(__name__)
_to_json = OrderedDict()
_to_json['orjson'] = orjson.dumps if orjson else None  # pylint: disable=no-member
_to_json['ujson'] = _ujson_to_json if ujson else None
_to_json['python'] = _pyjson_to_json

any_to_json = _pyjson_to_json


def set_json_library(impl: str = None):
    global any_to_json # pylint: disable=global-statement
    if impl:
        func = _to_json.get(impl)
        if func:
            any_to_json = func
            return
        raise NotImplementedError(f'JSON library {impl} is not supported')
    for library, func in _to_json.items():
        if func:
            logger.debug('Using %s library for writing JSON byte strings', library)
            any_to_json = func
            break


set_json_library()
