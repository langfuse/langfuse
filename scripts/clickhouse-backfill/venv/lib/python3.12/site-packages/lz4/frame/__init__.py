import lz4
import io
import os
import builtins
import sys
from ._frame import (  # noqa: F401
    compress,
    decompress,
    create_compression_context,
    compress_begin,
    compress_chunk,
    compress_flush,
    create_decompression_context,
    reset_decompression_context,
    decompress_chunk,
    get_frame_info,
    BLOCKSIZE_DEFAULT as _BLOCKSIZE_DEFAULT,
    BLOCKSIZE_MAX64KB as _BLOCKSIZE_MAX64KB,
    BLOCKSIZE_MAX256KB as _BLOCKSIZE_MAX256KB,
    BLOCKSIZE_MAX1MB as _BLOCKSIZE_MAX1MB,
    BLOCKSIZE_MAX4MB as _BLOCKSIZE_MAX4MB,
    __doc__ as _doc
)

__doc__ = _doc

try:
    import compression._common._streams as _compression  # Python 3.14
except ImportError:
    import _compression   # Python 3.9 - 3.13


BLOCKSIZE_DEFAULT = _BLOCKSIZE_DEFAULT
"""Specifier for the default block size.

Specifying ``block_size=lz4.frame.BLOCKSIZE_DEFAULT`` will instruct the LZ4
library to use the default maximum blocksize. This is currently equivalent to
`lz4.frame.BLOCKSIZE_MAX64KB`

"""

BLOCKSIZE_MAX64KB = _BLOCKSIZE_MAX64KB
"""Specifier for a maximum block size of 64 kB.

Specifying ``block_size=lz4.frame.BLOCKSIZE_MAX64KB`` will instruct the LZ4
library to create blocks containing a maximum of 64 kB of uncompressed data.

"""

BLOCKSIZE_MAX256KB = _BLOCKSIZE_MAX256KB
"""Specifier for a maximum block size of 256 kB.

Specifying ``block_size=lz4.frame.BLOCKSIZE_MAX256KB`` will instruct the LZ4
library to create blocks containing a maximum of 256 kB of uncompressed data.

"""

BLOCKSIZE_MAX1MB = _BLOCKSIZE_MAX1MB
"""Specifier for a maximum block size of 1 MB.

Specifying ``block_size=lz4.frame.BLOCKSIZE_MAX1MB`` will instruct the LZ4
library to create blocks containing a maximum of 1 MB of uncompressed data.

"""

BLOCKSIZE_MAX4MB = _BLOCKSIZE_MAX4MB
"""Specifier for a maximum block size of 4 MB.

Specifying ``block_size=lz4.frame.BLOCKSIZE_MAX4MB`` will instruct the LZ4
library to create blocks containing a maximum of 4 MB of uncompressed data.

"""

COMPRESSIONLEVEL_MIN = 0
"""Specifier for the minimum compression level.

Specifying ``compression_level=lz4.frame.COMPRESSIONLEVEL_MIN`` will
instruct the LZ4 library to use a compression level of 0

"""

COMPRESSIONLEVEL_MINHC = 3
"""Specifier for the minimum compression level for high compression mode.

Specifying ``compression_level=lz4.frame.COMPRESSIONLEVEL_MINHC`` will
instruct the LZ4 library to use a compression level of 3, the minimum for the
high compression mode.

"""

COMPRESSIONLEVEL_MAX = 16
"""Specifier for the maximum compression level.

Specifying ``compression_level=lz4.frame.COMPRESSIONLEVEL_MAX`` will
instruct the LZ4 library to use a compression level of 16, the highest
compression level available.

"""


