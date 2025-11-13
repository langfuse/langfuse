use std::{
    future::{self, Future},
    pin::{Pin, pin},
    task::{Context, Poll},
};

use bstr::ByteSlice;
use bytes::{BufMut, Bytes};
use futures_util::stream::{self, Stream, TryStreamExt};
use http_body_util::BodyExt as _;
use hyper::{
    StatusCode,
    body::{Body as _, Incoming},
};
use hyper_util::client::legacy::ResponseFuture as HyperResponseFuture;

#[cfg(feature = "lz4")]
use crate::compression::lz4::Lz4Decoder;
use crate::{
    compression::Compression,
    error::{Error, Result},
};

// === Response ===

pub(crate) enum Response {
    // Headers haven't been received yet.
    // `Box<_>` improves performance by reducing the size of the whole future.
    Waiting(ResponseFuture),
    // Headers have been received, streaming the body.
    Loading(Chunks),
}

pub(crate) type ResponseFuture = Pin<Box<dyn Future<Output = Result<Chunks>> + Send>>;

impl Response {
    pub(crate) fn new(response: HyperResponseFuture, compression: Compression) -> Self {
        Self::Waiting(Box::pin(async move {
            let response = response.await?;

            let status = response.status();
            let exception_code = response.headers().get("X-ClickHouse-Exception-Code");

            if status == StatusCode::OK && exception_code.is_none() {
                // More likely to be successful, start streaming.
                // It still can fail, but we'll handle it in `DetectDbException`.
                Ok(Chunks::new(response.into_body(), compression))
            } else {
                // An instantly failed request.
                Err(collect_bad_response(
                    status,
                    exception_code
                        .and_then(|value| value.to_str().ok())
                        .map(|code| format!("Code: {code}")),
                    response.into_body(),
                    compression,
                )
                .await)
            }
        }))
    }

    pub(crate) fn into_future(self) -> ResponseFuture {
        match self {
            Self::Waiting(future) => future,
            Self::Loading(_) => panic!("response is already streaming"),
        }
    }

    pub(crate) async fn finish(&mut self) -> Result<()> {
        let chunks = loop {
            match self {
                Self::Waiting(future) => *self = Self::Loading(future.await?),
                Self::Loading(chunks) => break chunks,
            }
        };

        while chunks.try_next().await?.is_some() {}
        Ok(())
    }
}

#[cold]
#[inline(never)]
async fn collect_bad_response(
    status: StatusCode,
    exception_code: Option<String>,
    body: Incoming,
    compression: Compression,
) -> Error {
    // Collect the whole body into one contiguous buffer to simplify handling.
    // Only network errors can occur here and we return them instead of status code
    // because it means the request can be repeated to get a more detailed error.
    //
    // TODO: we don't implement any length checks and a malicious peer (e.g. MITM)
    //       might make us consume arbitrary amounts of memory.
    let raw_bytes = match body.collect().await {
        Ok(collected) => collected.to_bytes(),
        // If we can't collect the body, return standardised reason for the status code.
        Err(_) => return Error::BadResponse(reason(status, exception_code)),
    };
    if raw_bytes.is_empty() {
        return Error::BadResponse(reason(status, exception_code));
    }

    // Try to decompress the body, because CH uses compression even for errors.
    let stream = stream::once(future::ready(Result::<_>::Ok(raw_bytes.slice(..))));
    let stream = Decompress::new(stream, compression).map_ok(|chunk| chunk.data);

    // We're collecting already fetched chunks, thus only decompression errors can
    // be here. If decompression is failed, we should try the raw body because
    // it can be sent without any compression if some proxy is used, which
    // typically know nothing about CH params.
    let bytes = collect_bytes(stream).await.unwrap_or(raw_bytes);

    let reason = String::from_utf8(bytes.into())
        .map(|reason| reason.trim().into())
        // If we have a unreadable response, return standardised reason for the status code.
        .unwrap_or_else(|_| reason(status, exception_code));

    Error::BadResponse(reason)
}

async fn collect_bytes(stream: impl Stream<Item = Result<Bytes>>) -> Result<Bytes> {
    let mut stream = pin!(stream);

    let mut bytes = Vec::new();

    // TODO: avoid extra copying if there is only one chunk in the stream.
    while let Some(chunk) = stream.try_next().await? {
        bytes.put(chunk);
    }

    Ok(bytes.into())
}

fn reason(status: StatusCode, exception_code: Option<String>) -> String {
    exception_code.unwrap_or_else(|| {
        format!(
            "{} {}",
            status.as_str(),
            status.canonical_reason().unwrap_or("<unknown>"),
        )
    })
}

// === Chunks ===

pub(crate) struct Chunk {
    pub(crate) data: Bytes,
    pub(crate) net_size: usize,
}

// * Uses `Option<_>` to make this stream fused.
// * Uses `Box<_>` in order to reduce the size of cursors.
pub(crate) struct Chunks(Option<Box<DetectDbException<Decompress<IncomingStream>>>>);

