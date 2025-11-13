use std::marker::PhantomData;

use bytes::Bytes;
use futures_channel::oneshot;
use hyper::{Request, Response, StatusCode};
use sealed::sealed;
use serde::Serialize;

use super::{Handler, HandlerFn};
use crate::{Row, RowOwned, RowRead, rowbinary};

const BUFFER_INITIAL_CAPACITY: usize = 1024;

// === Thunk ===

struct Thunk(Response<Bytes>);

#[sealed]
impl super::Handler for Thunk {
    type Control = ();

    fn make(self) -> (HandlerFn, Self::Control) {
        (Box::new(|_| self.0), ())
    }
}

// === failure ===

#[track_caller]
pub fn failure(status: StatusCode) -> impl Handler {
    let reason = status.canonical_reason().unwrap_or("<unknown status code>");

    Response::builder()
        .status(status)
        .body(Bytes::from(reason))
        .map(Thunk)
        .expect("invalid builder")
}

#[track_caller]
pub fn exception(code: u8) -> impl Handler {
    Response::builder()
        .status(StatusCode::OK)
        .header("X-ClickHouse-Exception-Code", code.to_string())
        .body(Bytes::new())
        .map(Thunk)
        .expect("invalid builder")
}
// === provide ===

#[track_caller]
pub fn provide<T>(rows: impl IntoIterator<Item = T>) -> impl Handler
where
    T: Serialize + Row,
{
    let mut buffer = Vec::with_capacity(BUFFER_INITIAL_CAPACITY);
    for row in rows {
        rowbinary::serialize_row_binary(&mut buffer, &row).expect("failed to serialize");
    }
    Thunk(Response::new(buffer.into()))
}

// === record ===

struct RecordHandler<T>(PhantomData<T>);

#[sealed]
impl<T> super::Handler for RecordHandler<T> {
    type Control = RecordControl<T>;

    #[doc(hidden)]
    fn make(self) -> (HandlerFn, Self::Control) {
        let (tx, rx) = oneshot::channel();
        let marker = PhantomData;
        let control = RecordControl { rx, marker };

        let h = Box::new(move |request: Request<Bytes>| -> Response<Bytes> {
            let body = request.into_body();
            let _ = tx.send(body);
            Response::new(<_>::default())
        });

        (h, control)
    }
}

pub struct RecordControl<T> {
    rx: oneshot::Receiver<Bytes>,
    marker: PhantomData<T>,
}

impl<T> RecordControl<T>
where
    T: RowOwned + RowRead,
{
    pub async fn collect<C>(self) -> C
    where
        C: Default + Extend<T>,
    {
        let bytes = self.rx.await.expect("query canceled");
        let slice = &mut (&bytes[..]);
        let mut result = C::default();

        while !slice.is_empty() {
            let res = rowbinary::deserialize_row(slice, None);
            let row: T = res.expect("failed to deserialize");
            result.extend(std::iter::once(row));
        }

        result
    }
}

#[track_caller]
pub fn record<T>() -> impl Handler<Control = RecordControl<T>> {
    RecordHandler(PhantomData)
}

// === record_ddl ===

struct RecordDdlHandler;

#[sealed]
impl super::Handler for RecordDdlHandler {
    type Control = RecordDdlControl;

    #[doc(hidden)]
    fn make(self) -> (HandlerFn, Self::Control) {
        let (tx, rx) = oneshot::channel();
        let control = RecordDdlControl(rx);

        let h = Box::new(move |request: Request<Bytes>| -> Response<Bytes> {
            let body = request.into_body();
            let _ = tx.send(body);
            Response::new(<_>::default())
        });

        (h, control)
    }
}

pub struct RecordDdlControl(oneshot::Receiver<Bytes>);

impl RecordDdlControl {
    pub async fn query(self) -> String {
        let buffer = self.0.await.expect("query canceled");
        String::from_utf8(buffer.to_vec()).expect("query is not DDL")
    }
}

pub fn record_ddl() -> impl Handler<Control = RecordDdlControl> {
    RecordDdlHandler
}
