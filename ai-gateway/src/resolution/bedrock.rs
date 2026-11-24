//! Bedrock runtime URL checks, kept apart from the single-origin providers.
use super::ApiFormat;

/// Each API format has its own path on the regional runtime host, so a URL for one
/// format can never be used to send credentials for another.
pub(super) fn allows_runtime_base_url(api_format: ApiFormat, base_url: &str) -> bool {
    let path = match api_format {
        ApiFormat::OpenAiResponses | ApiFormat::OpenAiChatCompletions => "/openai/v1",
        ApiFormat::AnthropicMessages => "/anthropic/v1",
        ApiFormat::OpenAiDecisions | ApiFormat::OpenAiEmbeddings => return false,
    };
    base_url
        .strip_prefix("https://bedrock-runtime.")
        .and_then(|rest| rest.strip_suffix(path))
        .and_then(|host| host.strip_suffix(".amazonaws.com"))
        .is_some_and(is_aws_region)
}

/// Matches region names such as `us-east-1` or `us-gov-west-1`. Web validates
/// the same shape, so the region stays a single DNS label.
pub(crate) fn is_aws_region(region: &str) -> bool {
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

const MAX_GUARDRAIL_ID_BYTES: usize = 2048;

/// Matches AWS Bedrock's `ApplyGuardrail` `guardrailIdentifier` URI parameter:
/// either a lowercase alphanumeric ID or a Bedrock guardrail ARN.
pub(crate) fn is_guardrail_id(id: &str) -> bool {
    if id.is_empty() || id.len() > MAX_GUARDRAIL_ID_BYTES {
        return false;
    }
    if is_lower_alnum(id) {
        return true;
    }
    let parts: Vec<&str> = id.split(':').collect();
    let [arn, partition, service, region, account, resource] = parts.as_slice() else {
        return false;
    };
    let valid_partition = *partition == "aws"
        || partition
            .strip_prefix("aws-")
            .is_some_and(|suffix| !suffix.is_empty() && is_lower_alnum_dash(suffix));
    let valid_region = (1..=20).contains(&region.len()) && is_lower_alnum_dash(region);
    let valid_account = account.len() == 12 && account.bytes().all(|byte| byte.is_ascii_digit());
    let valid_resource = resource
        .strip_prefix("guardrail/")
        .is_some_and(is_lower_alnum);
    *arn == "arn"
        && valid_partition
        && *service == "bedrock"
        && valid_region
        && valid_account
        && valid_resource
}

/// Matches AWS Bedrock's `ApplyGuardrail` `guardrailVersion` URI parameter:
/// `DRAFT` or a 1–8 digit positive integer (`[1-9][0-9]{0,7}`).
pub(crate) fn is_guardrail_version(version: &str) -> bool {
    if version == "DRAFT" {
        return true;
    }
    let bytes = version.as_bytes();
    (1..=8).contains(&bytes.len())
        && bytes
            .first()
            .is_some_and(|first| matches!(first, b'1'..=b'9'))
        && bytes.iter().all(u8::is_ascii_digit)
}

fn is_lower_alnum(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
}

fn is_lower_alnum_dash(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_bedrock_guardrail_identifiers_and_versions() {
        for valid in [
            "abc123def456",
            "arn:aws:bedrock:us-east-1:123456789012:guardrail/abc123def456",
            "arn:aws-us-gov:bedrock:us-gov-west-1:123456789012:guardrail/gr1",
        ] {
            assert!(is_guardrail_id(valid), "{valid}");
        }
        for invalid in [
            "",
            "ABC123",
            "abc/def",
            "../other",
            "arn:aws:bedrock:us-east-1:12345:guardrail/abc123",
            "arn:aws:s3:us-east-1:123456789012:guardrail/abc123",
            "arn:aws:bedrock:us-east-1:123456789012:guardrail/abc/def",
        ] {
            assert!(!is_guardrail_id(invalid), "{invalid}");
        }

        for valid in ["1", "42", "99999999", "DRAFT"] {
            assert!(is_guardrail_version(valid), "{valid}");
        }
        for invalid in ["", "0", "01", "123456789", "draft", "../1"] {
            assert!(!is_guardrail_version(invalid), "{invalid}");
        }
    }
}
