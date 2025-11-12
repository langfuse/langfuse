from typing import Optional, Sequence, Dict, Any

from clickhouse_connect.driver import Client
from clickhouse_connect.driver.summary import QuerySummary
from clickhouse_connect.driver.query import quote_identifier


def insert_file(client: Client,
                table: str,
                file_path: str,
                fmt: Optional[str] = None,
                column_names: Optional[Sequence[str]] = None,
                database: Optional[str] = None,
                settings: Optional[Dict[str, Any]] = None,
                compression: Optional[str] = None) -> QuerySummary:
    if not database and table[0] not in ('`', "'") and table.find('.') > 0:
        full_table = table
    elif database:
        full_table = f'{quote_identifier(database)}.{quote_identifier(table)}'
    else:
        full_table = quote_identifier(table)
    if not fmt:
        fmt = 'CSV' if column_names else 'CSVWithNames'
    if compression is None:
        if file_path.endswith('.gzip') or file_path.endswith('.gz'):
            compression = 'gzip'
    with open(file_path, 'rb') as file:
        return client.raw_insert(full_table,
                                 column_names=column_names,
                                 insert_block=file,
                                 fmt=fmt,
                                 settings=settings,
                                 compression=compression)
