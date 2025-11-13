use serde::{Deserialize, Serialize};

use clickhouse::sql::Identifier;
use clickhouse::{Row, error::Error};

#[tokio::test]
async fn smoke() {
    let client = prepare_database!();

    #[derive(Debug, Row, Serialize, Deserialize)]
    struct MyRow<'a> {
        no: u32,
        name: &'a str,
    }

    // Create a table.
    client
        .query(
            "
            CREATE TABLE test(no UInt32, name LowCardinality(String))
            ENGINE = MergeTree
            ORDER BY no
        ",
        )
        .execute()
        .await
        .unwrap();

    // Write to the table.
    let mut insert = client.insert::<MyRow<'_>>("test").await.unwrap();
    for i in 0..1000 {
        insert.write(&MyRow { no: i, name: "foo" }).await.unwrap();
    }

    insert.end().await.unwrap();

    // Read from the table.
    let mut cursor = client
        .query("SELECT ?fields FROM test WHERE name = ? AND no BETWEEN ? AND ?.2")
        .bind("foo")
        .bind(500)
        .bind((42, 504))
        .fetch::<MyRow<'_>>()
        .unwrap();

    let mut i = 500;

    while let Some(row) = cursor.next().await.unwrap() {
        assert_eq!(row.no, i);
        assert_eq!(row.name, "foo");
        i += 1;
    }
}

#[tokio::test]
async fn fetch_one_and_optional() {
    let client = prepare_database!();

    client
        .query("CREATE TABLE test(n String) ENGINE = MergeTree ORDER BY n")
        .execute()
        .await
        .unwrap();

    let q = "SELECT * FROM test";
    let got_string = client.query(q).fetch_optional::<String>().await.unwrap();
    assert_eq!(got_string, None);

    let got_string = client.query(q).fetch_one::<String>().await;
    assert!(matches!(got_string, Err(Error::RowNotFound)));

    #[derive(Serialize, Row)]
    struct Row {
        n: String,
    }

    let mut insert = client.insert::<Row>("test").await.unwrap();
    insert.write(&Row { n: "foo".into() }).await.unwrap();
    insert.write(&Row { n: "bar".into() }).await.unwrap();
    insert.end().await.unwrap();

    let got_string = client.query(q).fetch_optional::<String>().await.unwrap();
    assert_eq!(got_string, Some("bar".into()));

    let got_string = client.query(q).fetch_one::<String>().await.unwrap();
    assert_eq!(got_string, "bar");
}

#[tokio::test]
async fn server_side_param() {
    let client = prepare_database!();

    let result = client
        .query("SELECT plus({val1: Int32}, {val2: Int32}) AS result")
        .param("val1", 42)
        .param("val2", 144)
        .fetch_one::<i64>()
        .await
        .expect("failed to fetch Int64");
    assert_eq!(result, 186);

    let result = client
        .query("SELECT {val1: String} AS result")
        .param("val1", "string")
        .fetch_one::<String>()
        .await
        .expect("failed to fetch string");
    assert_eq!(result, "string");

    let result = client
        .query("SELECT {val1: String} AS result")
        .param("val1", "\x01\x02\x03\\ \"\'")
        .fetch_one::<String>()
        .await
        .expect("failed to fetch string");
    assert_eq!(result, "\x01\x02\x03\\ \"\'");

    let result = client
        .query("SELECT {val1: Array(String)} AS result")
        .param("val1", vec!["a", "bc"])
        .fetch_one::<Vec<String>>()
        .await
        .expect("failed to fetch string");
    assert_eq!(result, &["a", "bc"]);
}

// See #19.
#[tokio::test]
async fn long_query() {
    let client = prepare_database!();

    client
        .query("CREATE TABLE test(n String) ENGINE = MergeTree ORDER BY n")
        .execute()
        .await
        .unwrap();

    let long_string = "A".repeat(100_000);

    let got_string = client
        .query("select ?")
        .bind(&long_string)
        .fetch_one::<String>()
        .await
        .unwrap();

    assert_eq!(got_string, long_string);
}

// See #22.
#[tokio::test]
async fn big_borrowed_str() {
    let client = prepare_database!();

    #[derive(Debug, Row, Serialize, Deserialize)]
    struct MyRow<'a> {
        no: u32,
        body: &'a str,
    }

    client
        .query("CREATE TABLE test(no UInt32, body String) ENGINE = MergeTree ORDER BY no")
        .execute()
        .await
        .unwrap();

    let long_string = "A".repeat(10000);

    let mut insert = client.insert::<MyRow<'_>>("test").await.unwrap();
    insert
        .write(&MyRow {
            no: 0,
            body: &long_string,
        })
        .await
        .unwrap();
    insert.end().await.unwrap();

    let mut cursor = client
        .query("SELECT ?fields FROM test")
        .fetch::<MyRow<'_>>()
        .unwrap();

    let row = cursor.next().await.unwrap().unwrap();
    assert_eq!(row.body, long_string);
}

