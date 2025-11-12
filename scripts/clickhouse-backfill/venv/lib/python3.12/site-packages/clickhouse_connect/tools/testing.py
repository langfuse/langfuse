from typing import Sequence, Optional, Union, Dict, Any

from clickhouse_connect.driver import Client
from clickhouse_connect.driver.query import quote_identifier, str_query_value


class TableContext:
    def __init__(self, client: Client,
                 table: str,
                 columns: Union[str, Sequence[str]],
                 column_types: Optional[Sequence[str]] = None,
                 engine: str = 'MergeTree',
                 order_by: str = None,
                 settings: Optional[Dict[str, Any]] = None):
        self.client = client
        if '.' in table:
            self.table = table
        else:
            self.table = quote_identifier(table)
        self.settings = settings
        if isinstance(columns, str):
            columns = columns.split(',')
        if column_types is None:
            self.column_names = []
            self.column_types = []
            for col in columns:
                col = col.strip()
                ix = col.find(' ')
                self.column_types.append(col[ix + 1:].strip())
                self.column_names.append(quote_identifier(col[:ix].strip()))
        else:
            self.column_names = [quote_identifier(name) for name in columns]
            self.column_types = column_types
        self.engine = engine
        self.order_by = self.column_names[0] if order_by is None else order_by

    def __enter__(self):
        if self.client.min_version('19'):
            self.client.command(f'DROP TABLE IF EXISTS {self.table}')
        else:
            self.client.command(f'DROP TABLE IF EXISTS {self.table} SYNC')
        col_defs = ','.join(f'{quote_identifier(name)} {col_type}' for name, col_type in zip(self.column_names, self.column_types))
        create_cmd = f'CREATE TABLE {self.table} ({col_defs}) ENGINE {self.engine} ORDER BY {self.order_by}'
        if self.settings:
            create_cmd += ' SETTINGS '
            for key, value in self.settings.items():
                create_cmd += f'{key} = {str_query_value(value)}, '
            if create_cmd.endswith(', '):
                create_cmd = create_cmd[:-2]
        self.client.command(create_cmd)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.client.command(f'DROP TABLE IF EXISTS {self.table}')