class LZ4FrameCompressor(object):
    """Create a LZ4 frame compressor object.

    This object can be used to compress data incrementally.

    Args:
        block_size (int): Specifies the maximum blocksize to use.
            Options:

            - `lz4.frame.BLOCKSIZE_DEFAULT`: the lz4 library default
            - `lz4.frame.BLOCKSIZE_MAX64KB`: 64 kB
            - `lz4.frame.BLOCKSIZE_MAX256KB`: 256 kB
            - `lz4.frame.BLOCKSIZE_MAX1MB`: 1 MB
            - `lz4.frame.BLOCKSIZE_MAX4MB`: 4 MB

            If unspecified, will default to `lz4.frame.BLOCKSIZE_DEFAULT` which
            is equal to `lz4.frame.BLOCKSIZE_MAX64KB`.
        block_linked (bool): Specifies whether to use block-linked
            compression. If ``True``, the compression ratio is improved,
            especially for small block sizes. If ``False`` the blocks are
            compressed independently. The default is ``True``.
        compression_level (int): Specifies the level of compression used.
            Values between 0-16 are valid, with 0 (default) being the
            lowest compression (0-2 are the same value), and 16 the highest.
            Values above 16 will be treated as 16.
            Values between 4-9 are recommended. 0 is the default.
            The following module constants are provided as a convenience:

            - `lz4.frame.COMPRESSIONLEVEL_MIN`: Minimum compression (0)
            - `lz4.frame.COMPRESSIONLEVEL_MINHC`: Minimum high-compression (3)
            - `lz4.frame.COMPRESSIONLEVEL_MAX`: Maximum compression (16)

        content_checksum (bool): Specifies whether to enable checksumming of
            the payload content. If ``True``, a checksum of the uncompressed
            data is stored at the end of the compressed frame which is checked
            during decompression. The default is ``False``.
        block_checksum (bool): Specifies whether to enable checksumming of
            the content of each block. If ``True`` a checksum of the
            uncompressed data in each block in the frame is stored at the end
            of each block. If present, these checksums will be used to
            validate the data during decompression. The default is ``False``,
            meaning block checksums are not calculated and stored. This
            functionality is only supported if the underlying LZ4 library has
            version >= 1.8.0. Attempting to set this value to ``True`` with a
            version of LZ4 < 1.8.0 will cause a ``RuntimeError`` to be raised.
        auto_flush (bool): When ``False``, the LZ4 library may buffer data
            until a block is full. When ``True`` no buffering occurs, and
            partially full blocks may be returned. The default is ``False``.
        return_bytearray (bool): When ``False`` a ``bytes`` object is returned
            from the calls to methods of this class. When ``True`` a
            ``bytearray`` object will be returned. The default is ``False``.

    """

    def __init__(self,
                 block_size=BLOCKSIZE_DEFAULT,
                 block_linked=True,
                 compression_level=COMPRESSIONLEVEL_MIN,
                 content_checksum=False,
                 block_checksum=False,
                 auto_flush=False,
                 return_bytearray=False):
        self.block_size = block_size
        self.block_linked = block_linked
        self.compression_level = compression_level
        self.content_checksum = content_checksum
        if block_checksum and lz4.library_version_number() < 10800:
            raise RuntimeError(
                'Attempt to set block_checksum to True with LZ4 library'
                'version < 10800'
            )
        self.block_checksum = block_checksum
        self.auto_flush = auto_flush
        self.return_bytearray = return_bytearray
        self._context = None
        self._started = False

    def __enter__(self):
        # All necessary initialization is done in __init__
        return self

    def __exit__(self, exception_type, exception, traceback):
        self.block_size = None
        self.block_linked = None
        self.compression_level = None
        self.content_checksum = None
        self.block_checksum = None
        self.auto_flush = None
        self.return_bytearray = None
        self._context = None
        self._started = False

    def begin(self, source_size=0):
        """Begin a compression frame.

        The returned data contains frame header information. The data returned
        from subsequent calls to ``compress()`` should be concatenated with
        this header.

        Keyword Args:
            source_size (int): Optionally specify the total size of the
                uncompressed data. If specified, will be stored in the
                compressed frame header as an 8-byte field for later use
                during decompression. Default is 0 (no size stored).

        Returns:
            bytes or bytearray: frame header data

        """

        if self._started is False:
            self._context = create_compression_context()
            result = compress_begin(
                self._context,
                block_size=self.block_size,
                block_linked=self.block_linked,
                compression_level=self.compression_level,
                content_checksum=self.content_checksum,
                block_checksum=self.block_checksum,
                auto_flush=self.auto_flush,
                return_bytearray=self.return_bytearray,
                source_size=source_size,
            )
            self._started = True
            return result
        else:
            raise RuntimeError(
                "LZ4FrameCompressor.begin() called after already initialized"
            )

    def compress(self, data):  # noqa: F811
        """Compresses data and returns it.

        This compresses ``data`` (a ``bytes`` object), returning a bytes or
        bytearray object containing compressed data the input.

        If ``auto_flush`` has been set to ``False``, some of ``data`` may be
        buffered internally, for use in later calls to
        `LZ4FrameCompressor.compress()` and `LZ4FrameCompressor.flush()`.

        The returned data should be concatenated with the output of any
        previous calls to `compress()` and a single call to
        `compress_begin()`.

        Args:
            data (str, bytes or buffer-compatible object): data to compress

        Returns:
            bytes or bytearray: compressed data

        """
        if self._context is None:
            raise RuntimeError('compress called after flush()')

        if self._started is False:
            raise RuntimeError('compress called before compress_begin()')

        result = compress_chunk(
            self._context, data,
            return_bytearray=self.return_bytearray
        )

        return result

    def flush(self):
        """Finish the compression process.

        This returns a ``bytes`` or ``bytearray`` object containing any data
        stored in the compressor's internal buffers and a frame footer.

        The LZ4FrameCompressor instance may be reused after this method has
        been called to create a new frame of compressed data.

        Returns:
            bytes or bytearray: compressed data and frame footer.

        """
        result = compress_flush(
            self._context,
            end_frame=True,
            return_bytearray=self.return_bytearray
        )
        self._context = None
        self._started = False
        return result

    def reset(self):
        """Reset the `LZ4FrameCompressor` instance.

        This allows the `LZ4FrameCompression` instance to be reused after an
        error.

        """
        self._context = None
        self._started = False

    def has_context(self):
        """Return whether the compression context exists.

        Returns:
            bool: ``True`` if the compression context exists, ``False``
                otherwise.
        """
        return self._context is not None

    def started(self):
        """Return whether the compression frame has been started.

        Returns:
            bool: ``True`` if the compression frame has been started, ``False``
                otherwise.
        """
        return self._started


