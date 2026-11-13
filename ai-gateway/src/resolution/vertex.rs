//! Vertex AI URL checks, kept apart from the single-origin providers.

/// Only the OpenAI-compatible endpoint is routed. The location is both a DNS label
/// of the host and a path segment, and they must agree, so a URL can never send the
/// access token outside Google's Vertex hosts. `global` uses the host without a
/// location label.
pub(super) fn allows_openai_compatible_base_url(base_url: &str) -> bool {
    let Some((host, path)) = base_url
        .strip_prefix("https://")
        .and_then(|rest| rest.split_once('/'))
    else {
        return false;
    };
    let Some((project, location)) = path
        .strip_prefix("v1/projects/")
        .and_then(|rest| rest.strip_suffix("/endpoints/openapi"))
        .and_then(|rest| rest.split_once("/locations/"))
    else {
        return false;
    };
    let host_matches = if location == "global" {
        host == "aiplatform.googleapis.com"
    } else {
        host.strip_suffix("-aiplatform.googleapis.com") == Some(location)
    };
    host_matches && is_segment(project) && is_segment(location)
}

/// Project IDs and locations are lowercase letters, digits and hyphens; Web
/// validates the same shape before building the URL.
fn is_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}
