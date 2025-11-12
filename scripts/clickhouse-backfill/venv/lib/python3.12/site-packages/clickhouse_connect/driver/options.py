from clickhouse_connect.driver.exceptions import NotSupportedError

pd_time_test = None
pd_extended_dtypes = False

try:
    import numpy as np
except ImportError:
    np = None

try:
    import pandas as pd
    pd_extended_dtypes = not pd.__version__.startswith('0')
    try:
        from pandas.core.dtypes.common import is_datetime64_dtype
        from pandas.core.dtypes.common import is_timedelta64_dtype

        def combined_test(arr_or_dtype):
            return is_datetime64_dtype(arr_or_dtype) or is_timedelta64_dtype(arr_or_dtype)

        pd_time_test = combined_test
    except ImportError:
        try:
            from pandas.core.dtypes.common import is_datetime_or_timedelta_dtype
            pd_time_test = is_datetime_or_timedelta_dtype
        except ImportError as ex:
            raise NotSupportedError('pandas version does not contain expected test for temporal types') from ex
except ImportError:
    pd = None

try:
    import pyarrow as arrow
except ImportError:
    arrow = None


def check_numpy():
    if np:
        return np
    raise NotSupportedError('Numpy package is not installed')


def check_pandas():
    if pd:
        return pd
    raise NotSupportedError('Pandas package is not installed')


def check_arrow():
    if arrow:
        return arrow
    raise NotSupportedError('PyArrow package is not installed')
