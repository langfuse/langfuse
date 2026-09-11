use std::{
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    Router,
    body::Body,
    http::{Request, Response},
    routing::any,
};
use serde_json::json;
use tokio::{net::TcpListener, task::JoinHandle};

use crate::resolution::{ApiFormat, ResolvedExecution, Resolver, ResolverConfig};

pub(crate) struct FakeServer {
    pub url: String,
    calls: Arc<AtomicUsize>,
    task: JoinHandle<()>,
}

impl FakeServer {
    pub async fn start<F, Fut>(handler: F) -> Self
    where
        F: Fn(Request<Body>) -> Fut + Clone + Send + Sync + 'static,
        Fut: Future<Output = Response<Body>> + Send + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let app = Router::new().fallback(any(move |request| {
            count.fetch_add(1, Ordering::SeqCst);
            handler(request)
        }));
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        Self { url, calls, task }
    }

    pub fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }

    pub fn resolver(&self) -> Resolver {
        Resolver::new(ResolverConfig::new(&self.url, "test-service-key").unwrap()).unwrap()
    }
}

impl Drop for FakeServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

pub(crate) fn resolution_response(provider_token: &str) -> Response<Body> {
    let expires_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 300;
    let body = json!({
        "version": 1,
        "connection": {
            "id": "connection-1", "provider": "openai", "api_format": "openai.responses",
            "base_url": "https://api.openai.com/v1",
            "auth": {"type": "Bearer", "token": provider_token}
        },
        "attribution": {
            "organization_id": "org-1", "project_id": "project-1", "key_id": "key-1", "key_metadata": {},
            "provider_connection_id": "provider-connection-1"
        },
        "ingestion_mode": "usage",
        "ingestion": {"access_token": "private-ingestion-token", "token_type": "Bearer", "expires_at": expires_at}
    });
    Response::builder()
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

pub(crate) async fn resolved_execution(provider_token: &str) -> ResolvedExecution {
    let token = provider_token.to_owned();
    let web = FakeServer::start(move |_| {
        let token = token.clone();
        async move { resolution_response(&token) }
    })
    .await;
    web.resolver()
        .resolve("gateway-secret", ApiFormat::OpenAiResponses)
        .await
        .unwrap()
}
