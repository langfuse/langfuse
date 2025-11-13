//! # Integration tests
//!
//! - The `wait_end_of_query` setting that is used for all DDLs forces HTTP response buffering.
//!   We will get the response only when the DDL is executed on every cluster node.
//!   See also: https://clickhouse.com/docs/en/interfaces/http/#response-buffering
//!
//! - When tests are executed against ClickHouse Cloud, `ENGINE = MergeTree` is
//!   automatically replaced with `ENGINE = SharedMergeTree` by the server. In
//!   this case, no modifications to the DDLs are required, unlike on-premise
//!   clusters.
//!
//! - `CLICKHOUSE_TEST_ENVIRONMENT` env variable determines whether we are going
//!   to use a local ClickHouse instance in Docker (`local`, default value) or
//!   ClickHouse Cloud (`cloud`). NB: `cloud` will require one of the TLS
//!   features to be enabled.
//!
//! - ClickHouse server credentials are set via `CLICKHOUSE_CLOUD_HOST`,
//!   `CLICKHOUSE_CLOUD_USER`, and `CLICKHOUSE_CLOUD_PASSWORD`. Specific
//!   Cloud-only tests might also require JWT access token, which should be
//!   provided via `CLICKHOUSE_CLOUD_JWT_ACCESS_TOKEN`.
//!
//! - All tests must use `prepare_database!()` macro if custom tables are
//!   created. This macro will create a new database for each test with
//!   a name suitable for specified test environment. For instance, for
//!   the "cloud" environment, it appends the current timestamp to allow
//!   clean up outdated databases based on its creation time.

use clickhouse::{Client, Row, RowOwned, RowRead, RowWrite, sql::Identifier};
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

macro_rules! assert_err_on_fetch_with_client {
    ($client:ident, $msg_parts:expr, $query:expr) => {
        let err = $client.query($query).fetch_all::<Data>().await;
        assert!(
            err.is_err(),
            "expected an error, but got a result instead: {:?}",
            err.unwrap()
        );

        let err = err.unwrap_err();
        assert!(
            matches!(err, clickhouse::error::Error::SchemaMismatch(_)),
            "expected a SchemaMismatch error, but got: {:?}",
            err,
        );

        let err_msg = err.to_string();
        for &msg in $msg_parts {
            assert!(
                err_msg.contains(msg),
                "error message:\n{err_msg}\ndid not contain the expected part:\n{msg}"
            );
        }
    };
}

macro_rules! assert_err_on_fetch {
    ($msg_parts:expr, $query:expr) => {
        let client = get_client();

        let err = client.query($query).fetch_all::<Data>().await;
        assert!(
            err.is_err(),
            "expected an error, but got a result instead: {:?}",
            err.unwrap()
        );

        let err = err.unwrap_err();
        assert!(
            matches!(err, clickhouse::error::Error::SchemaMismatch(_)),
            "expected a SchemaMismatch error, but got: {:?}",
            err,
        );

        let err_msg = err.to_string();
        for &msg in $msg_parts {
            assert!(
                err_msg.contains(msg),
                "error message:\n{err_msg}\ndid not contain the expected part:\n{msg}"
            );
        }
    };
}

macro_rules! assert_panic_msg {
    ($unwinded:ident, $msg_parts:expr) => {
        use futures_util::FutureExt;
        let result = $unwinded.catch_unwind().await;
        assert!(
            result.is_err(),
            "expected a panic, but got a result instead: {:?}",
            result.unwrap()
        );
        let panic_msg = *result.unwrap_err().downcast::<String>().unwrap();
        for msg in $msg_parts {
            assert!(
                panic_msg.contains(msg),
                "panic message:\n{panic_msg}\ndid not contain the expected part:\n{msg}"
            );
        }
    };
}

macro_rules! prepare_database {
    () => {
        crate::_priv::prepare_database(&test_database_name!()).await
    };
}

macro_rules! test_database_name {
    () => {
        crate::_priv::make_db_name({
            fn f() {}
            std::any::type_name_of_val(&f)
        })
    };
}

macro_rules! check_cloud_test_env {
    () => {
        if $crate::test_env() != $crate::TestEnv::Cloud {
            eprintln!("Skipping test as it is not Cloud only");
            return;
        }
    };
}

