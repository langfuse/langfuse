use crate::capture::ExecutionCapture;
use crate::resolution::ApiFormat;
use crate::test_support::resolved_request_context_with_mode;
use axum::http::{HeaderMap, HeaderValue, header};
use serde_json::json;

#[tokio::test]
async fn gateway_billing_outside_usage_is_kept_in_usage_mode() {
    let context = resolved_request_context_with_mode("provider-secret", "usage").await;
    let mut observer = ExecutionCapture::for_request(
        ApiFormat::OpenAiDecisions,
        &context,
        &HeaderMap::new(),
        br#"{"model":"typesafe-ai/jev","input":"I was charged twice.","questions":[{"type":"choice","name":"department","choices":["billing","other"]}]}"#,
    );
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    observer.record_response(200, &headers);
    // A Vercel Decisions reply, trimmed to its usage and billing.
    let gateway = json!({
        "routing": {"modelAttempts": [{"success": true, "providerAttempts": [
            {"provider": "typesafe-ai", "credentialType": "system", "success": true, "statusCode": 200},
        ]}]},
        "cost": "0.000014994",
    });
    let response = json!({
        "answers": [{"type": "choice", "name": "department", "choice": "billing"}],
        "model": "typesafe-ai/jev",
        "provider_metadata": {"gateway": gateway},
        "usage": {"input_tokens": 357, "output_tokens": 45, "total_tokens": 402},
    });
    observer.push_bytes(response.to_string().as_bytes());
    observer.end_body();
    let (_, facts) = observer.protocol.take().unwrap().into_facts();
    assert_eq!(facts.provider_metadata.unwrap()["gateway"], gateway);
    assert_eq!(facts.usage_details.unwrap()["output_tokens"], 45);
}
