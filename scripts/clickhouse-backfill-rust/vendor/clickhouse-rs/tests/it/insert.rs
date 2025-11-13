use crate::{SimpleRow, create_simple_table, fetch_rows, flush_query_log};
use clickhouse::insert::Insert;
use clickhouse::{Row, sql::Identifier};
use serde::{Deserialize, Serialize};
use std::panic::AssertUnwindSafe;

#[tokio::test]
async fn keeps_client_options() {
    let table_name = "insert_keeps_client_options";
    let query_id = uuid::Uuid::new_v4().to_string();
    let (client_setting_name, client_setting_value) = ("max_block_size", "1000");
    let (insert_setting_name, insert_setting_value) = ("async_insert", "1");

    let client = prepare_database!().with_option(client_setting_name, client_setting_value);
    create_simple_table(&client, table_name).await;

    let row = SimpleRow::new(42, "foo");

    let mut insert = client
        .insert::<SimpleRow>(table_name)
        .await
        .unwrap()
        .with_option(insert_setting_name, insert_setting_value)
        .with_option("query_id", &query_id);

    insert.write(&row).await.unwrap();
    insert.end().await.unwrap();

    flush_query_log(&client).await;

    let (has_insert_setting, has_client_setting) = client
        .query(&format!(
            "
            SELECT
              Settings['{insert_setting_name}'] = '{insert_setting_value}',
              Settings['{client_setting_name}'] = '{client_setting_value}'
            FROM system.query_log
            WHERE query_id = ?
            AND type = 'QueryFinish'
            AND query_kind = 'Insert'
            "
        ))
        .bind(&query_id)
        .fetch_one::<(bool, bool)>()
        .await
        .unwrap();

    assert!(
        has_insert_setting,
        "{}",
        format!(
            "should contain {insert_setting_name} = {insert_setting_value} (from the insert options)"
        )
    );
    assert!(
        has_client_setting,
        "{}",
        format!(
            "should contain {client_setting_name} = {client_setting_value} (from the client options)"
        )
    );

    let rows = fetch_rows::<SimpleRow>(&client, table_name).await;
    assert_eq!(rows, vec!(row))
}

#[tokio::test]
async fn overrides_client_options() {
    let table_name = "insert_overrides_client_options";
    let query_id = uuid::Uuid::new_v4().to_string();
    let (setting_name, setting_value, override_value) = ("async_insert", "0", "1");

    let client = prepare_database!().with_option(setting_name, setting_value);
    create_simple_table(&client, table_name).await;

    let row = SimpleRow::new(42, "foo");

    let mut insert = client
        .insert::<SimpleRow>(table_name)
        .await
        .unwrap()
        .with_option(setting_name, override_value)
        .with_option("query_id", &query_id);

    insert.write(&row).await.unwrap();
    insert.end().await.unwrap();

    flush_query_log(&client).await;

    let has_setting_override = client
        .query(&format!(
            "
            SELECT Settings['{setting_name}'] = '{override_value}'
            FROM system.query_log
            WHERE query_id = ?
            AND type = 'QueryFinish'
            AND query_kind = 'Insert'
            "
        ))
        .bind(&query_id)
        .fetch_one::<bool>()
        .await
        .unwrap();

    assert!(
        has_setting_override,
        "{}",
        format!("should contain {setting_name} = {override_value} (from the insert options)")
    );

    let rows = fetch_rows::<SimpleRow>(&client, table_name).await;
    assert_eq!(rows, vec!(row))
}

#[tokio::test]
async fn empty_insert() {
    // https://github.com/ClickHouse/clickhouse-rs/issues/137

    let table_name = "insert_empty";
    let query_id = uuid::Uuid::new_v4().to_string();

    let client = prepare_database!();
    create_simple_table(&client, table_name).await;

    let insert = client
        .insert::<SimpleRow>(table_name)
        .await
        .unwrap()
        .with_option("query_id", &query_id);
    insert.end().await.unwrap();

    let rows = fetch_rows::<SimpleRow>(&client, table_name).await;
    assert!(rows.is_empty())
}

#[tokio::test]
async fn rename_insert() {
    #[derive(Debug, Row, Serialize, Deserialize, PartialEq)]
    #[serde(rename_all = "camelCase")]
    struct RenameRow {
        #[serde(rename = "fixId")]
        pub(crate) fix_id: u64,
        #[serde(rename = "extComplexId")]
        pub(crate) complex_id: String,
        pub(crate) ext_float: f64,
    }

    let table_name = "insert_rename";
    let query_id = uuid::Uuid::new_v4().to_string();

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE ?(
              fixId UInt64,
              extComplexId String,
              extFloat Float64
            )
            ENGINE = MergeTree
            ORDER BY fixId
            ",
        )
        .bind(Identifier(table_name))
        .execute()
        .await
        .unwrap();

    let row = RenameRow {
        fix_id: 42,
        complex_id: String::from("foo"),
        ext_float: 0.5,
    };

    let mut insert = client
        .insert::<RenameRow>(table_name)
        .await
        .unwrap()
        .with_option("query_id", &query_id);

    insert.write(&row).await.unwrap();
    insert.end().await.unwrap();

    flush_query_log(&client).await;

    let rows = fetch_rows::<RenameRow>(&client, table_name).await;
    assert_eq!(rows, vec!(row))
}

