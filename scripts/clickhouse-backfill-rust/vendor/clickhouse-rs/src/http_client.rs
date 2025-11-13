use std::time::Duration;

use hyper::Request;
use hyper_util::{
    client::legacy::{
        Client, Client as HyperClient, ResponseFuture,
        connect::{Connect, HttpConnector},
    },
    rt::TokioExecutor,
};
use sealed::sealed;

use crate::request_body::RequestBody;

/// A trait for underlying HTTP client.
///
/// Firstly, now it is implemented only for
/// `hyper_util::client::legacy::Client`, it's impossible to use another HTTP
/// client.
///
/// Secondly, although it's stable in terms of semver, it will be changed in the
/// future (e.g. to support more runtimes, not only tokio). Thus, prefer to open
/// a feature request instead of implementing this trait manually.
#[sealed]
pub trait HttpClient: Send + Sync + 'static {
    fn request(&self, req: Request<RequestBody>) -> ResponseFuture;
}

#[sealed]
impl<C> HttpClient for Client<C, RequestBody>
where
    C: Connect + Clone + Send + Sync + 'static,
{
    fn request(&self, req: Request<RequestBody>) -> ResponseFuture {
        self.request(req)
    }
}

// === Default ===

const TCP_KEEPALIVE: Duration = Duration::from_secs(60);

// ClickHouse uses 3s by default.
// See https://github.com/ClickHouse/ClickHouse/blob/368cb74b4d222dc5472a7f2177f6bb154ebae07a/programs/server/config.xml#L201
const POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(2);

pub(crate) fn default() -> impl HttpClient {
    let mut connector = HttpConnector::new();

    // TODO: make configurable in `Client::builder()`.
    connector.set_keepalive(Some(TCP_KEEPALIVE));

    connector.enforce_http(!cfg!(any(
        feature = "native-tls",
        feature = "rustls-tls-aws-lc",
        feature = "rustls-tls-ring",
    )));

    #[cfg(feature = "native-tls")]
    let connector = hyper_tls::HttpsConnector::new_with_connector(connector);

    #[cfg(all(feature = "rustls-tls-aws-lc", not(feature = "native-tls")))]
    let connector =
        prepare_hyper_rustls_connector(connector, rustls::crypto::aws_lc_rs::default_provider());

    #[cfg(all(
        feature = "rustls-tls-ring",
        not(feature = "rustls-tls-aws-lc"),
        not(feature = "native-tls"),
    ))]
    let connector =
        prepare_hyper_rustls_connector(connector, rustls::crypto::ring::default_provider());

    HyperClient::builder(TokioExecutor::new())
        .pool_idle_timeout(POOL_IDLE_TIMEOUT)
        .build(connector)
}

#[cfg(not(feature = "native-tls"))]
#[cfg(any(feature = "rustls-tls-aws-lc", feature = "rustls-tls-ring"))]
fn prepare_hyper_rustls_connector(
    connector: HttpConnector,
    provider: rustls::crypto::CryptoProvider,
) -> hyper_rustls::HttpsConnector<HttpConnector> {
    #[cfg(not(feature = "rustls-tls-webpki-roots"))]
    #[cfg(not(feature = "rustls-tls-native-roots"))]
    compile_error!(
        "`rustls-tls-aws-lc` and `rustls-tls-ring` features require either \
         `rustls-tls-webpki-roots` or `rustls-tls-native-roots` feature to be enabled"
    );

    #[cfg(feature = "rustls-tls-native-roots")]
    let builder = hyper_rustls::HttpsConnectorBuilder::new()
        .with_provider_and_native_roots(provider)
        .unwrap();

    #[cfg(all(
        feature = "rustls-tls-webpki-roots",
        not(feature = "rustls-tls-native-roots")
    ))]
    let builder = hyper_rustls::HttpsConnectorBuilder::new()
        .with_provider_and_webpki_roots(provider)
        .unwrap();

    builder
        .https_or_http()
        .enable_http1()
        .wrap_connector(connector)
}
