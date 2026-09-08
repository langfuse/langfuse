use std::{error::Error, process::ExitCode};

use ai_gateway::{
    config::Config,
    server::{self, AppState},
};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("gateway startup or shutdown failed: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), Box<dyn Error>> {
    let config = Config::from_env()?;
    tracing_subscriber::fmt()
        .json()
        .with_max_level(config.log_level)
        .with_target(false)
        .init();
    let shutdown = shutdown_signal()?;
    let listener = TcpListener::bind(config.listen_address).await?;
    tracing::info!(address = %listener.local_addr()?, "gateway listening");
    let state = AppState::default();
    server::serve(
        listener,
        server::router(state.clone()),
        state,
        shutdown,
        config.shutdown_timeout,
    )
    .await?;
    tracing::info!("gateway stopped");
    Ok(())
}

#[cfg(unix)]
fn shutdown_signal() -> std::io::Result<impl Future<Output = ()> + Send> {
    use tokio::signal::unix::{SignalKind, signal};
    let mut terminate = signal(SignalKind::terminate())?;
    let mut interrupt = signal(SignalKind::interrupt())?;
    Ok(async move {
        tokio::select! {
            _ = terminate.recv() => {},
            _ = interrupt.recv() => {},
        }
    })
}

#[cfg(not(unix))]
fn shutdown_signal() -> std::io::Result<impl Future<Output = ()> + Send> {
    Ok(async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::error!(%error, "failed to receive shutdown signal");
        }
    })
}
