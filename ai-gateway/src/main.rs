use std::{error::Error, io, net::SocketAddr, process::ExitCode};

use ai_gateway::{
    config::{Config, LogFormat},
    execution::Execution,
    http,
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
    let logging = tracing_subscriber::fmt()
        .with_max_level(config.log_level)
        .with_target(false);
    match config.log_format {
        LogFormat::Text => logging.compact().init(),
        LogFormat::Json => logging.json().init(),
    }
    let execution = config
        .resolver
        .map(|resolver| {
            Execution::new(
                resolver,
                config.max_active_requests,
                config.max_concurrent_resolutions,
            )
        })
        .transpose()?;
    let inference_enabled = execution.is_some();
    let state = if inference_enabled {
        AppState::default()
    } else {
        AppState::unconfigured()
    };
    let app = server::router(state.clone()).merge(http::router(execution, state.clone()));
    let shutdown = shutdown_signal()?;
    let listener = bind_listener(config.listen_address, config.auto_increment_listen_port).await?;
    tracing::info!(address = %listener.local_addr()?, inference_enabled, "gateway listening");
    server::serve(listener, app, state, shutdown, config.shutdown_timeout).await?;
    tracing::info!("gateway stopped");
    Ok(())
}

async fn bind_listener(
    requested_address: SocketAddr,
    auto_increment_port: bool,
) -> io::Result<TcpListener> {
    let mut address = requested_address;
    loop {
        match TcpListener::bind(address).await {
            Ok(listener) => {
                if address != requested_address {
                    tracing::warn!(
                        %requested_address,
                        selected_address = %address,
                        "gateway listen port unavailable; using next available port"
                    );
                }
                return Ok(listener);
            }
            Err(error)
                if auto_increment_port
                    && error.kind() == io::ErrorKind::AddrInUse
                    && address.port() < u16::MAX =>
            {
                address.set_port(address.port() + 1);
            }
            Err(error) => return Err(error),
        }
    }
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
