//! Official Anthropic v1 operations relayed without translation.
use axum::http::Method;

use crate::resolution::ApiFormat;

/// Messages is the only inference operation. Token counting returns the native
/// count unchanged and is never recorded as billable usage; models listing is a
/// GET proxy of Anthropic's catalog.
#[derive(Clone, Copy)]
pub enum AnthropicRoute {
    Messages,
    CountTokens,
    Models,
}

impl AnthropicRoute {
    pub(super) fn method(self) -> Method {
        match self {
            Self::Models => Method::GET,
            Self::Messages | Self::CountTokens => Method::POST,
        }
    }

    pub(super) fn path(self) -> &'static str {
        match self {
            Self::Messages => "/messages",
            Self::CountTokens => "/messages/count_tokens",
            Self::Models => "/models",
        }
    }

    pub(super) fn captures_generation(self) -> bool {
        matches!(self, Self::Messages)
    }

    pub(super) fn api_format(self) -> ApiFormat {
        match self {
            Self::Messages | Self::CountTokens | Self::Models => ApiFormat::AnthropicMessages,
        }
    }
}

#[cfg(test)]
mod tests;