class LZ4FrameDecompressor(object):
    """Create a LZ4 frame decompressor object.

    This can be used to decompress data incrementally.

    For a more convenient way of decompressing an entire compressed frame at
    once, see `lz4.frame.decompress()`.

    Args:
        return_bytearray (bool): When ``False`` a bytes object is returned from
            the calls to methods of this class. When ``True`` a bytearray
            object will be returned. The default is ``False``.

    Attributes:
        eof (bool): ``True`` if the end-of-stream marker has been reached.
            ``False`` otherwise.
        unused_data (bytes): Data found after the end of the compressed stream.
            Before the end of the frame is reached, this will be ``b''``.
        needs_input (bool): ``False`` if the ``decompress()`` method can
            provide more decompressed data before requiring new uncompressed
            input. ``True`` otherwise.

    """

    def __init__(self, return_bytearray=False):
        self._context = create_decompression_context()
        self.eof = False
        self.needs_input = True
        self.unused_data = None
        self._unconsumed_data = b''
        self._return_bytearray = return_bytearray

    def __enter__(self):
        # All necessary initialization is done in __init__
        return self

    def __exit__(self, exception_type, exception, traceback):
        self._context = None
        self.eof = None
        self.needs_input = None
        self.unused_data = None
        self._unconsumed_data = None
        self._return_bytearray = None

    def reset(self):
        """Reset the decompressor state.

        This is useful after an error occurs, allowing reuse of the instance.

        """
        reset_decompression_context(self._context)
        self.eof = False
        self.needs_input = True
        self.unused_data = None
        self._unconsumed_data = b''

    def decompress(self, data, max_length=-1):  # noqa: F811
        """Decompresses part or all of an LZ4 frame of compressed data.

        The returned data should be concatenated with the output of any
        previous calls to `decompress()`.

        If ``max_length`` is non-negative, returns at most ``max_length`` bytes
        of decompressed data. If this limit is reached and further output can
        be produced, the `needs_input` attribute will be set to ``False``. In
        this case, the next call to `decompress()` may provide data as
        ``b''`` to obtain more of the output. In all cases, any unconsumed data
        from previous calls will be prepended to the input data.

        If all of the input ``data`` was decompressed and returned (either
        because this was less than ``max_length`` bytes, or because
        ``max_length`` was negative), the `needs_input` attribute will be set
        to ``True``.

        If an end of frame marker is encountered in the data during
        decompression, decompression will stop at the end of the frame, and any
        data after the end of frame is available from the `unused_data`
        attribute. In this case, the `LZ4FrameDecompressor` instance is reset
        and can be used for further decompression.

        Args:
            data (str, bytes or buffer-compatible object): compressed data to
                decompress

        Keyword Args:
            max_length (int): If this is non-negative, this method returns at
                most ``max_length`` bytes of decompressed data.

        Returns:
            bytes: Uncompressed data

        """
        if not isinstance(data, (bytes, bytearray)):
            data = memoryview(data).tobytes()

        if self._unconsumed_data:
            data = self._unconsumed_data + data

        decompressed, bytes_read, eoframe = decompress_chunk(
            self._context,
            data,
            max_length=max_length,
            return_bytearray=self._return_bytearray,
        )

        if bytes_read < len(data):
            if eoframe:
                self.unused_data = data[bytes_read:]
            else:
                self._unconsumed_data = data[bytes_read:]
                self.needs_input = False
        else:
            self._unconsumed_data = b''
            self.needs_input = True
            self.unused_data = None

        self.eof = eoframe

        return decompressed


