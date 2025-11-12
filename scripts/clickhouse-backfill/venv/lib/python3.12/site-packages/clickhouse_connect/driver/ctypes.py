import logging
import os

import clickhouse_connect.driver.dataconv as pydc
import clickhouse_connect.driver.npconv as pync
from clickhouse_connect.driver.buffer import ResponseBuffer
from clickhouse_connect.driver.common import coerce_bool

logger = logging.getLogger(__name__)

RespBuffCls = ResponseBuffer
data_conv = pydc
numpy_conv = pync


# pylint: disable=import-outside-toplevel,global-statement

def connect_c_modules():
    if not coerce_bool(os.environ.get('CLICKHOUSE_CONNECT_USE_C', True)):
        logger.info('ClickHouse Connect C optimizations disabled')
        return

    global RespBuffCls, data_conv
    try:
        from clickhouse_connect.driverc.buffer import ResponseBuffer as CResponseBuffer
        import clickhouse_connect.driverc.dataconv as cdc

        data_conv = cdc
        RespBuffCls = CResponseBuffer
        logger.debug('Successfully imported ClickHouse Connect C data optimizations')
        connect_numpy()
    except ImportError as ex:
        logger.warning('Unable to connect optimized C data functions [%s], falling back to pure Python',
                       str(ex))


def connect_numpy():
    global numpy_conv
    try:
        import clickhouse_connect.driverc.npconv as cnc

        numpy_conv = cnc
        logger.debug('Successfully import ClickHouse Connect C/Numpy optimizations')
    except ImportError as ex:
        logger.debug('Unable to connect ClickHouse Connect C to Numpy API [%s], falling back to pure Python',
             str(ex))


connect_c_modules()
