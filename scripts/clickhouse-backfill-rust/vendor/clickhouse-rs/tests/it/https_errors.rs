use crate::{get_cloud_url, require_env_var};
use clickhouse::Client;

#[tokio::test]
async fn test_https_error_on_missing_feature() {
    check_cloud_test_env!();
    let valid_token = require_env_var("CLICKHOUSE_CLOUD_JWT_ACCESS_TOKEN");
    let client = Client::default()
        .with_url(get_cloud_url())
        .with_access_token(valid_token);
    let result = client
        .query("SELECT 42")
        .fetch_one::<u8>()
        .await
        .err()
        .map(|e| e.to_string())
        .expect("expected a TLS Error, got Ok instead");

    for fragment in [
        "invalid URL, scheme is not http",
        "HTTPS",
        "`native-tls` or `rustls-tls`",
    ] {
        assert!(
            result.contains(fragment),
            "TLS error message should contain `{fragment}`"
        );
    }
}
