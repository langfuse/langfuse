use clickhouse::{Client, Row, error::Result, test};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq)]
#[derive(Serialize, Deserialize, Row)]
struct SomeRow {
    no: u32,
}

async fn make_create(client: &Client) -> Result<()> {
    client.query("CREATE TABLE test").execute().await
}

async fn make_select(client: &Client) -> Result<Vec<SomeRow>> {
    client
        .query("SELECT ?fields FROM `who cares`")
        .fetch_all::<SomeRow>()
        .await
}

async fn make_insert(client: &Client, data: &[SomeRow]) -> Result<()> {
    let mut insert = client.insert::<SomeRow>("who cares").await?;
    for row in data {
        insert.write(row).await?;
    }
    insert.end().await
}

#[tokio::main]
async fn main() {
    let mock = test::Mock::new();
    // Note that an explicit `with_url` call is not required,
    // it will be set automatically to the mock server URL.
    let client = Client::default().with_mock(&mock);
    let list = vec![SomeRow { no: 1 }, SomeRow { no: 2 }];

    // How to test DDL.
    let recording = mock.add(test::handlers::record_ddl());
    make_create(&client).await.unwrap();
    assert!(recording.query().await.contains("CREATE TABLE"));

    // How to test SELECT.
    mock.add(test::handlers::provide(list.clone()));
    let rows = make_select(&client).await.unwrap();
    assert_eq!(rows, list);

    // How to test failures.
    mock.add(test::handlers::failure(test::status::FORBIDDEN));
    let reason = make_select(&client).await;
    assert_eq!(format!("{reason:?}"), r#"Err(BadResponse("Forbidden"))"#);

    // How to test INSERT.
    let recording = mock.add(test::handlers::record());
    make_insert(&client, &list).await.unwrap();
    let rows: Vec<SomeRow> = recording.collect().await;
    assert_eq!(rows, list);

    // How to test unsuccessful INSERT.
    mock.add(test::handlers::exception(209));
    let reason = make_insert(&client, &list).await;
    assert_eq!(format!("{reason:?}"), r#"Err(BadResponse("Code: 209"))"#);
}
