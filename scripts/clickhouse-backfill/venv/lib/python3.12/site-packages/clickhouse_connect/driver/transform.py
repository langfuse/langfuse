import logging
from typing import Union

from clickhouse_connect.datatypes import registry
from clickhouse_connect.driver.common import write_leb128
from clickhouse_connect.driver.exceptions import StreamCompleteException, StreamFailureError
from clickhouse_connect.driver.insert import InsertContext
from clickhouse_connect.driver.npquery import NumpyResult
from clickhouse_connect.driver.query import QueryResult, QueryContext
from clickhouse_connect.driver.types import ByteSource
from clickhouse_connect.driver.compression import get_compressor

_EMPTY_CTX = QueryContext()

logger = logging.getLogger(__name__)


class NativeTransform:
    # pylint: disable=too-many-locals
    @staticmethod
    def parse_response(source: ByteSource, context: QueryContext = _EMPTY_CTX) -> Union[NumpyResult, QueryResult]:
        names = []
        col_types = []
        block_num = 0

        def get_block():
            nonlocal block_num
            result_block = []
            try:
                try:
                    if context.block_info:
                        source.read_bytes(8)
                    num_cols = source.read_leb128()
                except StreamCompleteException:
                    return None
                num_rows = source.read_leb128()
                for col_num in range(num_cols):
                    name = source.read_leb128_str()
                    type_name = source.read_leb128_str()
                    if block_num == 0:
                        names.append(name)
                        col_type = registry.get_from_name(type_name)
                        col_types.append(col_type)
                    else:
                        col_type = col_types[col_num]
                    if num_rows == 0:
                        result_block.append(tuple())
                    else:
                        context.start_column(name)
                        column = col_type.read_column(source, num_rows, context)
                        result_block.append(column)
            except Exception as ex:
                source.close()
                if isinstance(ex, StreamCompleteException):
                    # We ran out of data before it was expected, this could be ClickHouse reporting an error
                    # in the response
                    message = source.last_message
                    if len(message) > 1024:
                        message = message[-1024:]
                    error_start = message.find('Code: ')
                    if error_start != -1:
                        message = message[error_start:]
                    raise StreamFailureError(message) from None
                raise
            block_num += 1
            return result_block

        first_block = get_block()
        if first_block is None:
            return NumpyResult() if context.use_numpy else QueryResult([])

        def gen():
            yield first_block
            while True:
                next_block = get_block()
                if next_block is None:
                    return
                yield next_block

        if context.use_numpy:
            res_types = [col.dtype if hasattr(col, 'dtype') else 'O' for col in first_block]
            return NumpyResult(gen(), tuple(names), tuple(col_types), res_types, source)
        return QueryResult(None, gen(), tuple(names), tuple(col_types), context.column_oriented, source)

    @staticmethod
    def build_insert(context: InsertContext):
        compressor = get_compressor(context.compression)

        def chunk_gen():
            for block in context.next_block():
                output = bytearray()
                output += block.prefix
                write_leb128(block.column_count, output)
                write_leb128(block.row_count, output)
                for col_name, col_type, data in zip(block.column_names, block.column_types, block.column_data):
                    col_enc = col_name.encode()
                    write_leb128(len(col_enc), output)
                    output += col_enc
                    col_enc = col_type.name.encode()
                    write_leb128(len(col_enc), output)
                    output += col_enc
                    context.start_column(col_name)
                    try:
                        col_type.write_column(data, output, context)
                    except Exception as ex:  # pylint: disable=broad-except
                        # This is hideous, but some low level serializations can fail while streaming
                        # the insert if the user has included bad data in the column.  We need to ensure that the
                        # insert fails (using garbage data) to avoid a partial insert, and use the context to
                        # propagate the correct exception to the user
                        logger.error('Error serializing column `%s` into data type `%s`',
                                     col_name, col_type.name, exc_info=True)
                        context.insert_exception = ex
                        yield 'INTERNAL EXCEPTION WHILE SERIALIZING'.encode()
                        return
                yield compressor.compress_block(output)
            footer = compressor.flush()
            if footer:
                yield footer

        return chunk_gen()
