#![allow(dead_code)] // typical for common test/bench modules :(

use std::{
    convert::Infallible,
    future::Future,
    net::SocketAddr,
    pin::Pin,
    sync::atomic::{AtomicU32, Ordering},
    thread,
    time::Duration,
};

use bytes::Bytes;
use clickhouse::error::Result;
use futures_util::stream::StreamExt;
use http_body_util::BodyExt;
use hyper::{
    Request, Response,
    body::{Body, Incoming},
    server::conn,
    service,
};
use hyper_util::rt::{TokioIo, TokioTimer};
use tokio::{
    net::TcpListener,
    runtime,
    sync::{mpsc, oneshot},
};

pub(crate) struct ServerHandle {
    handle: Option<thread::JoinHandle<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl ServerHandle {
    fn shutdown(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            tx.send(()).unwrap();
        }
        if let Some(handle) = self.handle.take() {
            handle.join().unwrap();
        }
    }
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        self.shutdown();
    }
}

pub(crate) async fn start_server<S, F, B>(addr: SocketAddr, serve: S) -> ServerHandle
where
    S: Fn(Request<Incoming>) -> F + Send + Sync + 'static,
    F: Future<Output = Response<B>> + Send,
    B: Body<Data = Bytes, Error = Infallible> + Send + 'static,
{
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
    let (ready_tx, ready_rx) = oneshot::channel::<()>();

    let serving = async move {
        let listener = TcpListener::bind(addr).await.unwrap();
        ready_tx.send(()).unwrap();

        loop {
            let (stream, _) = listener.accept().await.unwrap();
            let server_future = conn::http1::Builder::new()
                .timer(TokioTimer::new())
                .serve_connection(
                    TokioIo::new(stream),
                    service::service_fn(|request| async {
                        Ok::<_, Infallible>(serve(request).await)
                    }),
                );
            tokio::select! {
                _ = server_future => {}
                _ = &mut shutdown_rx => { break; }
            }
        }
    };

    let handle = Some(run_on_st_runtime("server", serving));
    ready_rx.await.unwrap();

    ServerHandle {
        handle,
        shutdown_tx: Some(shutdown_tx),
    }
}

pub(crate) async fn skip_incoming(request: Request<Incoming>) {
    let mut body = request.into_body().into_data_stream();

    // Read and skip all frames.
    while let Some(result) = body.next().await {
        result.unwrap();
    }
}

pub(crate) struct RunnerHandle {
    tx: mpsc::UnboundedSender<Run>,
}

struct Run {
    future: Pin<Box<dyn Future<Output = Result<Duration>> + Send>>,
    callback: oneshot::Sender<Result<Duration>>,
}

impl RunnerHandle {
    pub(crate) fn run(
        &self,
        f: impl Future<Output = Result<Duration>> + Send + 'static,
    ) -> Duration {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send(Run {
                future: Box::pin(f),
                callback: tx,
            })
            .unwrap();

        rx.blocking_recv().unwrap().unwrap()
    }
}

pub(crate) fn start_runner() -> RunnerHandle {
    let (tx, mut rx) = mpsc::unbounded_channel::<Run>();

    run_on_st_runtime("testee", async move {
        while let Some(run) = rx.recv().await {
            let result = run.future.await;
            let _ = run.callback.send(result);
        }
    });

    RunnerHandle { tx }
}

fn run_on_st_runtime(name: &str, f: impl Future + Send + 'static) -> thread::JoinHandle<()> {
    let name = name.to_string();
    thread::Builder::new()
        .name(name.clone())
        .spawn(move || {
            let no = AtomicU32::new(0);
            runtime::Builder::new_current_thread()
                .enable_all()
                .thread_name_fn(move || {
                    let no = no.fetch_add(1, Ordering::Relaxed);
                    format!("{name}-{no}")
                })
                .build()
                .unwrap()
                .block_on(f);
        })
        .unwrap()
}
