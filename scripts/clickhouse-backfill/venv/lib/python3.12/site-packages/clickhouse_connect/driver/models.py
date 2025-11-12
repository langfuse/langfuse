from typing import NamedTuple

from clickhouse_connect.datatypes.registry import get_from_name


class ColumnDef(NamedTuple):
    """
    ClickHouse column definition from DESCRIBE TABLE command
    """
    name: str
    type: str
    default_type: str
    default_expression: str
    comment: str
    codec_expression: str
    ttl_expression: str

    @property
    def type_name(self):
        return self.type.replace('\n', '').strip()

    @property
    def ch_type(self):
        return get_from_name(self.type_name)


class SettingDef(NamedTuple):
    """
    ClickHouse setting definition from system.settings table
    """
    name: str
    value: str
    readonly: int


class SettingStatus(NamedTuple):
    """
    Get the setting "status" from a ClickHouse server setting
    """
    is_set: bool
    is_writable: bool
