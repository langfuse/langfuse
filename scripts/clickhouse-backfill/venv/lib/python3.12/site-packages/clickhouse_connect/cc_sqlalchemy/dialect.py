
from sqlalchemy.engine.default import DefaultDialect

from clickhouse_connect import dbapi

from clickhouse_connect.cc_sqlalchemy.inspector import ChInspector
from clickhouse_connect.cc_sqlalchemy.sql import full_table
from clickhouse_connect.cc_sqlalchemy.sql.ddlcompiler import ChDDLCompiler
from clickhouse_connect.cc_sqlalchemy import ischema_names, dialect_name
from clickhouse_connect.cc_sqlalchemy.sql.preparer import ChIdentifierPreparer
from clickhouse_connect.driver.query import quote_identifier, format_str


# pylint: disable=too-many-public-methods,no-self-use,unused-argument
class ClickHouseDialect(DefaultDialect):
    """
    See :py:class:`sqlalchemy.engine.interfaces`
    """
    name = dialect_name
    driver = 'connect'

    default_schema_name = 'default'
    supports_native_decimal = True
    supports_native_boolean = True
    supports_statement_cache = False
    returns_unicode_strings = True
    postfetch_lastrowid = False
    ddl_compiler = ChDDLCompiler
    preparer = ChIdentifierPreparer
    description_encoding = None
    max_identifier_length = 127
    ischema_names = ischema_names
    inspector = ChInspector

    # pylint: disable=method-hidden
    @classmethod
    def dbapi(cls):
        return dbapi

    def initialize(self, connection):
        pass

    @staticmethod
    def get_schema_names(connection, **_):
        return [row.name for row in connection.execute('SHOW DATABASES')]

    @staticmethod
    def has_database(connection, db_name):
        return (connection.execute('SELECT name FROM system.databases ' +
                                   f'WHERE name = {format_str(db_name)}')).rowcount > 0

    def get_table_names(self, connection, schema=None, **kw):
        cmd = 'SHOW TABLES'
        if schema:
            cmd += ' FROM ' + quote_identifier(schema)
        return [row.name for row in connection.execute(cmd)]

    def get_primary_keys(self, connection, table_name, schema=None, **kw):
        return []

    #  pylint: disable=arguments-renamed
    def get_pk_constraint(self, connection, table_name, schema=None, **kw):
        return []

    def get_foreign_keys(self, connection, table_name, schema=None, **kw):
        return []

    def get_temp_table_names(self, connection, schema=None, **kw):
        return []

    def get_view_names(self, connection, schema=None, **kw):
        return []

    def get_temp_view_names(self, connection, schema=None, **kw):
        return []

    def get_view_definition(self, connection, view_name, schema=None, **kw):
        pass

    def get_indexes(self, connection, table_name, schema=None, **kw):
        return []

    def get_unique_constraints(self, connection, table_name, schema=None, **kw):
        return []

    def get_check_constraints(self, connection, table_name, schema=None, **kw):
        return []

    def has_table(self, connection, table_name, schema=None, **_kw):
        result = connection.execute(f'EXISTS TABLE {full_table(table_name, schema)}')
        row = result.fetchone()
        return row[0] == 1

    def has_sequence(self, connection, sequence_name, schema=None, **_kw):
        return False

    def do_begin_twophase(self, connection, xid):
        raise NotImplementedError

    def do_prepare_twophase(self, connection, xid):
        raise NotImplementedError

    def do_rollback_twophase(self, connection, xid, is_prepared=True, recover=False):
        raise NotImplementedError

    def do_commit_twophase(self, connection, xid, is_prepared=True, recover=False):
        raise NotImplementedError

    def do_recover_twophase(self, connection):
        raise NotImplementedError

    def set_isolation_level(self, dbapi_conn, level):
        pass

    def get_isolation_level(self, dbapi_conn):
        return None
