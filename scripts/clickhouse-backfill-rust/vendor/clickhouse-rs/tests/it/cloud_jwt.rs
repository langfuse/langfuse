use crate::{get_cloud_url, require_env_var};
use clickhouse::Client;

#[tokio::test]
async fn test_jwt_auth() {
    check_cloud_test_env!();
    let valid_token = require_env_var("CLICKHOUSE_CLOUD_JWT_ACCESS_TOKEN");
    let client = Client::default()
        .with_url(get_cloud_url())
        .with_access_token(valid_token);
    let result = client.query("SELECT 42").fetch_one::<u8>().await.unwrap();
    assert_eq!(result, 42);
}

#[tokio::test]
async fn test_invalid_jwt_auth() {
    check_cloud_test_env!();
    let client = Client::default()
        .with_url(get_cloud_url())
        .with_access_token("invalid_token");
    let result = client.query("SELECT 42").fetch_one::<u8>().await;
    let err_msg = format!("{}", result.expect_err("result should be an error"));
    assert!(
        err_msg.contains("JWT decoding error: invalid token supplied"),
        "err_msg = {err_msg}"
    );
}
