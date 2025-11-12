import logging
import re

from typing import Optional, Sequence, List, Dict

from clickhouse_connect.datatypes.registry import get_from_name
from clickhouse_connect.driver.common import unescape_identifier
from clickhouse_connect.driver.exceptions import ProgrammingError
from clickhouse_connect.driver import Client
from clickhouse_connect.driver.parser import parse_callable
from clickhouse_connect.driver.query import remove_sql_comments

logger = logging.getLogger(__name__)

insert_re = re.compile(r'^\s*INSERT\s+INTO\s+(.*$)', re.IGNORECASE)
str_type = get_from_name('String')
int_type = get_from_name('Int32')


# pylint: disable=too-many-instance-attributes
class Cursor:
    """
    See :ref:`https://peps.python.org/pep-0249/`
    """

    def __init__(self, client: Client):
        self.client = client
        self.arraysize = 1
        self.data: Optional[Sequence] = None
        self.names = []
        self.types = []
        self._rowcount = 0
        self._summary: List[Dict[str, str]] = []
        self._ix = 0

    def check_valid(self):
        if self.data is None:
            raise ProgrammingError('Cursor is not valid')

    @property
    def description(self):
        return [(n, t, None, None, None, None, True) for n, t in zip(self.names, self.types)]

    @property
    def rowcount(self):
        return self._rowcount

    @property
    def summary(self) -> List[Dict[str, str]]:
        return self._summary

    def close(self):
        self.data = None

    def execute(self, operation: str, parameters=None):
        query_result = self.client.query(operation, parameters)
        self.data = query_result.result_set
        self._rowcount = len(self.data)
        self._summary.append(query_result.summary)
        if query_result.column_names:
            self.names = query_result.column_names
            self.types = [x.name for x in query_result.column_types]
        elif self.data:
            self.names = [f'col_{x}' for x in range(len(self.data[0]))]
            self.types = [x.__class__ for x in self.data[0]]

    def _try_bulk_insert(self, operation: str, data):
        match = insert_re.match(remove_sql_comments(operation))
        if not match:
            return False
        temp = match.group(1)
        table_end = min(temp.find(' '), temp.find('('))
        table = temp[:table_end].strip()
        temp = temp[table_end:].strip()
        if temp[0] == '(':
            _, op_columns, temp = parse_callable(temp)
        else:
            op_columns = None
        if 'VALUES' not in temp.upper():
            return False
        col_names = list(data[0].keys())
        if op_columns and {unescape_identifier(x) for x in op_columns} != set(col_names):
            return False  # Data sent in doesn't match the columns in the insert statement
        data_values = [list(row.values()) for row in data]
        self.client.insert(table, data_values, col_names)
        self.data = []
        return True

    def executemany(self, operation, parameters):
        if not parameters or self._try_bulk_insert(operation, parameters):
            return
        self.data = []
        try:
            for param_row in parameters:
                query_result = self.client.query(operation, param_row)
                self.data.extend(query_result.result_set)
                if self.names or self.types:
                    if query_result.column_names != self.names:
                        logger.warning('Inconsistent column names %s : %s for operation %s in cursor executemany',
                                       self.names, query_result.column_names, operation)
                else:
                    self.names = query_result.column_names
                    self.types = query_result.column_types
                self._summary.append(query_result.summary)
        except TypeError as ex:
            raise ProgrammingError(f'Invalid parameters {parameters} passed to cursor executemany') from ex
        self._rowcount = len(self.data)

    def fetchall(self):
        self.check_valid()
        ret = self.data
        self._ix = self._rowcount
        return ret

    def fetchone(self):
        self.check_valid()
        if self._ix >= self._rowcount:
            return None
        val = self.data[self._ix]
        self._ix += 1
        return val

    def fetchmany(self, size: int = -1):
        self.check_valid()
        end = self._ix + max(size, self._rowcount - self._ix)
        ret = self.data[self._ix: end]
        self._ix = end
        return ret

    def nextset(self):
        raise NotImplementedError

    def callproc(self, *args, **kwargs):
        raise NotImplementedError