pub(crate) fn get_client() -> Client {
    let client = Client::default();

    match test_env() {
        TestEnv::Local => client.with_url("http://localhost:8123"),
        TestEnv::Cloud => client
            .with_url(get_cloud_url())
            .with_user("default")
            .with_password(require_env_var("CLICKHOUSE_CLOUD_PASSWORD")),
    }
}

pub(crate) fn require_env_var(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} environment variable is not set"))
}

pub(crate) fn get_cloud_url() -> String {
    let hostname = require_env_var("CLICKHOUSE_CLOUD_HOST");
    format!("https://{hostname}:8443")
}

#[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
struct SimpleRow {
    id: u64,
    data: String,
}

impl SimpleRow {
    fn new(id: u64, data: impl ToString) -> Self {
        Self {
            id,
            data: data.to_string(),
        }
    }
}

pub(crate) async fn create_simple_table(client: &Client, table_name: &str) {
    client
        .query("CREATE TABLE ?(id UInt64, data String) ENGINE = MergeTree ORDER BY id")
        .with_option("wait_end_of_query", "1")
        .bind(Identifier(table_name))
        .execute()
        .await
        .unwrap();
}

pub(crate) async fn fetch_rows<T>(client: &Client, table_name: &str) -> Vec<T>
where
    T: RowOwned + RowRead,
{
    client
        .query("SELECT ?fields FROM ?")
        .bind(Identifier(table_name))
        .fetch_all::<T>()
        .await
        .unwrap()
}

pub(crate) async fn flush_query_log(client: &Client) {
    client
        .query("SYSTEM FLUSH LOGS")
        .with_option("wait_end_of_query", "1")
        .execute()
        .await
        .unwrap();
}

pub(crate) async fn execute_statements(client: &Client, statements: &[&str]) {
    for statement in statements {
        client
            .query(statement)
            .with_option("wait_end_of_query", "1")
            .execute()
            .await
            .unwrap_or_else(|err| panic!("cannot execute statement '{statement}', cause: {err}"));
    }
}

pub(crate) async fn insert_and_select<T>(
    client: &Client,
    table_name: &str,
    data: impl IntoIterator<Item = T>,
) -> Vec<T>
where
    T: RowOwned + RowRead + RowWrite,
{
    let mut insert = client.insert::<T>(table_name).await.unwrap();
    for row in data.into_iter() {
        insert.write(&row).await.unwrap();
    }
    insert.end().await.unwrap();

    client
        .query("SELECT ?fields FROM ? ORDER BY () ASC")
        .bind(Identifier(table_name))
        .fetch_all::<T>()
        .await
        .unwrap()
}

pub(crate) mod geo_types {
    // See https://clickhouse.com/docs/en/sql-reference/data-types/geo
    pub(crate) type Point = (f64, f64);
    pub(crate) type Ring = Vec<Point>;
    pub(crate) type Polygon = Vec<Ring>;
    pub(crate) type MultiPolygon = Vec<Polygon>;
    pub(crate) type LineString = Vec<Point>;
    pub(crate) type MultiLineString = Vec<LineString>;
}

pub(crate) mod decimals {
    use fixnum::FixedPoint;
    use fixnum::typenum::{U4, U8, U12};

    // See ClickHouse decimal sizes: https://clickhouse.com/docs/en/sql-reference/data-types/decimal
    pub(crate) type Decimal32 = FixedPoint<i32, U4>; // Decimal(9, 4) = Decimal32(4)
    pub(crate) type Decimal64 = FixedPoint<i64, U8>; // Decimal(18, 8) = Decimal64(8)
    pub(crate) type Decimal128 = FixedPoint<i128, U12>; // Decimal(38, 12) = Decimal128(12)
}

mod chrono;
mod cloud_jwt;
mod compression;
mod cursor_error;
mod cursor_stats;
mod fetch_bytes;
mod https_errors;
mod insert;
mod inserter;
mod int128;
mod ip;
mod mock;
mod nested;
mod query;
mod query_readonly;
mod query_syntax;
mod rbwnat_header;
mod rbwnat_smoke;
mod rbwnat_validation;
mod time;
mod user_agent;
mod uuid;
mod variant;

#[derive(Clone, Copy, PartialEq, Eq)]
enum TestEnv {
    Local,
    Cloud,
}