#[tokio::test]
async fn insert_from_cursor() {
    #[derive(Debug, Row, Serialize, Deserialize, PartialEq)]
    struct BorrowedRow<'a> {
        id: u64,
        data: &'a str,
    }

    let client = prepare_database!();
    create_simple_table(&client, "test").await;

    // Fill the table with initial data.
    let mut insert = client.insert::<BorrowedRow<'_>>("test").await.unwrap();
    for (i, data) in ["foo", "bar"].iter().enumerate() {
        let row = BorrowedRow { id: i as _, data };
        insert.write(&row).await.unwrap();
    }
    insert.end().await.unwrap();

    // Fetch the rows and insert them back.
    let mut cursor = client
        .query("SELECT id, data FROM test")
        .fetch::<BorrowedRow<'_>>()
        .unwrap();

    let mut insert = client.insert::<BorrowedRow<'_>>("test").await.unwrap();
    while let Some(row) = cursor.next().await.unwrap() {
        insert.write(&row).await.unwrap();
    }
    insert.end().await.unwrap();

    // Verify that the rows were inserted correctly.
    let mut cursor = client
        .query("SELECT id, data FROM test ORDER BY id")
        .fetch::<BorrowedRow<'_>>()
        .unwrap();
    assert_eq!(
        cursor.next().await.unwrap().as_ref(),
        Some(&BorrowedRow { id: 0, data: "foo" })
    );
    assert_eq!(
        cursor.next().await.unwrap().as_ref(),
        Some(&BorrowedRow { id: 0, data: "foo" })
    );
    assert_eq!(
        cursor.next().await.unwrap().as_ref(),
        Some(&BorrowedRow { id: 1, data: "bar" })
    );
    assert_eq!(
        cursor.next().await.unwrap().as_ref(),
        Some(&BorrowedRow { id: 1, data: "bar" })
    );
    assert_eq!(cursor.next().await.unwrap(), None);
}

#[tokio::test]
async fn cache_row_metadata() {
    #[derive(clickhouse::Row, serde::Serialize)]
    struct Foo {
        bar: i32,
        baz: String,
    }

    let db_name = test_database_name!();
    let table_name = "foo";

    let client = crate::_priv::prepare_database(&db_name)
        .await
        .with_validation(true);

    client
        .query("CREATE TABLE foo(bar Int32, baz String) ENGINE = MergeTree PRIMARY KEY(bar)")
        .execute()
        .await
        .unwrap();

    // Ensure `system.query_log` is fully written
    flush_query_log(&client).await;

    let count_query = "SELECT count() FROM system.query_log WHERE query LIKE ? || '%'";

    let row_insert_metadata_query =
        clickhouse::_priv::row_insert_metadata_query(&db_name, table_name);

    println!("row_insert_metadata_query: {row_insert_metadata_query:?}");

    let initial_count: u64 = client
        .query(count_query)
        .bind(&row_insert_metadata_query)
        .fetch_one()
        .await
        .unwrap();

    let mut insert = client.insert::<Foo>(table_name).await.unwrap();

    insert
        .write(&Foo {
            bar: 1,
            baz: "Hello, world!".to_string(),
        })
        .await
        .unwrap();

    insert.end().await.unwrap();

    // Ensure `system.query_log` is fully written
    flush_query_log(&client).await;

    let after_insert: u64 = client
        .query(count_query)
        .bind(&row_insert_metadata_query)
        .fetch_one()
        .await
        .unwrap();

    // If the database server has not been reset between test runs, `initial_count` will be nonzero.
    //
    // Instead, of asserting a specific value, we assert that the count has changed.
    assert_ne!(after_insert, initial_count);

    let mut insert = client.insert::<Foo>(table_name).await.unwrap();

    insert
        .write(&Foo {
            bar: 2,
            baz: "Hello, ClickHouse!".to_string(),
        })
        .await
        .unwrap();

    insert.end().await.unwrap();

    flush_query_log(&client).await;

    let final_count: u64 = client
        .query(count_query)
        .bind(&row_insert_metadata_query)
        .fetch_one()
        .await
        .unwrap();

    // Insert metadata is cached, so we should not have queried this table again.
    assert_eq!(final_count, after_insert);
}

