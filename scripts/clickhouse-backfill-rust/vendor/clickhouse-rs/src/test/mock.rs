use std::{
    collections::VecDeque,
    convert::Infallible,
    error::Error,
    net::SocketAddr,
    sync::{Arc, Mutex},
    thread,
};

use bytes::Bytes;
use http_body_util::{BodyExt as _, Full};
use hyper::{Request, Response, StatusCode, body::Incoming, server::conn, service};
use hyper_util::rt::TokioIo;
use tokio::{net::TcpListener, task::AbortHandle};

use super::{Handler, HandlerFn};

/// URL using a special hostname that `Client` can use to detect a mocked server.
///
/// This is to avoid breaking existing usages of the mock API which just call
/// `client.with_url(mock.url)`.
///
/// This domain should not resolve otherwise. The `.test` top-level domain
/// is reserved and cannot be registered on the open Internet.
const MOCKED_BASE_URL: &str = "http://mocked.clickhouse.test";

/// The real base URL where the mocked server is listening.
const REAL_BASE_URL: &str = "http://127.0.0.1";

/// A mock server for testing.
pub struct Mock {
    mock_url: String,
    pub(crate) real_url: String,
    shared: Arc<Mutex<Shared>>,
    non_exhaustive: bool,
    server_handle: AbortHandle,
}

/// Shared between the server and the test.
#[derive(Default)]
struct Shared {
    handlers: VecDeque<HandlerFn>,
    /// An error from the background server task.
    /// Propagated as a panic in test cases.
    error: Option<Box<dyn Error + Send + Sync>>,
}

impl Mock {
    /// Starts a new test server and returns a handle to it.
    #[track_caller]
    pub fn new() -> Self {
        let (addr, listener) = {
            let addr = SocketAddr::from(([127, 0, 0, 1], 0));
            let listener = std::net::TcpListener::bind(addr).expect("cannot bind a listener");
            listener
                .set_nonblocking(true)
                .expect("cannot set non-blocking mode");
            let addr = listener.local_addr().expect("cannot get a local address");
            let listener = TcpListener::from_std(listener).expect("cannot convert to tokio");
            (addr, listener)
        };

        let shared = Arc::new(Mutex::new(Shared::default()));
        let server_handle = tokio::spawn(server(listener, shared.clone()));

        Self {
            mock_url: format!("{MOCKED_BASE_URL}:{}", addr.port()),
            real_url: format!("{REAL_BASE_URL}:{}", addr.port()),
            non_exhaustive: false,
            server_handle: server_handle.abort_handle(),
            shared,
        }
    }

    /// Returns a test server's URL to provide into [`Client`].
    ///
    /// [`Client`]: crate::Client::with_url
    pub fn url(&self) -> &str {
        &self.mock_url
    }

    pub(crate) fn real_url(&self) -> &str {
        &self.real_url
    }

    /// Returns `Some` if `url` was a mocked URL and converted to real, `None` if already real.
    pub(crate) fn mocked_url_to_real(url: &str) -> Option<String> {
        url.strip_prefix(MOCKED_BASE_URL)
            // rest = ":{port}"
            .map(|rest| format!("{REAL_BASE_URL}{rest}"))
    }

    /// Adds a handler to the test server for the next request.
    ///
    /// Can be called multiple times to enqueue multiple handlers.
    ///
    /// If [`Mock::non_exhaustive()`] is not called, the destructor will panic
    /// if not all handlers are called by the end of the test.
    #[track_caller]
    pub fn add<H: Handler>(&self, handler: H) -> H::Control {
        self.propagate_server_error();

        if self.server_handle.is_finished() {
            panic!("impossible to add a handler: the test server is terminated");
        }

        let (handler, control) = handler.make();
        self.shared.lock().unwrap().handlers.push_back(handler);
        control
    }

    /// Allows unused handlers to be left after the test ends.
    pub fn non_exhaustive(&mut self) {
        self.non_exhaustive = true;
    }

    #[track_caller]
    fn propagate_server_error(&self) {
        if let Some(error) = &self.shared.lock().unwrap().error {
            panic!("server error: {error}");
        }
    }
}

impl Default for Mock {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Mock {
    fn drop(&mut self) {
        self.server_handle.abort();

        if thread::panicking() {
            return;
        }

        self.propagate_server_error();

        if !self.non_exhaustive && !self.shared.lock().unwrap().handlers.is_empty() {
            panic!("test ended, but not all responses have been consumed");
        }
    }
}

async fn server(listener: TcpListener, shared: Arc<Mutex<Shared>>) {
    let error = loop {
        let stream = match listener.accept().await {
            Ok((stream, _)) => stream,
            Err(err) => break err.into(),
        };

        let serving = conn::http1::Builder::new()
            // N.B.: We set no timeouts here because it works incorrectly with
            // advanced time via `tokio::time::advance(duration)`.
            .keep_alive(false)
            .serve_connection(
                TokioIo::new(stream),
                service::service_fn(|request| handle(request, &shared)),
            );

        if let Err(err) = serving.await {
            break err.into();
        }
    };

    shared.lock().unwrap().error.get_or_insert(error);
}

async fn handle(
    request: Request<Incoming>,
    shared: &Mutex<Shared>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let response = do_handle(request, shared).await.unwrap_or_else(|err| {
        let bytes = Bytes::from(err.to_string());

        // Prevents further usage of the mock.
        shared.lock().unwrap().error.get_or_insert(err);

        Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .body(Full::new(bytes))
            .unwrap()
    });

    Ok(response)
}

async fn do_handle(
    request: Request<Incoming>,
    shared: &Mutex<Shared>,
) -> Result<Response<Full<Bytes>>, Box<dyn Error + Send + Sync>> {
    let Some(handler) = shared.lock().unwrap().handlers.pop_front() else {
        // TODO: provide better error, e.g. some part of parsed body.
        return Err(format!("no installed handler for an incoming request: {request:?}").into());
    };

    let (parts, body) = request.into_parts();
    let body = body.collect().await?.to_bytes();

    let request = Request::from_parts(parts, body);
    let response = handler(request).map(Full::new);

    Ok(response)
}