#[allow(clippy::incompatible_msrv)]
fn test_env() -> TestEnv {
    use std::env::{VarError, var};

    static TEST_ENV: LazyLock<TestEnv> =
        LazyLock::new(|| match var("CLICKHOUSE_TEST_ENVIRONMENT") {
            Ok(env) if env == "local" => TestEnv::Local,
            Ok(env) if env == "cloud" => TestEnv::Cloud,
            Ok(env) => panic!("Unknown CLICKHOUSE_TEST_ENVIRONMENT: {env}"),
            Err(VarError::NotPresent) => TestEnv::Local,
            Err(VarError::NotUnicode(_)) => {
                panic!("CLICKHOUSE_TEST_ENVIRONMENT must be a valid UTF-8 string")
            }
        });

    *TEST_ENV
}

async fn create_readonly_user(client: &Client, database: &str) -> Client {
    let username = format!("clickhouse-rs_readonly_user_{:X}", rand::random::<u64>());
    let password = format!("CHRS_{:X}", rand::random::<u64>());

    client
        .query(
            "CREATE USER ? IDENTIFIED WITH sha256_password BY ? \
         DEFAULT DATABASE ? \
         SETTINGS readonly = 1",
        )
        .bind(&username)
        .bind(&password)
        .bind(Identifier(database))
        .execute()
        .await
        .unwrap();

    client
        .query(
            "GRANT SHOW TABLES, SELECT \
         ON ?.* \
         TO ?",
        )
        .bind(Identifier(database))
        .bind(Identifier(&username))
        .execute()
        .await
        .unwrap();

    client
        .clone()
        .with_user(username)
        .with_password(password)
        .with_database(database)
}

/// Create a test user and role for `test_db_name` with no default grants.
///
/// Returns a `Client` with the user configured, and the role name.
async fn create_user_and_role(client: &Client, test_db_name: &str) -> (Client, String) {
    let username = format!("{test_db_name}__user");
    let password = format!("CHRS_{:X}", rand::random::<u64>());

    client
        .query(
            "CREATE USER OR REPLACE ? \
         IDENTIFIED WITH sha256_password BY ? \
         DEFAULT DATABASE ?",
        )
        .bind(&username)
        .bind(&password)
        .bind(Identifier(test_db_name))
        .execute()
        .await
        .unwrap();

    client
        .query("REVOKE ALL ON *.* FROM ?")
        .bind(&username)
        .execute()
        .await
        .unwrap();

    // Needed for metadata queries
    client
        .query("GRANT SHOW ON ?.* TO ?")
        .bind(Identifier(test_db_name))
        .bind(&username)
        .execute()
        .await
        .unwrap();

    let role = format!("{test_db_name}__role");

    client
        .query("CREATE ROLE OR REPLACE ?")
        .bind(Identifier(&role))
        .execute()
        .await
        .unwrap();

    client
        .query("GRANT ? TO ?")
        .bind(Identifier(&role))
        .bind(Identifier(&username))
        .execute()
        .await
        .unwrap();

    client
        .query("SET DEFAULT ROLE NONE TO ?")
        .bind(Identifier(&username))
        .execute()
        .await
        .unwrap();

    (
        client.clone().with_user(username).with_password(password),
        role,
    )
}

mod _priv {
    use super::*;
    use std::time::SystemTime;

    pub(crate) async fn prepare_database(db_name: &str) -> Client {
        let client = get_client();

        client
            .query("DROP DATABASE IF EXISTS ?")
            .with_option("wait_end_of_query", "1")
            .bind(Identifier(db_name))
            .execute()
            .await
            .unwrap_or_else(|err| panic!("cannot drop db {db_name}, cause: {err}"));

        client
            .query("CREATE DATABASE ?")
            .with_option("wait_end_of_query", "1")
            .bind(Identifier(db_name))
            .execute()
            .await
            .unwrap_or_else(|err| panic!("cannot create db {db_name}, cause: {err}"));

        println!("Created database {db_name}");
        client.with_database(db_name)
    }

    // `it::compression::lz4::{{closure}}::f` ->
    // - "local" env: `chrs__compression__lz4`
    // - "cloud" env: `chrs__compression__lz4__{unix_millis}`
    pub(crate) fn make_db_name(fn_path: &str) -> String {
        assert!(fn_path.starts_with("it::"));
        let mut iter = fn_path.split("::").skip(1);
        let module = iter.next().unwrap();
        let test = iter.next().unwrap();

        match test_env() {
            TestEnv::Local => format!("chrs__{module}__{test}"),
            TestEnv::Cloud => {
                let now_unix_millis = SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap()
                    .as_millis();
                format!("chrs__{module}__{test}__{now_unix_millis}")
            }
        }
    }
}
