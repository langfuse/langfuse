use crate::{cursors::RawCursor, error::Result, response::Response};
use bytes::{Buf, Bytes, BytesMut};
use std::{
    io::Result as IoResult,
    pin::Pin,
    task::{Context, Poll, ready},
};
use tokio::io::{AsyncBufRead, AsyncRead, ReadBuf};

/// A cursor over raw bytes of the response returned by [`Query::fetch_bytes`].
///
/// Unlike [`RowCursor`] which emits rows deserialized as structures from
/// RowBinary, this cursor emits raw bytes without deserialization.
///
/// # Integration
///
/// Additionally to [`BytesCursor::next`] and [`BytesCursor::collect`],
/// this cursor implements:
/// * [`AsyncRead`] and [`AsyncBufRead`] for `tokio`-based ecosystem.
/// * [`futures_util::Stream`], [`futures_util::AsyncRead`] and
///   [`futures_util::AsyncBufRead`] for `futures`-based ecosystem.
///   (requires the `futures03` feature)
///
/// For instance, if the requested format emits each row on a newline
/// (e.g. `JSONEachRow`, `CSV`, `TSV`, etc.), the cursor can be read line by
/// line using `AsyncBufReadExt::lines`. Note that this method
/// produces a new `String` for each line, so it's not the most performant way
/// to iterate.
///
/// Note: methods of these traits use [`std::io::Error`] for errors.
/// To get an original error from this crate, use `From` conversion.
///
/// [`RowCursor`]: crate::query::RowCursor
/// [`Query::fetch_bytes`]: crate::query::Query::fetch_bytes
pub struct BytesCursor {
    raw: RawCursor,
    bytes: Bytes,
}

// TODO: what if any next/poll_* called AFTER error returned?

impl BytesCursor {
    pub(crate) fn new(response: Response) -> Self {
        Self {
            raw: RawCursor::new(response),
            bytes: Bytes::default(),
        }
    }

    /// Emits the next bytes chunk.
    ///
    /// # Cancel safety
    ///
    /// This method is cancellation safe.
    pub async fn next(&mut self) -> Result<Option<Bytes>> {
        assert!(
            self.bytes.is_empty(),
            "mixing `BytesCursor::next()` and `AsyncRead` API methods is not allowed"
        );

        self.raw.next().await
    }

    /// Collects the whole response into a single [`Bytes`].
    ///
    /// # Cancel safety
    ///
    /// This method is NOT cancellation safe.
    /// If cancelled, already collected bytes are lost.
    pub async fn collect(&mut self) -> Result<Bytes> {
        let mut chunks = Vec::new();
        let mut total_len = 0;

        while let Some(chunk) = self.next().await? {
            total_len += chunk.len();
            chunks.push(chunk);
        }

        // The whole response is in a single chunk.
        if chunks.len() == 1 {
            return Ok(chunks.pop().unwrap());
        }

        let mut collected = BytesMut::with_capacity(total_len);
        for chunk in chunks {
            collected.extend_from_slice(&chunk);
        }
        debug_assert_eq!(collected.capacity(), total_len);

        Ok(collected.freeze())
    }

    #[cold]
    fn poll_refill(&mut self, cx: &mut Context<'_>) -> Poll<IoResult<bool>> {
        debug_assert_eq!(self.bytes.len(), 0);

        // Theoretically, `self.raw.poll_next(cx)` can return empty chunks.
        // In this case, we should continue polling until we get a non-empty chunk or
        // end of stream in order to avoid false positive `Ok(0)` in I/O traits.
        while self.bytes.is_empty() {
            match ready!(self.raw.poll_next(cx)?) {
                Some(chunk) => self.bytes = chunk,
                None => return Poll::Ready(Ok(false)),
            }
        }

        Poll::Ready(Ok(true))
    }

    /// Returns the total size in bytes received from the CH server since
    /// the cursor was created.
    ///
    /// This method counts only size without HTTP headers for now.
    /// It can be changed in the future without notice.
    #[inline]
    pub fn received_bytes(&self) -> u64 {
        self.raw.received_bytes()
    }

    /// Returns the total size in bytes decompressed since the cursor was
    /// created.
    #[inline]
    pub fn decoded_bytes(&self) -> u64 {
        self.raw.decoded_bytes()
    }
}

impl AsyncRead for BytesCursor {
    #[inline]
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<IoResult<()>> {
        while buf.remaining() > 0 {
            if self.bytes.is_empty() && !ready!(self.poll_refill(cx)?) {
                break;
            }

            let len = self.bytes.len().min(buf.remaining());
            let bytes = self.bytes.slice(..len);
            buf.put_slice(&bytes[0..len]);
            self.bytes.advance(len);
        }

        Poll::Ready(Ok(()))
    }
}

impl AsyncBufRead for BytesCursor {
    #[inline]
    fn poll_fill_buf(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<IoResult<&[u8]>> {
        if self.bytes.is_empty() {
            ready!(self.poll_refill(cx)?);
        }

        Poll::Ready(Ok(&self.get_mut().bytes))
    }

    #[inline]
    fn consume(mut self: Pin<&mut Self>, amt: usize) {
        assert!(
            amt <= self.bytes.len(),
            "invalid `AsyncBufRead::consume` usage"
        );
        self.bytes.advance(amt);
    }
}

#[cfg(feature = "futures03")]
impl futures_util::AsyncRead for BytesCursor {
    #[inline]
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut [u8],
    ) -> Poll<IoResult<usize>> {
        let mut buf = ReadBuf::new(buf);
        ready!(AsyncRead::poll_read(self, cx, &mut buf)?);
        Poll::Ready(Ok(buf.filled().len()))
    }
}

#[cfg(feature = "futures03")]
impl futures_util::AsyncBufRead for BytesCursor {
    #[inline]
    fn poll_fill_buf(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<IoResult<&[u8]>> {
        AsyncBufRead::poll_fill_buf(self, cx)
    }

    #[inline]
    fn consume(self: Pin<&mut Self>, amt: usize) {
        AsyncBufRead::consume(self, amt);
    }
}

#[cfg(feature = "futures03")]
impl futures_util::stream::Stream for BytesCursor {
    type Item = crate::error::Result<bytes::Bytes>;

    #[inline]
    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        assert!(
            self.bytes.is_empty(),
            "mixing `Stream` and `AsyncRead` API methods is not allowed"
        );

        self.raw.poll_next(cx).map(Result::transpose)
    }
}

#[cfg(feature = "futures03")]
impl futures_util::stream::FusedStream for BytesCursor {
    #[inline]
    fn is_terminated(&self) -> bool {
        self.bytes.is_empty() && self.raw.is_terminated()
    }
}
