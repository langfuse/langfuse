from typing import Optional

from clickhouse_connect.datatypes.registry import get_from_name

from clickhouse_connect.driver.query import QueryResult


class QuerySummary:
    summary = {}

    def __init__(self, summary: Optional[dict] = None):
        if summary is not None:
            self.summary = summary

    @property
    def written_rows(self) -> int:
        return int(self.summary.get('written_rows', 0))

    def written_bytes(self) -> int:
        return int(self.summary.get('written_bytes', 0))

    def query_id(self) -> str:
        return self.summary.get('query_id', '')

    def as_query_result(self) -> QueryResult:
        data = []
        column_names = []
        column_types = []
        str_type = get_from_name('String')
        int_type = get_from_name('Int64')
        for key, value in self.summary.items():
            column_names.append(key)
            if value.isnumeric():
                data.append(int(value))
                column_types.append(int_type)
            else:
                data.append(value)
                column_types.append(str_type)
        return QueryResult([data], column_names=tuple(column_names), column_types=tuple(column_types))
