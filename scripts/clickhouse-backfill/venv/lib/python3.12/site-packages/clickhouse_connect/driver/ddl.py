from typing import NamedTuple, Sequence

from clickhouse_connect.datatypes.base import ClickHouseType


class TableColumnDef(NamedTuple):
    """
    Simplified ClickHouse Table Column definition for DDL
    """
    name: str
    ch_type: ClickHouseType
    expr_type: str = None
    expr: str = None

    @property
    def col_expr(self):
        expr = f'{self.name} {self.ch_type.name}'
        if self.expr_type:
            expr += f' {self.expr_type} {self.expr}'
        return expr


def create_table(table_name: str, columns: Sequence[TableColumnDef], engine: str, engine_params: dict):
    stmt = f"CREATE TABLE {table_name} ({', '.join(col.col_expr for col in columns)}) ENGINE {engine} "
    if engine_params:
        for key, value in engine_params.items():
            stmt += f' {key} {value}'
    return stmt
