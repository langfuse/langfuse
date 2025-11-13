use bytes::Bytes;
use hyper::{Request, Response, StatusCode};
use sealed::sealed;

pub use self::mock::Mock;

pub mod handlers;
mod mock;

#[sealed]
pub trait Handler {
    type Control;

    #[doc(hidden)]
    fn make(self) -> (HandlerFn, Self::Control);
}

type HandlerFn = Box<dyn FnOnce(Request<Bytes>) -> Response<Bytes> + Send>;

// List: https://github.com/ClickHouse/ClickHouse/blob/495c6e03aa9437dac3cd7a44ab3923390bef9982/src/Server/HTTPHandler.cpp#L132
pub mod status {
    use super::*;

    pub const UNAUTHORIZED: StatusCode = StatusCode::UNAUTHORIZED;
    pub const FORBIDDEN: StatusCode = StatusCode::FORBIDDEN;
    pub const BAD_REQUEST: StatusCode = StatusCode::BAD_REQUEST;
    pub const NOT_FOUND: StatusCode = StatusCode::NOT_FOUND;
    pub const PAYLOAD_TOO_LARGE: StatusCode = StatusCode::PAYLOAD_TOO_LARGE;
    pub const NOT_IMPLEMENTED: StatusCode = StatusCode::NOT_IMPLEMENTED;
    pub const SERVICE_UNAVAILABLE: StatusCode = StatusCode::SERVICE_UNAVAILABLE;
    pub const LENGTH_REQUIRED: StatusCode = StatusCode::LENGTH_REQUIRED;
    pub const INTERNAL_SERVER_ERROR: StatusCode = StatusCode::INTERNAL_SERVER_ERROR;
}
