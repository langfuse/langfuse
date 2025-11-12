from typing import Optional

from sqlalchemy import Table

from clickhouse_connect.driver.query import quote_identifier


def full_table(table_name: str, schema: Optional[str] = None) -> str:
    if table_name.startswith('(') or '.' in table_name or not schema:
        return quote_identifier(table_name)
    return f'{quote_identifier(schema)}.{quote_identifier(table_name)}'


def format_table(table: Table):
    return full_table(table.name, table.schema)
