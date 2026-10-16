//! Per-request facts shared between the HTTP middleware and the request handler, so
//! the response metric can name who caused an error and how much of the wait was
//! the gateway's own work.
use std::{
    sync::{Arc, Mutex, PoisonError},
    time::Duration,
};

/// Who caused a failed response. `none` marks a success. Dashboards fold
/// `provider` responses with `error.reason=provider_4xx` into caller errors.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ErrorOrigin {
    None,
    /// The caller's request or credential was rejected.
    Client,
    /// The gateway itself: capacity, draining, configuration, or a bug.
    Gateway,
    /// Web resolution or the model catalog failed.
    ControlPlane,
    /// The provider was unreachable or missed a deadline.
    ProviderTransport,
    /// The provider answered with an error status, relayed unchanged.
    Provider,
}

impl ErrorOrigin {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Client => "client",
            Self::Gateway => "gateway",
            Self::ControlPlane => "control_plane",
            Self::ProviderTransport => "provider_transport",
            Self::Provider => "provider",
        }
    }

    /// Errors attributed to Langfuse rather than the caller or the provider.
    pub(crate) fn is_ours(self) -> bool {
        matches!(self, Self::Gateway | Self::ControlPlane)
    }
}

/// Bounded `error.reason` for a provider error status relayed to the caller.
/// Provider 401/403 usually means the stored provider credential is broken, so
/// it is kept apart from other 4xx rather than counted as a caller error.
pub(crate) fn provider_status_reason(status: u16) -> &'static str {
    match status {
        429 => "provider_rate_limited",
        401 | 403 => "provider_auth",
        400..=499 => "provider_4xx",
        _ => "provider_5xx",
    }
}

#[derive(Clone, Copy)]
pub(crate) enum Phase {
    /// Buffering the caller's upload; never gateway overhead.
    RequestBody,
    Resolution,
    ModelCatalog,
    /// The provider send through response headers; never gateway overhead.
    ProviderHeaders,
}

impl Phase {
    fn as_str(self) -> &'static str {
        match self {
            Self::RequestBody => "request.body",
            Self::Resolution => "resolution",
            Self::ModelCatalog => "model_catalog",
            Self::ProviderHeaders => "provider.headers",
        }
    }
}

#[derive(Debug, Default)]
struct State {
    error: Option<(ErrorOrigin, &'static str)>,
    provider: Option<&'static str>,
    request_body: Option<Duration>,
    resolution: Option<Duration>,
    provider_headers: Option<Duration>,
}

/// Cheap to clone; the middleware and the handler hold the same state.
#[derive(Clone, Debug, Default)]
pub(crate) struct RequestObservation(Arc<Mutex<State>>);

pub(super) struct Summary {
    pub error: Option<(ErrorOrigin, &'static str)>,
    pub provider: &'static str,
    pub request_body: Option<Duration>,
    pub resolution: Option<Duration>,
    pub provider_headers: Option<Duration>,
}

impl RequestObservation {
    fn with_state<R>(&self, update: impl FnOnce(&mut State) -> R) -> R {
        update(&mut self.0.lock().unwrap_or_else(PoisonError::into_inner))
    }

    /// The first recorded error wins: it is the one closest to the cause.
    pub(crate) fn record_error(&self, origin: ErrorOrigin, reason: &'static str) {
        self.with_state(|state| {
            state.error.get_or_insert((origin, reason));
        });
    }

    pub(crate) fn record_provider(&self, provider: &'static str) {
        self.with_state(|state| state.provider = Some(provider));
    }

    pub(crate) fn record_phase(&self, phase: Phase, duration: Duration) {
        let provider = self.with_state(|state| {
            match phase {
                Phase::RequestBody => state.request_body = Some(duration),
                Phase::Resolution | Phase::ModelCatalog => state.resolution = Some(duration),
                Phase::ProviderHeaders => state.provider_headers = Some(duration),
            }
            state.provider.unwrap_or("none")
        });
        super::metrics::phase_finished(phase.as_str(), provider, duration);
    }

    pub(super) fn summary(&self) -> Summary {
        self.with_state(|state| Summary {
            error: state.error,
            provider: state.provider.unwrap_or("none"),
            request_body: state.request_body,
            resolution: state.resolution,
            provider_headers: state.provider_headers,
        })
    }
}
