#![cfg(feature = "inserter")]

use std::string::ToString;

use serde::Serialize;

use crate::{SimpleRow, create_simple_table, fetch_rows, flush_query_log};
use clickhouse::inserter::Inserter;
use clickhouse::sql::Identifier;
use clickhouse::{Client, Row, inserter::Quantities};

#[derive(Debug, Row, Serialize)]
struct MyRow {
    data: String,
}

impl MyRow {
    fn new(data: impl ToString) -> Self {
        Self {
            data: data.to_string(),
        }
    }
}

async fn create_table(client: &Client) {
    client
        .query("CREATE TABLE test(data String) ENGINE = MergeTree ORDER BY data")
        .execute()
        .await
        .unwrap();
}

#[tokio::test]
async fn force_commit() {
    let client = prepare_database!();
    create_table(&client).await;

    let mut inserter = client.inserter::<MyRow>("test");
    let rows = 100;

    for i in 1..=rows {
        inserter.write(&MyRow::new(i)).await.unwrap();
        assert_eq!(inserter.commit().await.unwrap(), Quantities::ZERO);

        if i % 10 == 0 {
            assert_eq!(inserter.force_commit().await.unwrap().rows, 10);
        }
    }

    assert_eq!(inserter.end().await.unwrap(), Quantities::ZERO);

    let (count, sum) = client
        .query("SELECT count(), sum(toUInt64(data)) FROM test")
        .fetch_one::<(u64, u64)>()
        .await
        .unwrap();

    assert_eq!(count, rows);
    assert_eq!(sum, (1..=rows).sum::<u64>());
}

#[tokio::test]
async fn limited_by_rows() {
    let client = prepare_database!();
    create_table(&client).await;

    let mut inserter = client.inserter::<MyRow>("test").with_max_rows(10);
    let rows = 100;

    for i in (2..=rows).step_by(2) {
        let row = MyRow::new(i - 1);
        inserter.write(&row).await.unwrap();
        let row = MyRow::new(i);
        inserter.write(&row).await.unwrap();

        let inserted = inserter.commit().await.unwrap();
        let pending = inserter.pending();

        if i % 10 == 0 {
            assert_ne!(inserted.bytes, 0);
            assert_eq!(inserted.rows, 10);
            assert_eq!(inserted.transactions, 5);
            assert_eq!(pending, &Quantities::ZERO);
        } else {
            assert_eq!(inserted, Quantities::ZERO);
            assert_ne!(pending.bytes, 0);
            assert_eq!(pending.rows, i % 10);
            assert_eq!(pending.transactions, (i % 10) / 2);
        }
    }

    assert_eq!(inserter.end().await.unwrap(), Quantities::ZERO);

    let (count, sum) = client
        .query("SELECT count(), sum(toUInt64(data)) FROM test")
        .fetch_one::<(u64, u64)>()
        .await
        .unwrap();

    assert_eq!(count, rows);
    assert_eq!(sum, (1..=rows).sum::<u64>());
}

#[tokio::test]
async fn limited_by_bytes() {
    let client = prepare_database!();
    create_table(&client).await;

    let mut inserter = client.inserter::<MyRow>("test").with_max_bytes(100);
    let rows = 100;

    let row = MyRow::new("x".repeat(9));

    for i in 1..=rows {
        inserter.write(&row).await.unwrap();

        let inserted = inserter.commit().await.unwrap();
        let pending = inserter.pending();

        if i % 10 == 0 {
            assert_eq!(inserted.bytes, 100);
            assert_eq!(inserted.rows, 10);
            assert_eq!(inserted.transactions, 10);
            assert_eq!(pending, &Quantities::ZERO);
        } else {
            assert_eq!(inserted, Quantities::ZERO);
            assert_eq!(pending.bytes, (i % 10) * 10);
            assert_eq!(pending.rows, i % 10);
            assert_eq!(pending.transactions, i % 10);
        }
    }

    assert_eq!(inserter.end().await.unwrap(), Quantities::ZERO);

    let count = client
        .query("SELECT count() FROM test")
        .fetch_one::<u64>()
        .await
        .unwrap();

    assert_eq!(count, rows);
}

