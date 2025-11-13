use crate::{
    error::Result,
    response::{Chunks, Response, ResponseFuture},
};
use bytes::Bytes;
use futures_util::Stream;
use std::{
    pin::pin,
    task::{Context, Poll, ready},
};

/// A cursor over raw bytes of a query response.
/// All other cursors are built on top of this one.
pub(crate) struct RawCursor(RawCursorState);

enum RawCursorState {
    Waiting(ResponseFuture),
    Loading(RawCursorLoading),
}

struct RawCursorLoading {
    chunks: Chunks,
    net_size: u64,
    data_size: u64,
}

impl RawCursor {
    pub(crate) fn new(response: Response) -> Self {
        Self(RawCursorState::Waiting(response.into_future()))
    }

    pub(crate) async fn next(&mut self) -> Result<Option<Bytes>> {
        std::future::poll_fn(|cx| self.poll_next(cx)).await
    }

    pub(crate) fn poll_next(&mut self, cx: &mut Context<'_>) -> Poll<Result<Option<Bytes>>> {
        if let RawCursorState::Loading(state) = &mut self.0 {
            let chunks = pin!(&mut state.chunks);

            Poll::Ready(match ready!(chunks.poll_next(cx)?) {
                Some(chunk) => {
                    state.net_size += chunk.net_size as u64;
                    state.data_size += chunk.data.len() as u64;
                    Ok(Some(chunk.data))
                }
                None => Ok(None),
            })
        } else {
            ready!(self.poll_resolve(cx)?);
            self.poll_next(cx)
        }
    }

    #[cold]
    #[inline(never)]
    fn poll_resolve(&mut self, cx: &mut Context<'_>) -> Poll<Result<()>> {
        let RawCursorState::Waiting(future) = &mut self.0 else {
            panic!("poll_resolve called in invalid state");
        };

        // Poll the future, but don't return the result yet.
        // In case of an error, we should replace the current state anyway
        // in order to provide proper fused behavior of the cursor.
        let res = ready!(future.as_mut().poll(cx));
        let mut chunks = Chunks::empty();
        let res = res.map(|c| chunks = c);

        self.0 = RawCursorState::Loading(RawCursorLoading {
            chunks,
            net_size: 0,
            data_size: 0,
        });

        Poll::Ready(res)
    }

    pub(crate) fn received_bytes(&self) -> u64 {
        match &self.0 {
            RawCursorState::Loading(state) => state.net_size,
            RawCursorState::Waiting(_) => 0,
        }
    }

    pub(crate) fn decoded_bytes(&self) -> u64 {
        match &self.0 {
            RawCursorState::Loading(state) => state.data_size,
            RawCursorState::Waiting(_) => 0,
        }
    }

    #[cfg(feature = "futures03")]
    pub(crate) fn is_terminated(&self) -> bool {
        match &self.0 {
            RawCursorState::Loading(state) => state.chunks.is_terminated(),
            RawCursorState::Waiting(_) => false,
        }
    }
}
