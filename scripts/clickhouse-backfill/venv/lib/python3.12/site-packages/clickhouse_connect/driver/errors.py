from clickhouse_connect.driver.exceptions import DataError


#  Error codes used in the Cython API
NO_ERROR = 0
NONE_IN_NULLABLE_COLUMN = 1

error_messages = {NONE_IN_NULLABLE_COLUMN: 'Invalid None value in non-Nullable column'}


def handle_error(error_num: int):
    if error_num > 0:
        raise DataError(error_messages[error_num])
