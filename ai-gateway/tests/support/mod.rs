use std::{io, net::SocketAddr, time::Duration};

use ai_gateway::server::{self, AppState};
use axum::Router;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::oneshot,
    task::JoinHandle,
};

pub struct TestServer {
    pub address: SocketAddr,
    pub state: AppState,
    shutdown: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<io::Result<()>>>,
}

impl TestServer {
    pub async fn start(app: Router, state: AppState, budget: Duration) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (shutdown, receiver) = oneshot::channel();
        let task = tokio::spawn(server::serve(
            listener,
            app,
            state.clone(),
            async {
                let _ = receiver.await;
            },
            budget,
        ));
        Self {
            address,
            state,
            shutdown: Some(shutdown),
            task: Some(task),
        }
    }

    pub fn begin_shutdown(&mut self) {
        self.shutdown.take().unwrap().send(()).unwrap();
    }

    pub async fn finish(mut self) -> io::Result<()> {
        tokio::time::timeout(Duration::from_secs(5), self.task.take().unwrap())
            .await
            .expect("server did not stop")
            .unwrap()
    }
}

impl Drop for TestServer {
    fn drop(&mut self) {
        // Dropping the sender also requests shutdown, including after a failed assertion.
        self.shutdown.take();
    }
}

pub async fn get(address: SocketAddr, path: &str) -> String {
    tokio::time::timeout(Duration::from_secs(5), async {
        let mut socket = TcpStream::connect(address).await.unwrap();
        socket
            .write_all(
                format!("GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
                    .as_bytes(),
            )
            .await
            .unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).await.unwrap();
        response
    })
    .await
    .expect("HTTP request timed out")
}
