use crate::get_client;
use clickhouse::query::Query;
use clickhouse::{Client, RowOwned, RowRead};

#[tokio::test]
async fn default_user() {
    let client = &get_client();

    test_fetch(client).await;
    test_fetch_one(client).await;
    test_fetch_all(client).await;
    test_fetch_optional(client).await;
    test_fetch_bytes(client).await;
}

/// Readonly user with `readonly=1` cannot modify the `readonly` setting.
/// However, explicitly setting `readonly=1` is still allowed by the server.
#[tokio::test]
async fn readonly_user() {
    let database = test_database_name!();
    let client = crate::_priv::prepare_database(&database).await;
    let client = &crate::create_readonly_user(&client, &database).await;

    let res = run_fetch(select_readonly_setting_query(client)).await;
    assert_eq!(res.value, "1");

    let res: String = run_fetch_one(select_readonly_setting_query(client)).await;
    assert_eq!(res, "1");

    let res: Vec<String> = run_fetch_all(select_readonly_setting_query(client)).await;
    assert_eq!(res, vec!["1"]);

    let res: Option<String> = run_fetch_optional(select_readonly_setting_query(client)).await;
    assert_eq!(res.as_deref(), Some("1"));

    let res = run_fetch_bytes(select_readonly_setting_query(client)).await;
    assert_eq!(res, b"1\n");
}

async fn test_fetch(client: &Client) {
    let query = select_readonly_setting_query(client);
    let initial_readonly_row = run_fetch(query).await;
    assert_eq!(
        initial_readonly_row.value, "1",
        "initial `fetch` readonly setting value should be 1"
    );

    let query = select_readonly_setting_query(client).with_option("readonly", "0");
    let disabled_readonly_row = run_fetch(query).await;
    assert_eq!(
        disabled_readonly_row.value, "0",
        "`fetch` modified readonly setting value should be 0"
    );

    let query = select_readonly_setting_query(client).with_option("readonly", "1");
    let same_readonly_row = run_fetch(query).await;
    assert_eq!(
        same_readonly_row.value, "1",
        "`fetch` should allow setting the same readonly setting value"
    );
}

async fn test_fetch_bytes(client: &Client) {
    let query = select_readonly_setting_query(client);
    let initial_readonly_value = run_fetch_bytes(query).await;
    assert_eq!(
        initial_readonly_value, b"1\n",
        "initial `fetch_bytes` readonly setting value should be 1"
    );

    let query = select_readonly_setting_query(client).with_option("readonly", "0");
    let disabled_readonly_value = run_fetch_bytes(query).await;
    assert_eq!(
        disabled_readonly_value, b"0\n",
        "`fetch_bytes` modified readonly setting value should be 0"
    );

    let query = select_readonly_setting_query(client).with_option("readonly", "1");
    let same_readonly_value = run_fetch_bytes(query).await;
    assert_eq!(
        same_readonly_value, b"1\n",
        "`fetch_bytes` should allow setting the same readonly setting value"
    );
}

async fn test_fetch_one(client: &Client) {
    let query = select_readonly_setting_query(client);
    let initial_readonly_value: String = run_fetch_one(query).await;
    assert_eq!(
        initial_readonly_value, "1",
        "initial `fetch_one` readonly setting value should be 1"
    );

    let query = select_readonly_setting_query(client).with_option("readonly", "0");
    let disabled_readonly_value: String = run_fetch_one(query).await;
    assert_eq!(
        disabled_readonly_value, "0",
        "`fetch_one` modified readonly setting value should be 0"
    );

    let query = select_readonly_setting_query(client).with_option("readonly", "1");
    let same_readonly_value: String = run_fetch_one(query).await;
    assert_eq!(
        same_readonly_value, "1",
        "`fetch_one` should allow setting the same readonly setting value"
    );
}

async fn test_fetch_optional(client: &Client) {
    let query = select_readonly_setting_query(client);
    let initial_readonly_value: Option<String> = run_fetch_optional(query).await;
    assert_eq!(
        initial_readonly_value.as_deref(),
        Some("1"),
        "initial `fetch_optional` readonly setting value should be 1"
    );

    let query = select_readonly_setting_query(client).with_option("readonly", "0");
    let disabled_readonly_value: Option<String> = run_fetch_optional(query).await;
    assert_eq!(
        disabled_readonly_value.as_deref(),
        Some("0"),
        "`fetch_optional` modified readonly setting value should be 0"
    );

    let query = select_readonly_setting_query(client).with_option("readonly", "1");
    let same_readonly_value: Option<String> = run_fetch_optional(query).await;
    assert_eq!(
        same_readonly_value.as_deref(),
        Some("1"),
        "`fetch_optional` should allow setting the same readonly setting value"
    );
}

async fn test_fetch_all(client: &Client) {
    let query = select_readonly_setting_query(client);
    let initial_readonly_value: Vec<String> = run_fetch_all(query).await;
    assert_eq!(
        initial_readonly_value,
        vec!["1"],
        "initial `fetch_all` readonly setting value should be 1"
    );

    let query = select_readonly_setting_query(client).with_option("readonly", "0");
    let disabled_readonly_value: Vec<String> = run_fetch_all(query).await;
    assert_eq!(
        disabled_readonly_value,
        vec!["0"],
        "`fetch_all` modified readonly setting value should be 0"
    );

    let query = select_readonly_setting_query(client).with_option("readonly", "1");
    let same_readonly_value: Vec<String> = run_fetch_all(query).await;
    assert_eq!(
        same_readonly_value,
        vec!["1"],
        "`fetch_all` should allow setting the same readonly setting value"
    );
}

fn select_readonly_setting_query(client: &Client) -> Query {
    client.query("SELECT value FROM system.settings WHERE name = 'readonly'")
}

async fn run_fetch(query: Query) -> SystemSettingsRow {
    let mut cursor = query.fetch::<SystemSettingsRow>().unwrap();

    let row = cursor.next().await.unwrap();
    assert!(row.is_some());

    let row = row.unwrap();
    assert!(
        cursor.next().await.unwrap().is_none(),
        "expected only one row"
    );

    row
}

async fn run_fetch_bytes(query: Query) -> Vec<u8> {
    let bytes = query
        .fetch_bytes("LineAsString")
        .unwrap()
        .collect()
        .await
        .unwrap();
    bytes.to_vec()
}

async fn run_fetch_one<T: RowOwned + RowRead>(query: Query) -> T {
    query.fetch_one::<T>().await.unwrap()
}

async fn run_fetch_optional<T: RowOwned + RowRead>(query: Query) -> Option<T> {
    query.fetch_optional::<T>().await.unwrap()
}

async fn run_fetch_all<T: RowOwned + RowRead>(query: Query) -> Vec<T> {
    query.fetch_all::<T>().await.unwrap()
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct SystemSettingsRow {
    value: String,
}
