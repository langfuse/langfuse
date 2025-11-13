use serde::{Deserialize, Serialize};

use clickhouse::sql::Identifier;
use clickhouse::{Client, Row, error::Result};

// See also: https://clickhouse.com/docs/en/sql-reference/data-types/variant

#[tokio::main]
async fn main() -> Result<()> {
    let table_name = "chrs_data_types_variant";
    let client = Client::default().with_url("http://localhost:8123");

    // No matter the order of the definition on the Variant types in the DDL, this particular Variant will always be sorted as follows:
    // Variant(Array(UInt16), Bool, FixedString(6), Float32, Float64, Int128, Int16, Int32, Int64, Int8, String, UInt128, UInt16, UInt32, UInt64, UInt8)
    client
        .query(
            "
            CREATE OR REPLACE TABLE ?
            (
                `id`  UInt64,
                `var` Variant(
                          Array(UInt16),
                          Bool,
                          Date,
                          FixedString(6),
                          Float32, Float64,
                          Int128, Int16, Int32, Int64, Int8,
                          String,
                          UInt128, UInt16, UInt32, UInt64, UInt8
                      )
            )
            ENGINE = MergeTree
            ORDER BY id",
        )
        .bind(Identifier(table_name))
        .with_option("allow_experimental_variant_type", "1")
        // This is required only if we are mixing similar types in the Variant definition
        // In this case, this is various Int/UInt types, Float32/Float64, and String/FixedString
        // Omit this option if there are no similar types in the definition
        .with_option("allow_suspicious_variant_types", "1")
        .execute()
        .await?;

    let mut insert = client.insert::<MyRow>(table_name).await?;
    let rows_to_insert = get_rows();
    for row in rows_to_insert {
        insert.write(&row).await?;
    }
    insert.end().await?;

    let rows = client
        .query("SELECT ?fields FROM ?")
        .bind(Identifier(table_name))
        .fetch_all::<MyRow>()
        .await?;

    println!("{rows:#?}");
    Ok(())
}

fn get_rows() -> Vec<MyRow> {
    vec![
        MyRow {
            id: 1,
            var: MyRowVariant::Array(vec![1, 2]),
        },
        MyRow {
            id: 2,
            var: MyRowVariant::Boolean(true),
        },
        MyRow {
            id: 3,
            var: MyRowVariant::Date(
                time::Date::from_calendar_date(2021, time::Month::January, 1).unwrap(),
            ),
        },
        MyRow {
            id: 4,
            var: MyRowVariant::FixedString(*b"foobar"),
        },
        MyRow {
            id: 5,
            var: MyRowVariant::Float32(100.5),
        },
        MyRow {
            id: 6,
            var: MyRowVariant::Float64(200.1),
        },
        MyRow {
            id: 7,
            var: MyRowVariant::Int8(2),
        },
        MyRow {
            id: 8,
            var: MyRowVariant::Int16(3),
        },
        MyRow {
            id: 9,
            var: MyRowVariant::Int32(4),
        },
        MyRow {
            id: 10,
            var: MyRowVariant::Int64(5),
        },
        MyRow {
            id: 11,
            var: MyRowVariant::Int128(6),
        },
        MyRow {
            id: 12,
            var: MyRowVariant::String("my_string".to_string()),
        },
        MyRow {
            id: 13,
            var: MyRowVariant::UInt8(7),
        },
        MyRow {
            id: 14,
            var: MyRowVariant::UInt16(8),
        },
        MyRow {
            id: 15,
            var: MyRowVariant::UInt32(9),
        },
        MyRow {
            id: 16,
            var: MyRowVariant::UInt64(10),
        },
        MyRow {
            id: 17,
            var: MyRowVariant::UInt128(11),
        },
    ]
}

// As the inner Variant types are _always_ sorted alphabetically,
// Rust enum variants should be defined in the _exactly_ same order as it is in the data type;
// their names are irrelevant, only the order of the types matters.
// This enum represents Variant(Array(UInt16), Bool, Date, FixedString(6), Float32, Float64, Int128, Int16, Int32, Int64, Int8, String, UInt128, UInt16, UInt32, UInt64, UInt8)
#[derive(Debug, PartialEq, Serialize, Deserialize)]
enum MyRowVariant {
    Array(Vec<u16>),
    Boolean(bool),
    // attributes should work in this case, too
    #[serde(with = "clickhouse::serde::time::date")]
    Date(time::Date),
    // NB: by default, fetched as raw bytes
    FixedString([u8; 6]),
    Float32(f32),
    Float64(f64),
    Int128(i128),
    Int16(i16),
    Int32(i32),
    Int64(i64),
    Int8(i8),
    String(String),
    UInt128(u128),
    UInt16(i16),
    UInt32(u32),
    UInt64(u64),
    UInt8(i8),
}

#[derive(Debug, PartialEq, Row, Serialize, Deserialize)]
struct MyRow {
    id: u64,
    var: MyRowVariant,
}