#[tokio::test]
async fn clear_cached_metadata() {
    #[derive(clickhouse::Row, serde::Serialize)]
    struct Foo {
        bar: i32,
        baz: String,
    }

    #[derive(
        clickhouse::Row,
        serde::Serialize,
        serde::Deserialize,
        PartialEq,
        Eq,
        Debug
    )]
    struct Foo2 {
        bar: i32,
    }

    let client = prepare_database!().with_validation(true);

    client
        .query("CREATE TABLE foo(bar Int32, baz String) ENGINE = MergeTree PRIMARY KEY(bar)")
        .execute()
        .await
        .unwrap();

    let mut insert = client.insert::<Foo>("foo").await.unwrap();

    insert
        .write(&Foo {
            bar: 1,
            baz: "Hello, world!".to_string(),
        })
        .await
        .unwrap();

    insert.end().await.unwrap();

    client
        .query("ALTER TABLE foo DROP COLUMN baz")
        .execute()
        .await
        .unwrap();

    let mut insert = client.insert::<Foo>("foo").await.unwrap();

    insert
        .write(&Foo {
            bar: 2,
            baz: "Hello, ClickHouse!".to_string(),
        })
        .await
        .unwrap();

    dbg!(
        insert
            .end()
            .await
            .expect_err("Insert metadata is invalid; this should error!")
    );

    client.clear_cached_metadata().await;

    let write_invalid = AssertUnwindSafe(async {
        let mut insert = client.insert::<Foo>("foo").await.unwrap();

        insert
            .write(&Foo {
                bar: 2,
                baz: "Hello, ClickHouse!".to_string(),
            })
            .await
            .expect_err("`Foo` should no longer be valid for the table");
    });

    assert_panic_msg!(write_invalid, ["bar", "baz"]);

    let mut insert = client.insert::<Foo2>("foo").await.unwrap();

    insert.write(&Foo2 { bar: 3 }).await.unwrap();

    insert.end().await.unwrap();

    let rows = client
        .query("SELECT * FROM foo ORDER BY bar")
        .fetch_all::<Foo2>()
        .await
        .unwrap();

    assert_eq!(*rows, [Foo2 { bar: 1 }, Foo2 { bar: 3 }]);
}

#[tokio::test]
async fn insert_with_role() {
    #[derive(serde::Serialize, serde::Deserialize, clickhouse::Row)]
    struct Foo {
        bar: u64,
        baz: String,
    }

    let db_name = test_database_name!();

    let admin_client = crate::_priv::prepare_database(&db_name).await;

    let (user_client, role) = crate::create_user_and_role(&admin_client, &db_name).await;

    admin_client
        .query(
            "CREATE TABLE foo(\
            bar UInt64, \
            baz String\
        ) \
        ENGINE = MergeTree \
        PRIMARY KEY(bar)",
        )
        .execute()
        .await
        .unwrap();

    let foos = [
        "lorem ipsum",
        "dolor sit amet",
        "consectetur adipiscing elit",
    ]
    .into_iter()
    .enumerate()
    .map(|(bar, baz)| Foo {
        bar: bar as u64,
        baz: baz.to_string(),
    })
    .collect::<Vec<_>>();

    let insert_foos = async |mut insert: Insert<Foo>| {
        for foo in &foos {
            insert.write(foo).await?;
        }

        insert.end().await
    };

    insert_foos(user_client.insert("foo").await.unwrap())
        .await
        .expect_err("user should not be able to insert into `foo`");

    admin_client
        .query("GRANT INSERT ON ?.foo TO ?")
        .bind(Identifier(&db_name))
        .bind(Identifier(&role))
        .execute()
        .await
        .unwrap();

    // We haven't set the role yet
    insert_foos(user_client.insert("foo").await.unwrap())
        .await
        .expect_err("user should not be able to insert into `foo`");

    insert_foos(
        user_client
            .clone()
            .with_roles([&role])
            .insert("foo")
            .await
            .unwrap(),
    )
    .await
    .expect_err("user should be able to insert into `foo` now");

    // Roles should not propagate back to the parent instance
    insert_foos(user_client.insert("foo").await.unwrap())
        .await
        .expect_err("user should not be able to insert into `foo`");

    insert_foos(user_client.insert("foo").await.unwrap().with_roles([&role]))
        .await
        .expect_err("user should be able to insert into `foo` now");

    // `with_default_roles` should clear the role
    insert_foos(
        user_client
            .clone()
            .with_roles([&role])
            .insert("foo")
            .await
            .unwrap()
            .with_default_roles(),
    )
    .await
    .expect_err("user should not be able to insert into `foo`");
}
