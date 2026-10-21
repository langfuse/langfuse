use super::*;
use crate::{observability, server::GatewayLifecycleState};
use axum::{Router, routing::get};
use serde_json::Value;
use std::{
    sync::{Arc, Mutex},
    task::Waker,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tracing_subscriber::prelude::*;

#[derive(Clone, Default)]
struct Buffer(Arc<Mutex<Vec<u8>>>);
impl io::Write for Buffer {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn record_logs() -> (tracing::subscriber::DefaultGuard, Buffer) {
    let output = Buffer::default();
    let buffer = output.clone();
    let subscriber = tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .flatten_event(true)
                .map_event_format(observability::logs::WithCorrelationFields)
                .with_writer(move || buffer.clone()),
        )
        .with(observability::logs::CorrelationSpans);
    (tracing::subscriber::set_default(subscriber), output)
}

fn events(output: &Buffer, message: &str) -> Vec<Value> {
    String::from_utf8(output.0.lock().unwrap().clone())
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .filter(|event| event["message"] == message)
        .collect()
}

#[tokio::test]
async fn close_log_counts_socket_bytes_and_joins_request_logs() {
    const BODY: usize = 64 * 1024;
    let (_guard, output) = record_logs();
    let lifecycle = GatewayLifecycleState::default();
    let app = observability::instrument(
        Router::new().route("/stream", get(|| async { "a".repeat(BODY) })),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let serving = tokio::spawn(crate::server::serve(
        listener,
        app,
        lifecycle,
        std::future::pending(),
        Duration::from_secs(1),
    ));
    let mut client = TcpStream::connect(address).await.unwrap();
    let request = b"GET /stream HTTP/1.1\r\nhost: gateway\r\n\r\n";
    client.write_all(request).await.unwrap();
    let mut response = Vec::new();
    let mut chunk = vec![0; 16 * 1024];
    loop {
        let read = client.read(&mut chunk).await.unwrap();
        assert!(read > 0, "connection closed before the body arrived");
        response.extend_from_slice(&chunk[..read]);
        let header_end = response.windows(4).position(|window| window == b"\r\n\r\n");
        if header_end.is_some_and(|end| response.len() - end - 4 >= BODY) {
            break;
        }
    }
    let received = response.len();
    drop(client);
    let closed = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Some(event) = events(&output, "gateway connection closed").pop() {
                return event;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    serving.abort();

    assert_eq!(closed["level"], "INFO");
    assert_eq!(closed["bytes_read"], request.len());
    assert_eq!(closed["bytes_written"], received);
    assert_eq!(closed["write_blocks"], 0);
    assert_eq!(closed["peer_closed"], true);
    assert!(closed["since_last_write_ms"].as_f64().unwrap() >= 0.0);
    assert!(
        closed.get("write_blocked_at_close_ms").is_none(),
        "{closed}"
    );
    assert!(closed.get("error").is_none(), "{closed}");
    let started = events(&output, "gateway response started");
    assert_eq!(started.len(), 1);
    assert_eq!(started[0]["connection_id"], closed["connection_id"]);
}

#[tokio::test]
async fn write_blocked_by_a_peer_that_stops_reading_is_logged_at_close() {
    let (_guard, output) = record_logs();
    let mut listener = ObservedListener(TcpListener::bind("127.0.0.1:0").await.unwrap());
    let client = TcpStream::connect(listener.local_addr().unwrap())
        .await
        .unwrap();
    let (mut stream, _) = Listener::accept(&mut listener).await;
    let chunk = vec![0; 64 * 1024];
    let mut cx = Context::from_waker(Waker::noop());
    while let Poll::Ready(written) = Pin::new(&mut stream).poll_write(&mut cx, &chunk) {
        assert!(written.unwrap() > 0);
    }
    let written = stream.bytes_written;
    drop(stream);
    drop(client);

    let closed = events(&output, "gateway connection closed");
    assert_eq!(closed.len(), 1);
    assert_eq!(closed[0]["level"], "INFO");
    assert_eq!(closed[0]["bytes_written"], written);
    assert_eq!(closed[0]["write_blocks"], 1);
    assert!(closed[0]["write_blocked_at_close_ms"].as_f64().unwrap() >= 0.0);
    assert_eq!(closed[0]["peer_closed"], false);
}

#[tokio::test]
async fn probe_connections_log_at_debug() {
    let (_guard, output) = record_logs();
    let mut listener = ObservedListener(TcpListener::bind("127.0.0.1:0").await.unwrap());
    let _client = TcpStream::connect(listener.local_addr().unwrap())
        .await
        .unwrap();
    let (mut stream, _) = Listener::accept(&mut listener).await;
    stream.write_all(b"HTTP/1.1 200 OK\r\n\r\n").await.unwrap();
    drop(stream);

    let closed = events(&output, "gateway connection closed");
    assert_eq!(closed.len(), 1);
    assert_eq!(closed[0]["level"], "DEBUG");
}