_MODE_CLOSED = 0
_MODE_READ = 1
# Value 2 no longer used
_MODE_WRITE = 3


class LZ4FrameFile(_compression.BaseStream):
    """A file object providing transparent LZ4F (de)compression.

    An LZ4FFile can act as a wrapper for an existing file object, or refer
    directly to a named file on disk.

    Note that LZ4FFile provides a *binary* file interface - data read is
    returned as bytes, and data to be written must be given as bytes.

    When opening a file for writing, the settings used by the compressor can be
    specified. The underlying compressor object is
    `lz4.frame.LZ4FrameCompressor`. See the docstrings for that class for
    details on compression options.

    Args:
        filename(str, bytes, PathLike, file object): can be either an actual
            file name (given as a str, bytes, or
            PathLike object), in which case the named file is opened, or it
            can be an existing file object to read from or write to.

    Keyword Args:
        mode(str): mode can be ``'r'`` for reading (default), ``'w'`` for
            (over)writing, ``'x'`` for creating exclusively, or ``'a'``
            for appending. These can equivalently be given as ``'rb'``,
            ``'wb'``, ``'xb'`` and ``'ab'`` respectively.
        return_bytearray (bool): When ``False`` a bytes object is returned from
            the calls to methods of this class. When ``True`` a ``bytearray``
            object will be returned. The default is ``False``.
        source_size (int): Optionally specify the total size of the
            uncompressed data. If specified, will be stored in the compressed
            frame header as an 8-byte field for later use during decompression.
            Default is ``0`` (no size stored). Only used for writing
            compressed files.
        block_size (int): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.
        block_linked (bool): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.
        compression_level (int): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.
        content_checksum (bool): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.
        block_checksum (bool): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.
        auto_flush (bool): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.

    """

    def __init__(self, filename=None, mode='r',
                 block_size=BLOCKSIZE_DEFAULT,
                 block_linked=True,
                 compression_level=COMPRESSIONLEVEL_MIN,
                 content_checksum=False,
                 block_checksum=False,
                 auto_flush=False,
                 return_bytearray=False,
                 source_size=0):

        self._fp = None
        self._closefp = False
        self._mode = _MODE_CLOSED

        if mode in ('r', 'rb'):
            mode_code = _MODE_READ
        elif mode in ('w', 'wb', 'a', 'ab', 'x', 'xb'):
            mode_code = _MODE_WRITE
            self._compressor = LZ4FrameCompressor(
                block_size=block_size,
                block_linked=block_linked,
                compression_level=compression_level,
                content_checksum=content_checksum,
                block_checksum=block_checksum,
                auto_flush=auto_flush,
                return_bytearray=return_bytearray,
            )
            self._pos = 0
        else:
            raise ValueError('Invalid mode: {!r}'.format(mode))

        if sys.version_info > (3, 6):
            path_test = isinstance(filename, (str, bytes, os.PathLike))
        else:
            path_test = isinstance(filename, (str, bytes))

        if path_test is True:
            if 'b' not in mode:
                mode += 'b'
            self._fp = builtins.open(filename, mode)
            self._closefp = True
            self._mode = mode_code
        elif hasattr(filename, 'read') or hasattr(filename, 'write'):
            self._fp = filename
            self._mode = mode_code
        else:
            raise TypeError(
                'filename must be a str, bytes, file or PathLike object'
            )

        if self._mode == _MODE_READ:
            raw = _compression.DecompressReader(self._fp, LZ4FrameDecompressor)
            self._buffer = io.BufferedReader(raw)

        if self._mode == _MODE_WRITE:
            self._source_size = source_size
            self._fp.write(self._compressor.begin(source_size=source_size))

    def close(self):
        """Flush and close the file.

        May be called more than once without error. Once the file is
        closed, any other operation on it will raise a ValueError.
        """
        if self._mode == _MODE_CLOSED:
            return
        try:
            if self._mode == _MODE_READ:
                self._buffer.close()
                self._buffer = None
            elif self._mode == _MODE_WRITE:
                self.flush()
                self._compressor = None
        finally:
            try:
                if self._closefp:
                    self._fp.close()
            finally:
                self._fp = None
                self._closefp = False
                self._mode = _MODE_CLOSED

    @property
    def closed(self):
        """Returns ``True`` if this file is closed.

        Returns:
            bool: ``True`` if the file is closed, ``False`` otherwise.

        """
        return self._mode == _MODE_CLOSED

    def fileno(self):
        """Return the file descriptor for the underlying file.

        Returns:
            file object: file descriptor for file.

        """
        self._check_not_closed()
        return self._fp.fileno()

    def seekable(self):
        """Return whether the file supports seeking.

        Returns:
            bool: ``True`` if the file supports seeking, ``False`` otherwise.

        """
        return self.readable() and self._buffer.seekable()

    def readable(self):
        """Return whether the file was opened for reading.

        Returns:
            bool: ``True`` if the file was opened for reading, ``False``
                otherwise.

        """
        self._check_not_closed()
        return self._mode == _MODE_READ

    def writable(self):
        """Return whether the file was opened for writing.

        Returns:
            bool: ``True`` if the file was opened for writing, ``False``
                otherwise.

        """
        self._check_not_closed()
        return self._mode == _MODE_WRITE

    def peek(self, size=-1):
        """Return buffered data without advancing the file position.

        Always returns at least one byte of data, unless at EOF. The exact
        number of bytes returned is unspecified.

        Returns:
            bytes: uncompressed data

        """
        self._check_can_read()
        # Relies on the undocumented fact that BufferedReader.peek() always
        # returns at least one byte (except at EOF)
        return self._buffer.peek(size)

    def readall(self):
        chunks = bytearray()

        while True:
            data = self.read(io.DEFAULT_BUFFER_SIZE)
            chunks += data
            if not data:
                break

        return bytes(chunks)

    def read(self, size=-1):
        """Read up to ``size`` uncompressed bytes from the file.

        If ``size`` is negative or omitted, read until ``EOF`` is reached.
        Returns ``b''`` if the file is already at ``EOF``.

        Args:
            size(int): If non-negative, specifies the maximum number of
                uncompressed bytes to return.

        Returns:
            bytes: uncompressed data

        """
        self._check_can_read()

        if size < 0 and sys.version_info >= (3, 10):
            return self.readall()
        return self._buffer.read(size)

    def read1(self, size=-1):
        """Read up to ``size`` uncompressed bytes.

        This method tries to avoid making multiple reads from the underlying
        stream.

        This method reads up to a buffer's worth of data if ``size`` is
        negative.

        Returns ``b''`` if the file is at EOF.

        Args:
            size(int): If non-negative, specifies the maximum number of
                uncompressed bytes to return.

        Returns:
            bytes: uncompressed data

        """
        self._check_can_read()
        if size < 0:
            size = io.DEFAULT_BUFFER_SIZE
        return self._buffer.read1(size)

    def readline(self, size=-1):
        """Read a line of uncompressed bytes from the file.

        The terminating newline (if present) is retained. If size is
        non-negative, no more than size bytes will be read (in which case the
        line may be incomplete). Returns b'' if already at EOF.

        Args:
            size(int): If non-negative, specifies the maximum number of
                uncompressed bytes to return.

        Returns:
            bytes: uncompressed data

        """
        self._check_can_read()
        return self._buffer.readline(size)

    def write(self, data):
        """Write a bytes object to the file.

        Returns the number of uncompressed bytes written, which is
        always the length of data in bytes. Note that due to buffering,
        the file on disk may not reflect the data written until close()
        is called.

        Args:
            data(bytes): uncompressed data to compress and write to the file

        Returns:
            int: the number of uncompressed bytes written to the file

        """
        if isinstance(data, (bytes, bytearray)):
            length = len(data)
        else:
            # accept any data that supports the buffer protocol
            data = memoryview(data)
            length = data.nbytes

        self._check_can_write()

        if not self._compressor.started():
            header = self._compressor.begin(source_size=self._source_size)
            self._fp.write(header)

        compressed = self._compressor.compress(data)
        self._fp.write(compressed)
        self._pos += length
        return length

    def flush(self):
        """Flush the file, keeping it open.

        May be called more than once without error. The file may continue
        to be used normally after flushing.
        """
        if self.writable() and self._compressor.has_context():
            self._fp.write(self._compressor.flush())
        self._fp.flush()

    def seek(self, offset, whence=io.SEEK_SET):
        """Change the file position.

        The new position is specified by ``offset``, relative to the position
        indicated by ``whence``. Possible values for ``whence`` are:

        - ``io.SEEK_SET`` or 0: start of stream (default): offset must not be
          negative
        - ``io.SEEK_CUR`` or 1: current stream position
        - ``io.SEEK_END`` or 2: end of stream; offset must not be positive

        Returns the new file position.

        Note that seeking is emulated, so depending on the parameters, this
        operation may be extremely slow.

        Args:
            offset(int): new position in the file
            whence(int): position with which ``offset`` is measured. Allowed
                values are 0, 1, 2. The default is 0 (start of stream).

        Returns:
            int: new file position

        """
        self._check_can_seek()
        return self._buffer.seek(offset, whence)

    def tell(self):
        """Return the current file position.

        Args:
            None

        Returns:
            int: file position

        """
        self._check_not_closed()
        if self._mode == _MODE_READ:
            return self._buffer.tell()
        return self._pos


