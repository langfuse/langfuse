import logging
import re
from typing import Optional, Dict, Union, Any

logger = logging.getLogger(__name__)

_empty_map = {}


# pylint: disable=too-many-instance-attributes
class BaseQueryContext:

    def __init__(self,
                 settings: Optional[Dict[str, Any]] = None,
                 query_formats: Optional[Dict[str, str]] = None,
                 column_formats: Optional[Dict[str, Union[str, Dict[str, str]]]] = None,
                 encoding: Optional[str] = None,
                 use_extended_dtypes: bool = False,
                 use_numpy: bool = False):
        self.settings = settings or {}
        if query_formats is None:
            self.type_formats = _empty_map
        else:
            self.type_formats = {re.compile(type_name.replace('*', '.*'), re.IGNORECASE): fmt
                                 for type_name, fmt in query_formats.items()}
        if column_formats is None:
            self.col_simple_formats = _empty_map
            self.col_type_formats = _empty_map
        else:
            self.col_simple_formats = {col_name: fmt for col_name, fmt in column_formats.items() if
                                       isinstance(fmt, str)}
            self.col_type_formats = {}
            for col_name, fmt in column_formats.items():
                if not isinstance(fmt, str):
                    self.col_type_formats[col_name] = {re.compile(type_name.replace('*', '.*'), re.IGNORECASE): fmt
                                                       for type_name, fmt in fmt.items()}
        self.query_formats = query_formats or {}
        self.column_formats = column_formats or {}
        self.encoding = encoding
        self.use_numpy = use_numpy
        self.use_extended_dtypes = use_extended_dtypes
        self._active_col_fmt = None
        self._active_col_type_fmts = _empty_map

    def start_column(self, name: str):
        self._active_col_fmt = self.col_simple_formats.get(name)
        self._active_col_type_fmts = self.col_type_formats.get(name, _empty_map)

    def active_fmt(self, ch_type):
        if self._active_col_fmt:
            return self._active_col_fmt
        for type_pattern, fmt in self._active_col_type_fmts.items():
            if type_pattern.match(ch_type):
                return fmt
        for type_pattern, fmt in self.type_formats.items():
            if type_pattern.match(ch_type):
                return fmt
        return None
