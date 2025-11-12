import zlib
from abc import abstractmethod
from typing import Union

import lz4
import lz4.frame
import zstandard

try:
    import brotli
except ImportError:
    brotli = None


available_compression = ['lz4', 'zstd']

if brotli:
    available_compression.append('br')
available_compression.extend(['gzip', 'deflate'])

comp_map = {}


class Compressor:
    def __init_subclass__(cls, tag: str, thread_safe: bool = True):
        comp_map[tag] = cls() if thread_safe else cls

    @abstractmethod
    def compress_block(self, block) -> Union[bytes, bytearray]:
        return block

    def flush(self):
        pass


class GzipCompressor(Compressor, tag='gzip', thread_safe=False):
    def __init__(self, level: int = 6, wbits: int = 31):
        self.zlib_obj = zlib.compressobj(level=level, wbits=wbits)

    def compress_block(self, block):
        return self.zlib_obj.compress(block)

    def flush(self):
        return self.zlib_obj.flush()


class Lz4Compressor(Compressor, tag='lz4', thread_safe=False):
    def __init__(self):
        self.comp = lz4.frame.LZ4FrameCompressor()

    def compress_block(self, block):
        output = self.comp.begin(len(block))
        output += self.comp.compress(block)
        return output + self.comp.flush()


class ZstdCompressor(Compressor, tag='zstd'):
    def compress_block(self, block):
        return zstandard.compress(block)


class BrotliCompressor(Compressor, tag='br'):
    def compress_block(self, block):
        return brotli.compress(block)


null_compressor = Compressor()


def get_compressor(compression: str) -> Compressor:
    if not compression:
        return null_compressor
    comp = comp_map[compression]
    try:
        return comp()
    except TypeError:
        return comp
