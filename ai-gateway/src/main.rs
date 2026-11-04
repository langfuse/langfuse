use std::{error::Error, io, net::SocketAddr, process::ExitCode};

use ai_gateway::{
    config::GatewayConfig,
    http,
    inference::InferenceService,
    observability,
    resolution::ControlPlaneConfig,
    server::{self, GatewayLifecycleState},
};
use tokio::net::TcpListener;

#[tokio::main]
#[expect(
    clippy::print_stderr,
    reason = "the tracing subscriber may not exist or may already be shut down"
)]
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
    let mut config = GatewayConfig::from_env()?;
    let observability = observability::init(&config)?;
    if config.uses_deprecated_connection_drain_timeout_name {
        tracing::warn!(
            "LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS is deprecated; set LANGFUSE_AI_GATEWAY_CONNECTION_DRAIN_TIMEOUT_SECONDS instead"
        );
    }
    if config
        .control_plane
        .as_ref()
        .is_some_and(ControlPlaneConfig::is_plain_http)
    {
        tracing::warn!(
            "LANGFUSE_AI_GATEWAY_WEB_URL uses plain HTTP off loopback (LANGFUSE_AI_GATEWAY_ALLOW_HTTP_WEB_URL=true); provider API keys, the service key and ingestion tokens travel unencrypted. Only use it for internal traffic such as Web's in-cluster Kubernetes Service, never for a URL that crosses the public internet"
        );
    }
    let inference = config
        .control_plane
        .take()
        .map(|control_plane| InferenceService::new(control_plane, &config))
        .transpose()?;
    let inference_enabled = inference.is_some();
    let telemetry = inference.as_ref().and_then(InferenceService::telemetry);
    let state = if inference_enabled {
        GatewayLifecycleState::default()
    } else {
        GatewayLifecycleState::unconfigured()
    };
    let app = server::router(state.clone()).merge(observability::instrument(http::router(
        inference,
        state.clone(),
    )));
    let shutdown = shutdown_signal()?;
    let listener = bind_listener(config.listen_address, config.auto_increment_listen_port).await?;
    tracing::info!(address = %listener.local_addr()?, inference_enabled, max_request_bytes = config.request_limits.max_request_bytes, memory_budget_bytes = config.request_limits.memory_budget_bytes, request_memory_overhead_bytes = config.request_limits.request_overhead_bytes, max_execution_seconds = config.execution_limits.max_execution_time.as_secs(), stall_timeout_seconds = config.execution_limits.stall_timeout.as_secs(), connection_drain_timeout_seconds = config.connection_drain_timeout.as_secs(), telemetry_shutdown_timeout_seconds = config.telemetry_shutdown_timeout.as_secs(), "gateway listening");
    let result = server::serve(
        listener,
        app,
        state.clone(),
        shutdown,
        config.connection_drain_timeout,
    )
    .await;
    // Starts after draining so a drain that hits its deadline cannot consume the flush.
    let flush_deadline = tokio::time::Instant::now() + config.telemetry_shutdown_timeout;
    if let Some(telemetry) = telemetry {
        telemetry.shutdown(flush_deadline).await;
    }
    if result.is_err() {
        tracing::error!("gateway shutdown failed");
    } else {
        tracing::info!("gateway stopped");
    }
    observability.shutdown(flush_deadline).await;
    result.map_err(Into::into)
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
fn shutdown_signal() -> io::Result<impl Future<Output = ()> + Send> {
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
