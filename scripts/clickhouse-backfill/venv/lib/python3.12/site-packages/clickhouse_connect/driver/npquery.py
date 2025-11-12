import logging
import itertools
from typing import Generator, Sequence, Tuple

from clickhouse_connect.driver.common import empty_gen, StreamContext
from clickhouse_connect.driver.exceptions import StreamClosedError
from clickhouse_connect.driver.types import Closable
from clickhouse_connect.driver.options import np, pd

logger = logging.getLogger(__name__)


# pylint: disable=too-many-instance-attributes
class NumpyResult(Closable):
    def __init__(self,
                 block_gen: Generator[Sequence, None, None] = None,
                 column_names: Tuple = (),
                 column_types: Tuple = (),
                 d_types: Sequence = (),
                 source: Closable = None):
        self.column_names = column_names
        self.column_types = column_types
        self.np_types = d_types
        self.source = source
        self.query_id = ''
        self.summary = {}
        self._block_gen = block_gen or empty_gen()
        self._numpy_result = None
        self._df_result = None

    def _np_stream(self) -> Generator:
        if self._block_gen is None:
            raise StreamClosedError

        block_gen = self._block_gen
        self._block_gen = None
        if not self.np_types:
            return block_gen

        d_types = self.np_types
        first_type = d_types[0]
        if first_type != np.object_ and all(np.dtype(np_type) == first_type for np_type in d_types):
            self.np_types = first_type

            def numpy_blocks():
                for block in block_gen:
                    yield np.array(block, first_type).transpose()
        else:
            if any(x == np.object_ for x in d_types):
                self.np_types = [np.object_] * len(self.np_types)
            self.np_types = np.dtype(list(zip(self.column_names, d_types)))

            def numpy_blocks():
                for block in block_gen:
                    np_array = np.empty(len(block[0]), dtype=self.np_types)
                    for col_name, data in zip(self.column_names, block):
                        np_array[col_name] = data
                    yield np_array

        return numpy_blocks()

    def _df_stream(self) -> Generator:
        if self._block_gen is None:
            raise StreamClosedError
        block_gen = self._block_gen

        def pd_blocks():
            for block in block_gen:
                yield pd.DataFrame(dict(zip(self.column_names, block)))

        self._block_gen = None
        return pd_blocks()

    def close_numpy(self):
        if not self._block_gen:
            raise StreamClosedError
        chunk_size = 4
        pieces = []
        blocks = []
        for block in self._np_stream():
            blocks.append(block)
            if len(blocks) == chunk_size:
                pieces.append(np.concatenate(blocks, dtype=self.np_types))
                chunk_size *= 2
                blocks = []
        pieces.extend(blocks)
        if len(pieces) > 1:
            self._numpy_result = np.concatenate(pieces, dtype=self.np_types)
        elif len(pieces) == 1:
            self._numpy_result = pieces[0]
        else:
            self._numpy_result = np.empty((0,))
        self.close()
        return self

    def close_df(self):
        if self._block_gen is None:
            raise StreamClosedError
        bg = self._block_gen
        chain = itertools.chain
        chains = [chain(b) for b in zip(*bg)]
        new_df_series = []
        for c in chains:
            series = [pd.Series(piece, copy=False) for piece in c if len(piece) > 0]
            if len(series) > 0:
                new_df_series.append(pd.concat(series, copy=False, ignore_index=True))
        self._df_result = pd.DataFrame(dict(zip(self.column_names, new_df_series)))
        self.close()
        return self

    @property
    def np_result(self):
        if self._numpy_result is None:
            self.close_numpy()
        return self._numpy_result

    @property
    def df_result(self):
        if self._df_result is None:
            self.close_df()
        return self._df_result

    @property
    def np_stream(self) -> StreamContext:
        return StreamContext(self, self._np_stream())

    @property
    def df_stream(self) -> StreamContext:
        return StreamContext(self, self._df_stream())

    def close(self):
        if self._block_gen is not None:
            self._block_gen.close()
            self._block_gen = None
        if self.source:
            self.source.close()
            self.source = None
