//! Official `OpenAI` v1 operations relayed without translation.
use axum::http::Method;

use crate::resolution::ApiFormat;

/// Compact is Responses JSON; models listing is GET with no request query
/// forwarding and no generation ingest.
#[derive(Clone, Copy)]
pub enum OpenAiRoute {
    Responses,
    ResponsesCompact,
    Models,
}

impl OpenAiRoute {
    pub(super) fn method(self) -> Method {
        match self {
            Self::Models => Method::GET,
            Self::Responses | Self::ResponsesCompact => Method::POST,
        }
    }

    pub(super) fn path(self) -> &'static str {
        match self {
            Self::Responses => "/responses",
            Self::ResponsesCompact => "/responses/compact",
            Self::Models => "/models",
        }
    }

    pub(super) fn captures_generation(self) -> bool {
        !matches!(self, Self::Models)
    }

    /// The API format Web resolves for this route; all current routes use the
    /// Responses connection.
    pub(super) fn api_format(self) -> ApiFormat {
        match self {
            Self::Responses | Self::ResponsesCompact | Self::Models => ApiFormat::OpenAiResponses,
        }
    }
}
