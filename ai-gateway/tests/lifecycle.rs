mod support;

use ai_gateway::server::{self, AppState};
use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
    routing::get,
};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use support::TestServer;
use tokio::sync::Notify;
use tower::ServiceExt;

#[tokio::test]
async fn probes_and_unimplemented_routes_over_http() {
    let state = AppState::default();
    let mut server =
        TestServer::start(server::router(state.clone()), state, Duration::from_secs(1)).await;
    let health = support::get(server.address, "/health").await;
    assert!(health.starts_with("HTTP/1.1 200"));
    assert!(health.ends_with(r#"{"status":"ok"}"#));
    let ready = support::get(server.address, "/ready").await;
    assert!(ready.starts_with("HTTP/1.1 200"));
    assert!(ready.ends_with(r#"{"status":"ready"}"#));
    let unimplemented = server::router(server.state.clone())
        .oneshot(
            Request::post("/openai/v1/responses")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unimplemented.status(), StatusCode::NOT_FOUND);
    server.begin_shutdown();
    server.finish().await.unwrap();
}

#[tokio::test]
async fn shutdown_marks_unready_and_waits_for_in_flight_request() {
    let entered = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let state = AppState::default();
    let app = server::router(state.clone()).route(
        "/slow",
        get({
            let entered = entered.clone();
            let release = release.clone();
            move || {
                let entered = entered.clone();
                let release = release.clone();
                async move {
                    entered.notify_one();
                    release.notified().await;
                    "finished"
                }
            }
        }),
    );
    let mut server = TestServer::start(app, state.clone(), Duration::from_secs(2)).await;
    let request = tokio::spawn(support::get(server.address, "/slow"));
    tokio::time::timeout(Duration::from_secs(2), entered.notified())
        .await
        .unwrap();
    server.begin_shutdown();
    tokio::time::timeout(Duration::from_secs(2), async {
        while state.is_ready() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let response = server::router(state.clone())
        .oneshot(Request::get("/ready").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        to_bytes(response.into_body(), 1024).await.unwrap(),
        r#"{"status":"draining"}"#
    );
    assert!(!request.is_finished());
    release.notify_one();
    assert!(request.await.unwrap().ends_with("finished"));
    server.finish().await.unwrap();
    assert!(!state.is_ready());
}

#[tokio::test]
async fn shutdown_deadline_bounds_a_stuck_handler() {
    let entered = Arc::new(Notify::new());
    let app = Router::new().route(
        "/stuck",
        get({
            let entered = entered.clone();
            move || {
                let entered = entered.clone();
                async move {
                    entered.notify_one();
                    std::future::pending::<()>().await;
                    "unreachable"
                }
            }
        }),
    );
    let mut server = TestServer::start(app, AppState::default(), Duration::from_millis(50)).await;
    let request = tokio::spawn(support::get(server.address, "/stuck"));
    tokio::time::timeout(Duration::from_secs(2), entered.notified())
        .await
        .unwrap();
    server.begin_shutdown();
    assert_eq!(
        server.finish().await.unwrap_err().kind(),
        std::io::ErrorKind::TimedOut
    );
    request.abort();
}

#[tokio::test]
async fn fake_dependency_records_requests_and_returns_scripted_response() {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let app = Router::new().fallback({
        let requests = requests.clone();
        move |request: Request<Body>| {
            let requests = requests.clone();
            async move {
                requests
                    .lock()
                    .unwrap()
                    .push((request.method().clone(), request.uri().to_string()));
                (
                    StatusCode::TOO_MANY_REQUESTS,
                    [("retry-after", "1")],
                    "try later",
                )
            }
        }
    });
    let mut fake = TestServer::start(app, AppState::default(), Duration::from_secs(1)).await;
    let response = support::get(fake.address, "/example").await;
    assert!(response.starts_with("HTTP/1.1 429"));
    assert!(response.contains("retry-after: 1\r\n"));
    assert!(response.ends_with("try later"));
    assert_eq!(
        requests.lock().unwrap().as_slice(),
        &[(axum::http::Method::GET, "/example".to_string())]
    );
    fake.begin_shutdown();
    fake.finish().await.unwrap();
}
