use std::{
    error::Error as StdError,
    mem,
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Bytes;
use futures_channel::mpsc;
use futures_util::{SinkExt, Stream};
use hyper::body::{Body, Frame, SizeHint};

// === RequestBody ===

pub struct RequestBody(Inner);

enum Inner {
    Full(Bytes),
    Chunked(mpsc::Receiver<Message>),
}

enum Message {
    Chunk(Bytes),
    Abort,
}

impl RequestBody {
    pub(crate) fn full(content: String) -> Self {
        Self(Inner::Full(Bytes::from(content)))
    }

    pub(crate) fn chunked() -> (ChunkSender, Self) {
        let (tx, rx) = mpsc::channel(0); // each sender gets a guaranteed slot
        let sender = ChunkSender(tx);
        (sender, Self(Inner::Chunked(rx)))
    }
}

impl Body for RequestBody {
    type Data = Bytes;
    type Error = Box<dyn StdError + Send + Sync>;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        match &mut self.get_mut().0 {
            Inner::Full(bytes) if bytes.is_empty() => Poll::Ready(None),
            Inner::Full(bytes) => Poll::Ready(Some(Ok(Frame::data(mem::take(bytes))))),
            Inner::Chunked(rx) => match Pin::new(rx).poll_next(cx) {
                Poll::Ready(Some(Message::Chunk(bytes))) => {
                    Poll::Ready(Some(Ok(Frame::data(bytes))))
                }
                Poll::Ready(Some(Message::Abort)) => Poll::Ready(Some(Err("aborted".into()))),
                Poll::Ready(None) => Poll::Ready(None),
                Poll::Pending => Poll::Pending,
            },
        }
    }

    fn is_end_stream(&self) -> bool {
        match &self.0 {
            Inner::Full(bytes) => bytes.is_empty(),
            Inner::Chunked(_) => false, // default `Body::is_end_stream()`
        }
    }

    fn size_hint(&self) -> SizeHint {
        match &self.0 {
            Inner::Full(bytes) => SizeHint::with_exact(bytes.len() as u64),
            Inner::Chunked(_) => SizeHint::default(), // default `Body::size_hint()`
        }
    }
}

// === ChunkSender ===

pub(crate) struct ChunkSender(mpsc::Sender<Message>);

impl ChunkSender {
    pub(crate) async fn send(&mut self, chunk: Bytes) -> bool {
        self.0.send(Message::Chunk(chunk)).await.is_ok()
    }

    pub(crate) fn abort(&self) {
        // `clone()` allows to send even if the channel is full.
        let _ = self.0.clone().try_send(Message::Abort);
    }
}