def open(filename, mode="rb",
         encoding=None,
         errors=None,
         newline=None,
         block_size=BLOCKSIZE_DEFAULT,
         block_linked=True,
         compression_level=COMPRESSIONLEVEL_MIN,
         content_checksum=False,
         block_checksum=False,
         auto_flush=False,
         return_bytearray=False,
         source_size=0):
    """Open an LZ4Frame-compressed file in binary or text mode.

    ``filename`` can be either an actual file name (given as a str, bytes, or
    PathLike object), in which case the named file is opened, or it can be an
    existing file object to read from or write to.

    The ``mode`` argument can be ``'r'``, ``'rb'`` (default), ``'w'``,
    ``'wb'``, ``'x'``, ``'xb'``, ``'a'``, or ``'ab'`` for binary mode, or
    ``'rt'``, ``'wt'``, ``'xt'``, or ``'at'`` for text mode.

    For binary mode, this function is equivalent to the `LZ4FrameFile`
    constructor: `LZ4FrameFile(filename, mode, ...)`.

    For text mode, an `LZ4FrameFile` object is created, and wrapped in an
    ``io.TextIOWrapper`` instance with the specified encoding, error handling
    behavior, and line ending(s).

    Args:
        filename (str, bytes, os.PathLike): file name or file object to open

    Keyword Args:
        mode (str): mode for opening the file
        encoding (str): the name of the encoding that will be used for
            encoding/deconging the stream. It defaults to
            ``locale.getpreferredencoding(False)``. See ``io.TextIOWrapper``
            for further details.
        errors (str): specifies how encoding and decoding errors are to be
            handled. See ``io.TextIOWrapper`` for further details.
        newline (str): controls how line endings are handled. See
            ``io.TextIOWrapper`` for further details.
        return_bytearray (bool): When ``False`` a bytes object is returned
            from the calls to methods of this class. When ``True`` a bytearray
            object will be returned. The default is ``False``.
        source_size (int): Optionally specify the total size of the
            uncompressed data. If specified, will be stored in the compressed
            frame header as an 8-byte field for later use during decompression.
            Default is 0 (no size stored). Only used for writing compressed
            files.
        block_size (int): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.
        block_linked (bool): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.
        compression_level (int): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.
        content_checksum (bool): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.
        block_checksum (bool): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.
        auto_flush (bool): Compressor setting. See
            `lz4.frame.LZ4FrameCompressor`.

    """
    if 't' in mode:
        if 'b' in mode:
            raise ValueError('Invalid mode: %r' % (mode,))
    else:
        if encoding is not None:
            raise ValueError(
                "Argument 'encoding' not supported in binary mode"
            )
        if errors is not None:
            raise ValueError("Argument 'errors' not supported in binary mode")
        if newline is not None:
            raise ValueError("Argument 'newline' not supported in binary mode")

    _mode = mode.replace('t', '')

    binary_file = LZ4FrameFile(
        filename,
        mode=_mode,
        block_size=block_size,
        block_linked=block_linked,
        compression_level=compression_level,
        content_checksum=content_checksum,
        block_checksum=block_checksum,
        auto_flush=auto_flush,
        return_bytearray=return_bytearray,
        source_size=source_size,
    )

    if 't' in mode:
        return io.TextIOWrapper(binary_file, encoding, errors, newline)
    else:
        return binary_file