#[cfg(feature = "test-util")] // only with `tokio::time::Instant`
#[tokio::test(start_paused = true)]
async fn limited_by_time() {
    use std::time::Duration;

    let client = prepare_database!();
    create_table(&client).await;

    let period = Duration::from_secs(1);
    let mut inserter = client.inserter::<MyRow>("test").with_period(Some(period));
    let rows = 100;

    for i in 1..=rows {
        let row = MyRow::new(i);
        inserter.write(&row).await.unwrap();

        tokio::time::sleep(period / 10).await;

        let inserted = inserter.commit().await.unwrap();
        let pending = inserter.pending();

        if i % 10 == 0 {
            assert_ne!(inserted.bytes, 0);
            assert_eq!(inserted.rows, 10);
            assert_eq!(inserted.transactions, 10);
            assert_eq!(pending, &Quantities::ZERO);
        } else {
            assert_eq!(inserted, Quantities::ZERO);
            assert_ne!(pending.bytes, 0);
            assert_eq!(pending.rows, i % 10);
            assert_eq!(pending.transactions, i % 10);
        }
    }

    assert_eq!(inserter.end().await.unwrap(), Quantities::ZERO);

    let (count, sum) = client
        .query("SELECT count(), sum(toUInt64(data)) FROM test")
        .fetch_one::<(u64, u64)>()
        .await
        .unwrap();

    assert_eq!(count, rows);
    assert_eq!(sum, (1..=rows).sum::<u64>());
}

/// Similar to [`crate::insert::keeps_client_options`] with minor differences.
#[tokio::test]
async fn keeps_client_options() {
    let table_name = "inserter_keeps_client_options";
    let query_id = uuid::Uuid::new_v4().to_string();
    let (client_setting_name, client_setting_value) = ("max_block_size", "1000");
    let (insert_setting_name, insert_setting_value) = ("async_insert", "1");

    let client = prepare_database!().with_option(client_setting_name, client_setting_value);
    create_simple_table(&client, table_name).await;

    let row = SimpleRow::new(42, "foo");

    let mut inserter = client
        .inserter::<SimpleRow>(table_name)
        .with_option("async_insert", "1")
        .with_option("query_id", &query_id);

    inserter.write(&row).await.unwrap();
    inserter.end().await.unwrap();

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

/// Similar to [`crate::insert::overrides_client_options`] with minor differences.
#[tokio::test]
async fn overrides_client_options() {
    let table_name = "inserter_overrides_client_options";
    let query_id = uuid::Uuid::new_v4().to_string();
    let (setting_name, setting_value, override_value) = ("async_insert", "0", "1");

    let client = prepare_database!().with_option(setting_name, setting_value);
    create_simple_table(&client, table_name).await;

    let row = SimpleRow::new(42, "foo");

    let mut inserter = client
        .inserter::<SimpleRow>(table_name)
        .with_option("async_insert", override_value)
        .with_option("query_id", &query_id);

    inserter.write(&row).await.unwrap();
    inserter.end().await.unwrap();

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
        format!("should contain {setting_name} = {override_value} (from the inserter options)")
    );

    let rows = fetch_rows::<SimpleRow>(&client, table_name).await;
    assert_eq!(rows, vec!(row))
}

#[tokio::test]
async fn inserter_with_role() {
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

    let insert_foos = async |mut inserter: Inserter<Foo>| {
        for foo in &foos {
            inserter.write(foo).await?;
        }

        inserter.end().await
    };

    insert_foos(user_client.inserter("foo"))
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
    insert_foos(user_client.inserter("foo"))
        .await
        .expect_err("user should not be able to insert into `foo`");

    insert_foos(user_client.clone().with_roles([&role]).inserter("foo"))
        .await
        .expect_err("user should be able to insert into `foo` now");

    // Roles should not propagate back to the parent instance
    insert_foos(user_client.inserter("foo"))
        .await
        .expect_err("user should not be able to insert into `foo`");

    insert_foos(user_client.inserter("foo").with_roles([&role]))
        .await
        .expect_err("user should be able to insert into `foo` now");

    // `with_default_roles` should clear the role
    insert_foos(
        user_client
            .clone()
            .with_roles([&role])
            .inserter("foo")
            .with_default_roles(),
    )
    .await
    .expect_err("user should not be able to insert into `foo`");
}