// See #31.
#[tokio::test]
async fn all_floats() {
    let client = prepare_database!();

    client
        .query("CREATE TABLE test(no UInt32, f Float64) ENGINE = MergeTree ORDER BY no")
        .execute()
        .await
        .unwrap();

    #[derive(Row, Serialize)]
    struct Row {
        no: u32,
        f: f64,
    }

    let mut insert = client.insert::<Row>("test").await.unwrap();
    insert.write(&Row { no: 0, f: 42.5 }).await.unwrap();
    insert.write(&Row { no: 1, f: 43.5 }).await.unwrap();
    insert.end().await.unwrap();

    let vec = client
        .query("SELECT f FROM test")
        .fetch_all::<f64>()
        .await
        .unwrap();

    assert_eq!(vec, &[42.5, 43.5]);
}

#[tokio::test]
async fn keeps_client_options() {
    let (client_setting_name, client_setting_value) = ("max_block_size", "1000");
    let (query_setting_name, query_setting_value) = ("date_time_input_format", "basic");

    let client = prepare_database!().with_option(client_setting_name, client_setting_value);

    let value = client
        .query("SELECT value FROM system.settings WHERE name = ? OR name = ? ORDER BY name")
        .bind(query_setting_name)
        .bind(client_setting_name)
        .with_option(query_setting_name, query_setting_value)
        .fetch_all::<String>()
        .await
        .unwrap();

    // should keep the client options
    assert_eq!(value, vec!(query_setting_value, client_setting_value));
}

#[tokio::test]
async fn overrides_client_options() {
    let (setting_name, setting_value, override_value) = ("max_block_size", "1000", "2000");

    let client = prepare_database!().with_option(setting_name, setting_value);

    let value = client
        .query("SELECT value FROM system.settings WHERE name = ?")
        .bind(setting_name)
        .with_option(setting_name, override_value)
        .fetch_one::<String>()
        .await
        .unwrap();

    // should override the client options
    assert_eq!(value, override_value);
}

#[tokio::test]
async fn prints_query() {
    let client = prepare_database!();

    let q = client.query("SELECT ?fields FROM test WHERE a = ? AND b < ?");
    assert_eq!(
        format!("{}", q.sql_display()),
        "SELECT ?fields FROM test WHERE a = ? AND b < ?"
    );
}

#[tokio::test]
async fn query_with_role() {
    let db_name = test_database_name!();

    let admin_client = crate::_priv::prepare_database(&db_name).await;

    let (user_client, role) = crate::create_user_and_role(&admin_client, &db_name).await;

    admin_client
        .query(
            "CREATE TABLE foo(\
            bar DateTime DEFAULT now(), \
            baz String\
        ) \
        ENGINE = MergeTree \
        PRIMARY KEY(bar)",
        )
        .execute()
        .await
        .unwrap();

    admin_client
        .query("INSERT INTO foo(baz) VALUES ('lorem ipsum'), ('dolor sit amet')")
        .execute()
        .await
        .unwrap();

    user_client
        .query("SELECT * FROM foo")
        .execute()
        .await
        .expect_err("user should not be able to query `foo`");

    admin_client
        .query("GRANT SELECT ON ?.foo TO ?")
        .bind(Identifier(&db_name))
        .bind(Identifier(&role))
        .execute()
        .await
        .unwrap();

    user_client
        .query("SELECT * FROM foo")
        .execute()
        .await
        .expect_err("user should not be able to query `foo`");

    user_client
        .clone()
        .with_roles([&role])
        .query("SELECT * FROM foo")
        .execute()
        .await
        .expect("user should be able to query `foo` now");

    // Roles should not have propagated back to parent instance
    user_client
        .query("SELECT * FROM foo")
        .execute()
        .await
        .expect_err("user should not be able to query `foo`");

    // Test `with_default_roles()`
    user_client
        .clone()
        .with_roles([&role])
        .query("SELECT * FROM foo")
        .with_default_roles()
        .execute()
        .await
        .expect_err("user should not be able to query `foo`");

    user_client
        .query("SELECT * FROM foo")
        .with_roles([&role])
        .execute()
        .await
        .expect("user should be able to query `foo` now");
}