impl Chunks {
    fn new(stream: Incoming, compression: Compression) -> Self {
        let stream = IncomingStream(stream);
        let stream = Decompress::new(stream, compression);
        let stream = DetectDbException(stream);
        Self(Some(Box::new(stream)))
    }

    pub(crate) fn empty() -> Self {
        Self(None)
    }

    #[cfg(feature = "futures03")]
    pub(crate) fn is_terminated(&self) -> bool {
        self.0.is_none()
    }
}

impl Stream for Chunks {
    type Item = Result<Chunk>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // We use `take()` to make the stream fused, including the case of panics.
        if let Some(mut stream) = self.0.take() {
            let res = Pin::new(&mut stream).poll_next(cx);

            if matches!(res, Poll::Pending | Poll::Ready(Some(Ok(_)))) {
                self.0 = Some(stream);
            }

            res
        } else {
            Poll::Ready(None)
        }
    }

    // `size_hint()` is unimplemented because unused.
}

// === IncomingStream ===

// * Produces bytes from incoming data frames.
// * Skips trailer frames (CH doesn't use them for now).
// * Converts hyper errors to our own.
struct IncomingStream(Incoming);

impl Stream for IncomingStream {
    type Item = Result<Bytes>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let mut incoming = Pin::new(&mut self.get_mut().0);

        loop {
            break match incoming.as_mut().poll_frame(cx) {
                Poll::Ready(Some(Ok(frame))) => match frame.into_data() {
                    Ok(bytes) => Poll::Ready(Some(Ok(bytes))),
                    Err(_frame) => continue,
                },
                Poll::Ready(Some(Err(err))) => Poll::Ready(Some(Err(err.into()))),
                Poll::Ready(None) => Poll::Ready(None),
                Poll::Pending => Poll::Pending,
            };
        }
    }
}

// === Decompress ===

enum Decompress<S> {
    Plain(S),
    #[cfg(feature = "lz4")]
    Lz4(Lz4Decoder<S>),
}

impl<S> Decompress<S> {
    fn new(stream: S, compression: Compression) -> Self {
        match compression {
            Compression::None => Self::Plain(stream),
            #[cfg(feature = "lz4")]
            #[allow(deprecated)]
            Compression::Lz4 | Compression::Lz4Hc(_) => Self::Lz4(Lz4Decoder::new(stream)),
        }
    }
}

impl<S> Stream for Decompress<S>
where
    S: Stream<Item = Result<Bytes>> + Unpin,
{
    type Item = Result<Chunk>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match &mut *self {
            Self::Plain(stream) => Pin::new(stream)
                .poll_next(cx)
                .map_ok(|bytes| Chunk {
                    net_size: bytes.len(),
                    data: bytes,
                })
                .map_err(Into::into),
            #[cfg(feature = "lz4")]
            Self::Lz4(stream) => Pin::new(stream).poll_next(cx),
        }
    }
}

// === DetectDbException ===

struct DetectDbException<S>(S);

impl<S> Stream for DetectDbException<S>
where
    S: Stream<Item = Result<Chunk>> + Unpin,
{
    type Item = Result<Chunk>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let res = Pin::new(&mut self.0).poll_next(cx);

        if let Poll::Ready(Some(Ok(chunk))) = &res
            && let Some(err) = extract_exception(&chunk.data)
        {
            return Poll::Ready(Some(Err(err)));
        }

        res
    }
}

// Format:
// ```
//   <data>Code: <code>. DB::Exception: <desc> (version <version> (official build))\n
// ```
fn extract_exception(chunk: &[u8]) -> Option<Error> {
    // `))\n` is very rare in real data, so it's fast dirty check.
    // In random data, it occurs with a probability of ~6*10^-8 only.
    if chunk.ends_with(b"))\n") {
        extract_exception_slow(chunk)
    } else {
        None
    }
}

#[cold]
#[inline(never)]
fn extract_exception_slow(chunk: &[u8]) -> Option<Error> {
    let index = chunk.rfind(b"Code:")?;

    if !(chunk[index..].contains_str(b"DB::") && chunk[index..].contains_str(b"Exception:")) {
        return None;
    }

    let exception = String::from_utf8_lossy(&chunk[index..chunk.len() - 1]);
    Some(Error::BadResponse(exception.into()))
}

#[test]
fn it_extracts_exception() {
    let errors = [
        "Code: 159. DB::Exception: Timeout exceeded: elapsed 1.2 seconds, maximum: 0.1. (TIMEOUT_EXCEEDED) (version 24.10.1.2812 (official build))",
        "Code: 210. DB::NetException: I/O error: Broken pipe, while writing to socket (127.0.0.1:9000 -> 127.0.0.1:54646). (NETWORK_ERROR) (version 23.8.8.20 (official build))",
    ];

    for error in errors {
        let chunk = format!("{error}\n");
        let err = extract_exception(chunk.as_bytes()).expect("failed to extract exception");
        assert_eq!(err.to_string(), format!("bad response: {error}"));
    }
}
