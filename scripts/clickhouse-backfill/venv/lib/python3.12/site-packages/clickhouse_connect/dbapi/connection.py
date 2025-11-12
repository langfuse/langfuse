from typing import Union

from clickhouse_connect.dbapi.cursor import Cursor
from clickhouse_connect.driver import create_client
from clickhouse_connect.driver.query import QueryResult


class Connection:
    """
    See :ref:`https://peps.python.org/pep-0249/`
    """
    # pylint: disable=too-many-arguments
    def __init__(self,
                 dsn: str = None,
                 username: str = '',
                 password: str = '',
                 host: str = None,
                 database: str = None,
                 interface: str = None,
                 port: int = 0,
                 secure: Union[bool, str] = False,
                 **kwargs):
        self.client = create_client(host=host,
                                    username=username,
                                    password=password,
                                    database=database,
                                    interface=interface,
                                    port=port,
                                    secure=secure,
                                    dsn=dsn,
                                    generic_args=kwargs)
        self.timezone = self.client.server_tz

    def close(self):
        self.client.close()

    def commit(self):
        pass

    def rollback(self):
        pass

    def command(self, cmd: str):
        return self.client.command(cmd)

    def raw_query(self, query: str) -> QueryResult:
        return self.client.query(query)

    def cursor(self):
        return Cursor(self.client)
