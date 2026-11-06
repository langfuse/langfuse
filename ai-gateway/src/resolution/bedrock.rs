//! Bedrock runtime URL checks, kept apart from the single-origin providers.
use super::ApiFormat;

/// Each API format has its own path on the regional runtime host, so a URL for one
/// format can never be used to send credentials for another.
pub(super) fn allows_runtime_base_url(api_format: ApiFormat, base_url: &str) -> bool {
    let path = match api_format {
        ApiFormat::OpenAiResponses | ApiFormat::OpenAiChatCompletions => "/openai/v1",
        ApiFormat::AnthropicMessages => "/anthropic/v1",
    };
    base_url
        .strip_prefix("https://bedrock-runtime.")
        .and_then(|rest| rest.strip_suffix(path))
        .and_then(|host| host.strip_suffix(".amazonaws.com"))
        .is_some_and(is_aws_region)
}

/// Matches region names such as `us-east-1` or `us-gov-west-1`. Web validates
/// the same shape, so the region stays a single DNS label.
fn is_aws_region(region: &str) -> bool {
    let parts: Vec<&str> = region.split('-').collect();
    let [geography, middle @ .., number] = parts.as_slice() else {
        return false;
    };
    geography.len() == 2
        && geography.bytes().all(|byte| byte.is_ascii_lowercase())
        && !middle.is_empty()
        && middle
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_lowercase()))
        && !number.is_empty()
        && number.bytes().all(|byte| byte.is_ascii_digit())
}
