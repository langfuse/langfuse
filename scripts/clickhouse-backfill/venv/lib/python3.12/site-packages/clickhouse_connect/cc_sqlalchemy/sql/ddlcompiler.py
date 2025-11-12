from sqlalchemy import Column
from sqlalchemy.sql.compiler import DDLCompiler

from clickhouse_connect.cc_sqlalchemy.sql import  format_table
from clickhouse_connect.driver.query import quote_identifier


class ChDDLCompiler(DDLCompiler):

    def visit_create_schema(self, create, **_):
        return f'CREATE DATABASE {quote_identifier(create.element)}'

    def visit_drop_schema(self, drop, **_):
        return f'DROP DATABASE {quote_identifier(drop.element)}'

    def visit_create_table(self, create, **_):
        table = create.element
        text = f'CREATE TABLE {format_table(table)} ('
        text += ', '.join([self.get_column_specification(c.element) for c in create.columns])
        return text + ') ' + table.engine.compile()

    def get_column_specification(self, column: Column, **_):
        text = f'{quote_identifier(column.name)} {column.type.compile()}'
        return text
