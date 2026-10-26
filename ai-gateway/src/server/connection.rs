//! Socket write accounting for accepted connections, logged when each closes.
//!
//! The relay reports a stream complete once hyper has taken the last body chunk,
//! which says nothing about whether those bytes reached the socket. These counters
//! do: `bytes_written` is what the kernel send buffer accepted, and a peer that
//! stops reading shows up as a write still blocked at close once that buffer fills.
//!
//! Temporary diagnostics for streams the load balancer holds open until its idle
//! timeout after the gateway reported them complete. Delete this module, its
//! `ConnectInfo` wiring in `server::serve`, and the `gateway.connection.id` span
//! and correlation fields once that cause is known.
use std::{
    io,
    net::SocketAddr,
    pin::Pin,
    sync::atomic::{AtomicU64, Ordering},
    task::{Context, Poll},
    time::Duration,
};

use axum::{
    extract::connect_info::Connected,
    serve::{IncomingStream, Listener},
};
use tokio::{
    io::{AsyncRead, AsyncWrite, ReadBuf},
    net::{TcpListener, TcpStream},
    time::Instant,
};

/// Connections that wrote less than this without a write error or a long
/// write block, such as health checks, are not logged.
const PROBE_BYTES: u64 = 8 * 1024;

/// A new socket's first write is often pending until the reactor sees it
/// writable, so shorter blocks are not worth a log line on their own.
const NOTABLE_WRITE_BLOCK: Duration = Duration::from_millis(100);

static NEXT_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

/// Wraps accepted sockets in [`ObservedStream`].
pub(crate) struct ObservedListener(pub(crate) TcpListener);

impl Listener for ObservedListener {
    type Io = ObservedStream;
    type Addr = SocketAddr;

    async fn accept(&mut self) -> (Self::Io, Self::Addr) {
        let (io, peer) = Listener::accept(&mut self.0).await;
        (ObservedStream::new(io, peer), peer)
    }

    fn local_addr(&self) -> io::Result<Self::Addr> {
        self.0.local_addr()
    }
}

/// Process-unique ID of the connection that carried a request, recorded on the
/// server span so request logs join the connection's close log.
#[derive(Clone, Debug)]
pub(crate) struct ConnectionId(pub(crate) String);

impl Connected<IncomingStream<'_, ObservedListener>> for ConnectionId {
    fn connect_info(stream: IncomingStream<'_, ObservedListener>) -> Self {
        Self(stream.io().id.to_string())
    }
}

pub(crate) struct ObservedStream {
    io: TcpStream,
    id: u64,
    peer: SocketAddr,
    opened: Instant,
    bytes_written: u64,
    last_write: Option<Instant>,
    write_blocked_since: Option<Instant>,
    longest_write_block: Duration,
    write_error: Option<io::ErrorKind>,
}

impl ObservedStream {
    fn new(io: TcpStream, peer: SocketAddr) -> Self {
        Self {
            io,
            id: NEXT_CONNECTION_ID.fetch_add(1, Ordering::Relaxed),
            peer,
            opened: Instant::now(),
            bytes_written: 0,
            last_write: None,
            write_blocked_since: None,
            longest_write_block: Duration::ZERO,
            write_error: None,
        }
    }

    fn record_write(&mut self, poll: Poll<io::Result<usize>>) -> Poll<io::Result<usize>> {
        let now = Instant::now();
        match &poll {
            Poll::Pending => {
                self.write_blocked_since.get_or_insert(now);
                return poll;
            }
            Poll::Ready(Ok(written)) => {
                self.bytes_written += *written as u64;
                self.last_write = Some(now);
            }
            Poll::Ready(Err(error)) => {
                self.write_error.get_or_insert_with(|| error.kind());
            }
        }
        if let Some(since) = self.write_blocked_since.take() {
            self.longest_write_block = self.longest_write_block.max(now - since);
        }
        poll
    }
}

impl AsyncRead for ObservedStream {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().io).poll_read(cx, buf)
    }
}

impl AsyncWrite for ObservedStream {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        let this = self.get_mut();
        let poll = Pin::new(&mut this.io).poll_write(cx, buf);
        this.record_write(poll)
    }

    fn poll_write_vectored(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        bufs: &[io::IoSlice<'_>],
    ) -> Poll<io::Result<usize>> {
        let this = self.get_mut();
        let poll = Pin::new(&mut this.io).poll_write_vectored(cx, bufs);
        this.record_write(poll)
    }

    fn is_write_vectored(&self) -> bool {
        self.io.is_write_vectored()
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().io).poll_flush(cx)
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().io).poll_shutdown(cx)
    }
}

impl Drop for ObservedStream {
    fn drop(&mut self) {
        let now = Instant::now();
        let blocked_at_close = self.write_blocked_since.map(|since| now - since);
        if self.bytes_written < PROBE_BYTES
            && self.write_error.is_none()
            && blocked_at_close.is_none_or(|blocked| blocked < NOTABLE_WRITE_BLOCK)
            && self.longest_write_block < NOTABLE_WRITE_BLOCK
        {
            return;
        }
        let millis = |duration: Duration| duration.as_secs_f64() * 1000.0;
        tracing::info!(
            connection_id = %self.id,
            peer = %self.peer,
            duration_ms = millis(now - self.opened),
            bytes_written = self.bytes_written,
            since_last_write_ms = self.last_write.map(|last| millis(now - last)),
            longest_write_block_ms = millis(self.longest_write_block),
            write_blocked_at_close_ms = blocked_at_close.map(millis),
            write_error = self.write_error.map(tracing::field::display),
            "gateway connection closed"
        );
    }
}

#[cfg(test)]
mod tests;
