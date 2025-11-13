#![cfg(feature = "test-util")]

use crate::SimpleRow;
use clickhouse::{Client, test};
use std::time::Duration;

async fn test_provide() {
    let mock = test::Mock::new();
    let client = Client::default().with_mock(&mock);
    let expected = vec![SimpleRow::new(1, "one"), SimpleRow::new(2, "two")];

    // FIXME: &expected is not allowed due to new trait bounds
    mock.add(test::handlers::provide(expected.clone()));

    let actual = crate::fetch_rows::<SimpleRow>(&client, "doesn't matter").await;
    assert_eq!(actual, expected);
}

#[tokio::test]
async fn provide() {
    test_provide().await;

    // Same but with the advanced time.
    tokio::time::pause();
    tokio::time::advance(Duration::from_secs(100_000)).await;
    test_provide().await;
}

#[tokio::test]
async fn client_with_url() {
    let mock = test::Mock::new();

    // Existing usages before `with_mock()` was introduced should not silently break.
    let client = Client::default().with_url(mock.url());
    let expected = vec![SimpleRow::new(1, "one"), SimpleRow::new(2, "two")];

    // FIXME: &expected is not allowed due to new trait bounds
    mock.add(test::handlers::provide(expected.clone()));

    let actual = crate::fetch_rows::<SimpleRow>(&client, "doesn't matter").await;
    assert_eq!(actual, expected);
}
