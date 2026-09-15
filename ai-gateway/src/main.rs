use std::{error::Error, io, net::SocketAddr, process::ExitCode};

use ai_gateway::{
    config::{GatewayConfig, LogFormat},
    http,
    inference::InferenceService,
    server::{self, GatewayLifecycleState},
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
    let config = GatewayConfig::from_env()?;
    let logging = tracing_subscriber::fmt()
        .with_max_level(config.log_level)
        .with_target(false);
    match config.log_format {
        LogFormat::Text => logging.compact().init(),
        LogFormat::Json => logging.json().init(),
    }
    let inference = config
        .control_plane
        .map(|control_plane| {
            InferenceService::new(
                control_plane,
                config.max_active_requests,
                config.max_concurrent_resolutions,
            )
        })
        .transpose()?;
    let inference_enabled = inference.is_some();
    let telemetry = inference.as_ref().and_then(InferenceService::telemetry);
    let state = if inference_enabled {
        GatewayLifecycleState::default()
    } else {
        GatewayLifecycleState::unconfigured()
    };
    let app = server::router(state.clone()).merge(http::router(inference, state.clone()));
    let shutdown = shutdown_signal()?;
    let listener = bind_listener(config.listen_address, config.auto_increment_listen_port).await?;
    tracing::info!(address = %listener.local_addr()?, inference_enabled, "gateway listening");
    let result = server::serve(
        listener,
        app,
        state.clone(),
        shutdown,
        config.shutdown_timeout,
    )
    .await;
    if let Some(telemetry) = telemetry {
        telemetry
            .shutdown(
                state
                    .drain_deadline()
                    .unwrap_or_else(tokio::time::Instant::now),
            )
            .await;
    }
    result?;
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
