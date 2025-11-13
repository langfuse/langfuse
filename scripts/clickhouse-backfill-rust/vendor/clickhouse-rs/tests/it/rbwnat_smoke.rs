use crate::decimals::*;
use crate::geo_types::{LineString, MultiLineString, MultiPolygon, Point, Polygon, Ring};
use crate::{SimpleRow, create_simple_table, execute_statements, get_client, insert_and_select};
use clickhouse::Row;
use clickhouse::sql::Identifier;
use fxhash::FxHashMap;
use indexmap::IndexMap;
use linked_hash_map::LinkedHashMap;
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::collections::HashMap;
use std::panic::AssertUnwindSafe;
use std::str::FromStr;

#[tokio::test]
async fn basic_types() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        uint8_val: u8,
        uint16_val: u16,
        uint32_val: u32,
        uint64_val: u64,
        uint128_val: u128,
        int8_val: i8,
        int16_val: i16,
        int32_val: i32,
        int64_val: i64,
        int128_val: i128,
        float32_val: f32,
        float64_val: f64,
        string_val: String,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
              uint8_val UInt8,
              uint16_val UInt16,
              uint32_val UInt32,
              uint64_val UInt64,
              uint128_val UInt128,
              int8_val Int8,
              int16_val Int16,
              int32_val Int32,
              int64_val Int64,
              int128_val Int128,
              float32_val Float32,
              float64_val Float64,
              string_val String
            )
            ENGINE = MergeTree
            ORDER BY ()
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![Data {
        uint8_val: 255,
        uint16_val: 65535,
        uint32_val: 4294967295,
        uint64_val: 18446744073709551615,
        uint128_val: 340282366920938463463374607431768211455,
        int8_val: -128,
        int16_val: -32768,
        int32_val: -2147483648,
        int64_val: -9223372036854775808,
        int128_val: -170141183460469231731687303715884105728,
        float32_val: 42.0,
        float64_val: 144.0,
        string_val: "test".to_string(),
    }];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn several_simple_rows() {
    let client = prepare_database!();
    create_simple_table(&client, "test").await;

    let rows = vec![
        SimpleRow::new(42, "foo".to_string()),
        SimpleRow::new(144, "bar".to_string()),
        SimpleRow::new(222, "baz".to_string()),
    ];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn many_numbers() {
    #[derive(Row, Serialize, Deserialize)]
    struct Data {
        number: u64,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                number UInt64
            )
            ENGINE = MergeTree
            ORDER BY number
            ",
        )
        .execute()
        .await
        .unwrap();

    let mut insert = client.insert::<Data>("test").await.unwrap();
    for i in 1..=20_000 {
        insert.write(&Data { number: i }).await.unwrap();
    }

    insert.end().await.unwrap();

    let mut cursor = client
        .query("SELECT number FROM test ORDER BY number")
        .fetch::<Data>()
        .unwrap();

    let mut sum: u64 = 0;
    for i in 1..=20_000 {
        let row = cursor.next().await.unwrap().unwrap();
        assert_eq!(row.number, i);
        sum += row.number;
    }

    assert!(cursor.next().await.unwrap().is_none());
    assert_eq!(sum, 200_010_000);
}

#[tokio::test]
async fn arrays() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        id: u16,
        one_dim_array: Vec<u32>,
        two_dim_array: Vec<Vec<i64>>,
        three_dim_array: Vec<Vec<Vec<f64>>>,
        description: String,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                id              UInt16,
                one_dim_array   Array(UInt32),
                two_dim_array   Array(Array(Int64)),
                three_dim_array Array(Array(Array(Float64))),
                description     String
            )
            ENGINE = MergeTree
            ORDER BY ()
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![Data {
        id: 42,
        one_dim_array: vec![1, 2],
        two_dim_array: vec![vec![1, 2], vec![3, 4]],
        three_dim_array: vec![
            vec![vec![1.1, 2.2], vec![3.3, 4.4]],
            vec![],
            vec![vec![5.5, 6.6], vec![7.7, 8.8]],
        ],
        description: "foobar".to_string(),
    }];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn tuples() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        a: (u32, String),
        b: (i128, HashMap<u16, String>),
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                a Tuple(UInt32, String),
                b Tuple(Int128, Map(UInt16, String))
            )
            ENGINE = MergeTree
            ORDER BY ()
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![
        Data {
            a: (42, "foo".to_string()),
            b: (144, vec![(255, "bar".to_string())].into_iter().collect()),
        },
        Data {
            a: (100, "qaz".to_string()),
            b: (
                222,
                vec![(1, "qux".to_string()), (2, "quux".to_string())]
                    .into_iter()
                    .collect(),
            ),
        },
    ];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn geo() {
    #[derive(Clone, Debug, PartialEq)]
    #[derive(Row, serde::Serialize, serde::Deserialize)]
    struct Data {
        id: u32,
        point: Point,
        ring: Ring,
        polygon: Polygon,
        multi_polygon: MultiPolygon,
        line_string: LineString,
        multi_line_string: MultiLineString,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                id                UInt32,
                point             Point,
                ring              Ring,
                polygon           Polygon,
                multi_polygon     MultiPolygon,
                line_string       LineString,
                multi_line_string MultiLineString
            )
            ENGINE = MergeTree
            ORDER BY id
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![
        Data {
            id: 42,
            point: (1.0, 2.0),
            ring: vec![(3.0, 4.0), (5.0, 6.0)],
            polygon: vec![vec![(7.0, 8.0), (9.0, 10.0)], vec![(11.0, 12.0)]],
            multi_polygon: vec![vec![vec![(13.0, 14.0), (15.0, 16.0)], vec![(17.0, 18.0)]]],
            line_string: vec![(19.0, 20.0), (21.0, 22.0)],
            multi_line_string: vec![vec![(23.0, 24.0), (25.0, 26.0)], vec![(27.0, 28.0)]],
        },
        Data {
            id: 144,
            point: (29.0, 30.0),
            ring: vec![(31.0, 32.0), (33.0, 34.0)],
            polygon: vec![vec![(35.0, 36.0), (37.0, 38.0)], vec![(39.0, 40.0)]],
            multi_polygon: vec![vec![vec![(41.0, 42.0), (43.0, 44.0)], vec![(45.0, 46.0)]]],
            line_string: vec![(47.0, 48.0), (49.0, 50.0)],
            multi_line_string: vec![vec![(51.0, 52.0), (53.0, 54.0)], vec![(55.0, 56.0)]],
        },
    ];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn maps() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        m1: HashMap<String, String>,
        m2: HashMap<u16, HashMap<String, i32>>,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                m1 Map(String, String),
                m2 Map(UInt16, Map(String, Int32))
            )
            ENGINE = MergeTree
            ORDER BY ()
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![Data {
        m1: vec![
            ("key1".to_string(), "value1".to_string()),
            ("key2".to_string(), "value2".to_string()),
        ]
        .into_iter()
        .collect(),
        m2: vec![
            (
                42,
                vec![("foo".to_string(), 100), ("bar".to_string(), 200)]
                    .into_iter()
                    .collect(),
            ),
            (
                144,
                vec![("qaz".to_string(), 300), ("qux".to_string(), 400)]
                    .into_iter()
                    .collect(),
            ),
        ]
        .into_iter()
        .collect::<HashMap<u16, HashMap<String, i32>>>(),
    }];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn map_as_vec_of_tuples() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        m1: Vec<(i128, String)>,
        m2: Vec<(u16, Vec<(String, i32)>)>,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                m1 Map(Int128, String),
                m2 Map(UInt16, Map(String, Int32))
            )
            ENGINE = MergeTree
            ORDER BY ()
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![Data {
        m1: vec![(100, "value1".to_string()), (200, "value2".to_string())],
        m2: vec![
            (
                42,
                vec![("foo".to_string(), 100), ("bar".to_string(), 200)]
                    .into_iter()
                    .collect(),
            ),
            (
                144,
                vec![("qaz".to_string(), 300), ("qux".to_string(), 400)]
                    .into_iter()
                    .collect(),
            ),
        ],
    }];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows)
}

#[tokio::test]
async fn maps_third_party() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        im: IndexMap<u16, String>,
        lhm: LinkedHashMap<u32, String>,
        fx: FxHashMap<u64, String>,
        weird_but_ok: LinkedHashMap<u128, IndexMap<i8, FxHashMap<i16, Vec<bool>>>>,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                im           Map(UInt16,  String),
                lhm          Map(UInt32,  String),
                fx           Map(UInt64,  String),
                weird_but_ok Map(UInt128, Map(Int8, Map(Int16, Array(Bool))))
            )
            ENGINE = MergeTree
            ORDER BY ()
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![Data {
        im: IndexMap::from_iter(vec![(1, "one".to_string()), (2, "two".to_string())]),
        lhm: LinkedHashMap::from_iter(vec![(3, "three".to_string()), (4, "four".to_string())]),
        fx: FxHashMap::from_iter(vec![(5, "five".to_string()), (6, "six".to_string())]),
        weird_but_ok: LinkedHashMap::from_iter(vec![(
            7u128,
            IndexMap::from_iter(vec![(
                -8i8,
                FxHashMap::from_iter(vec![(9i16, vec![true, false]), (10i16, vec![false])]),
            )]),
        )]),
    }];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn enums() {
    #[derive(Clone, Debug, PartialEq, Serialize_repr, Deserialize_repr)]
    #[repr(i8)]
    enum MyEnum8 {
        Winter = -128,
        Spring = 0,
        Summer = 100,
        Autumn = 127,
    }

    #[derive(Clone, Debug, PartialEq, Serialize_repr, Deserialize_repr)]
    #[repr(i16)]
    enum MyEnum16 {
        North = -32768,
        East = 0,
        South = 144,
        West = 32767,
    }

    #[derive(Clone, Debug, PartialEq, Row, Serialize, Deserialize)]
    struct Data {
        id: u16,
        enum8: MyEnum8,
        enum16: MyEnum16,
    }

    let table_name = "test_rbwnat_enum";

    let client = prepare_database!();
    client
        .query(
            "
            CREATE OR REPLACE TABLE ?
            (
                id     UInt16,
                enum8  Enum8 ('Winter' = -128,   'Spring' = 0, 'Summer' = 100, 'Autumn' = 127),
                enum16 Enum16('North'  = -32768, 'East'   = 0, 'South'  = 144, 'West'   = 32767)
            ) ENGINE MergeTree ORDER BY id
            ",
        )
        .bind(Identifier(table_name))
        .execute()
        .await
        .unwrap();

    let rows = vec![
        Data {
            id: 1,
            enum8: MyEnum8::Spring,
            enum16: MyEnum16::East,
        },
        Data {
            id: 2,
            enum8: MyEnum8::Autumn,
            enum16: MyEnum16::North,
        },
        Data {
            id: 3,
            enum8: MyEnum8::Winter,
            enum16: MyEnum16::South,
        },
        Data {
            id: 4,
            enum8: MyEnum8::Summer,
            enum16: MyEnum16::West,
        },
    ];

    let result = insert_and_select(&client, table_name, rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn nullable() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        a: u32,
        b: Option<i64>,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                a UInt32,
                b Nullable(Int64)
            )
            ENGINE = MergeTree
            ORDER BY a
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![
        Data { a: 1, b: Some(2) },
        Data { a: 3, b: None },
        Data { a: 4, b: Some(5) },
    ];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn blob_string_with_serde_bytes() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        #[serde(with = "serde_bytes")]
        blob: Vec<u8>,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                blob String
            )
            ENGINE = MergeTree
            ORDER BY tuple()
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![
        Data {
            blob: "foo".as_bytes().to_vec(),
        },
        Data {
            blob: "bar".as_bytes().to_vec(),
        },
        Data {
            blob: "qaz".as_bytes().to_vec(),
        },
    ];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn low_cardinality() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        a: u32,
        b: Option<i64>,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                a LowCardinality(UInt32),
                b LowCardinality(Nullable(Int64))
            )
            ENGINE = MergeTree
            ORDER BY a
            ",
        )
        .with_option("allow_suspicious_low_cardinality_types", "1")
        .execute()
        .await
        .unwrap();

    let rows = vec![
        Data { a: 1, b: Some(2) },
        Data { a: 3, b: None },
        Data { a: 4, b: Some(5) },
    ];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn serde_skip_struct_field() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        a: u32,
        #[serde(skip_serializing)]
        #[serde(skip_deserializing)]
        b: u32,
        c: u32,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                a UInt32,
                c UInt32
            )
            ENGINE = MergeTree
            ORDER BY a ASC
            ",
        )
        .execute()
        .await
        .unwrap();

    let result = insert_and_select(
        &client,
        "test",
        vec![
            Data {
                a: 42,
                b: 111, // b will be ignored
                c: 144,
            },
            Data {
                a: 100,
                b: 222,
                c: 200,
            },
        ],
    )
    .await;

    assert_eq!(
        result,
        vec![
            Data {
                a: 42,
                b: 0, // default value for u32
                c: 144
            },
            Data {
                a: 100,
                b: 0,
                c: 200
            },
        ]
    );
}

#[tokio::test]
#[cfg(feature = "time")]
async fn date_and_time() {
    use time::Month::{February, January};
    use time::OffsetDateTime;
    use time::format_description::well_known::Iso8601;

    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        #[serde(with = "clickhouse::serde::time::date")]
        date: time::Date,
        #[serde(with = "clickhouse::serde::time::date32")]
        date32: time::Date,
        #[serde(with = "clickhouse::serde::time::datetime")]
        date_time: OffsetDateTime,
        #[serde(with = "clickhouse::serde::time::datetime64::secs")]
        date_time64_0: OffsetDateTime,
        #[serde(with = "clickhouse::serde::time::datetime64::millis")]
        date_time64_3: OffsetDateTime,
        #[serde(with = "clickhouse::serde::time::datetime64::micros")]
        date_time64_6: OffsetDateTime,
        #[serde(with = "clickhouse::serde::time::datetime64::nanos")]
        date_time64_9: OffsetDateTime,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                date          Date,
                date32        Date32,
                date_time     DateTime,
                date_time64_0 DateTime64(0),
                date_time64_3 DateTime64(3),
                date_time64_6 DateTime64(6),
                date_time64_9 DateTime64(9)
            )
            ENGINE = MergeTree
            ORDER BY tuple()
            ",
        )
        .execute()
        .await
        .unwrap();

    let data = vec![Data {
        date: time::Date::from_calendar_date(2023, January, 1).unwrap(),
        date32: time::Date::from_calendar_date(2023, February, 2).unwrap(),
        date_time: OffsetDateTime::parse("2023-01-03T12:00:00Z", &Iso8601::DEFAULT).unwrap(),
        date_time64_0: OffsetDateTime::parse("2023-01-04T13:00:00Z", &Iso8601::DEFAULT).unwrap(),
        date_time64_3: OffsetDateTime::parse("2023-01-05T14:00:00.123Z", &Iso8601::DEFAULT)
            .unwrap(),
        date_time64_6: OffsetDateTime::parse("2023-01-06T15:00:00.123456Z", &Iso8601::DEFAULT)
            .unwrap(),
        date_time64_9: OffsetDateTime::parse("2023-01-07T16:00:00.123456789Z", &Iso8601::DEFAULT)
            .unwrap(),
    }];

    let result = insert_and_select(&client, "test", data.clone()).await;
    assert_eq!(result, data);
}

#[tokio::test]
#[cfg(feature = "uuid")]
async fn uuid() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        id: u16,
        #[serde(with = "clickhouse::serde::uuid")]
        uuid: uuid::Uuid,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                id UInt16,
                uuid UUID
            )
            ENGINE = MergeTree
            ORDER BY id
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![
        Data {
            id: 42,
            uuid: uuid::Uuid::from_str("550e8400-e29b-41d4-a716-446655440000").unwrap(),
        },
        Data {
            id: 144,
            uuid: uuid::Uuid::from_str("12345678-1234-5678-1234-567812345678").unwrap(),
        },
        Data {
            id: 255,
            uuid: uuid::Uuid::from_str("00000000-0000-0000-0000-000000000000").unwrap(),
        },
    ];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn ipv4_ipv6() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        id: u16,
        #[serde(with = "clickhouse::serde::ipv4")]
        ipv4: std::net::Ipv4Addr,
        ipv6: std::net::Ipv6Addr,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                id UInt16,
                ipv4 IPv4,
                ipv6 IPv6
            )
            ENGINE = MergeTree
            ORDER BY id
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![Data {
        id: 42,
        ipv4: std::net::Ipv4Addr::new(192, 168, 0, 1),
        ipv6: std::net::Ipv6Addr::from_str("2001:db8:3333:4444:5555:6666:7777:8888").unwrap(),
    }];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows)
}

#[tokio::test]
async fn fixed_str() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        a: [u8; 4],
        b: [u8; 3],
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                a FixedString(4),
                b FixedString(3)
            )
            ENGINE = MergeTree
            ORDER BY tuple()
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![Data {
        a: [49, 50, 51, 52], // '1234'
        b: [55, 55, 55],     // '777'
    }];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
    assert_eq!(String::from_utf8_lossy(&result[0].a), "1234");
    assert_eq!(String::from_utf8_lossy(&result[0].b), "777");
}

#[tokio::test]
async fn decimals() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        decimal32_9_4: Decimal32,
        decimal64_18_8: Decimal64,
        decimal128_38_12: Decimal128,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                decimal32_9_4 Decimal32(4),
                decimal64_18_8 Decimal64(8),
                decimal128_38_12 Decimal128(12)
            )
            ENGINE = MergeTree
            ORDER BY tuple()
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![Data {
        decimal32_9_4: Decimal32::from_str("42.1234").unwrap(),
        decimal64_18_8: Decimal64::from_str("144.56789012").unwrap(),
        decimal128_38_12: Decimal128::from_str("-17014118346046923173168730.37158841057").unwrap(),
    }];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn different_struct_field_order_same_types() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        c: String,
        a: String,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE OR REPLACE TABLE test (
                a String,
                c String
            ) ENGINE MergeTree ORDER BY a
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![
        Data {
            c: "foo".to_string(),
            a: "bar".to_string(),
        },
        Data {
            c: "baz".to_string(),
            a: "qux".to_string(),
        },
    ];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn different_struct_field_order_different_types() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        b: u32,
        a: String,
        c: Vec<bool>,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE OR REPLACE TABLE test (
                a String,
                b UInt32,
                c Array(Bool)
            ) ENGINE MergeTree ORDER BY a
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![
        Data {
            b: 42,
            a: "bar".to_string(),
            c: vec![false, true],
        },
        Data {
            b: 144,
            a: "foo".to_string(),
            c: vec![true, false, true],
        },
    ];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn different_struct_field_order_mixed_usage() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        c: String,
        a: String,
        sku: u32,
        id: u32,
        #[serde(skip_serializing)]
        #[serde(skip_deserializing)]
        ignored: u64,
        #[serde(rename = "b")]
        x: u64,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE OR REPLACE TABLE test (
                id UInt32,
                a String,
                b UInt64,
                c String,
                sku UInt32
            ) ENGINE MergeTree ORDER BY id
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![
        Data {
            c: "foo".to_string(),
            a: "bar".to_string(),
            sku: 42,
            id: 1,
            ignored: 123, // skipped
            x: 100,       // serialized as 'b'
        },
        Data {
            c: "baz".to_string(),
            a: "qux".to_string(),
            sku: 144,
            id: 2,
            ignored: 777, // skipped
            x: 200,       // serialized as 'b'
        },
    ];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(
        result,
        vec![
            Data {
                c: "foo".to_string(),
                a: "bar".to_string(),
                sku: 42,
                id: 1,
                ignored: 0, // not deserialized, default value
                x: 100,     // deserialized from the db field 'b'
            },
            Data {
                c: "baz".to_string(),
                a: "qux".to_string(),
                sku: 144,
                id: 2,
                ignored: 0, // not deserialized, default value
                x: 200,     // deserialized from the db field 'b'
            },
        ]
    );
}

#[tokio::test]
async fn borrowed_data() {
    #[derive(Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data<'a> {
        str: &'a str,
        array: Vec<&'a str>,
        tuple: (&'a str, &'a str),
        str_opt: Option<&'a str>,
        vec_map_str: Vec<(&'a str, &'a str)>,
        vec_map_f32: Vec<(&'a str, f32)>,
        vec_map_nested: Vec<(&'a str, Vec<(&'a str, &'a str)>)>,
        hash_map_str: HashMap<&'a str, &'a str>,
        hash_map_f32: HashMap<&'a str, f32>,
        hash_map_nested: HashMap<&'a str, HashMap<&'a str, &'a str>>,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE OR REPLACE TABLE test (
                str              String,
                array            Array(String),
                tuple            Tuple(String, String),
                str_opt          Nullable(String),
                vec_map_str      Map(String, String),
                vec_map_f32      Map(String, Float32),
                vec_map_nested   Map(String, Map(String, String)),
                hash_map_str     Map(String, String),
                hash_map_f32     Map(String, Float32),
                hash_map_nested  Map(String, Map(String, String))
            ) ENGINE MergeTree ORDER BY str
            ",
        )
        .execute()
        .await
        .unwrap();

    let row1 = Data {
        str: "a",
        array: vec!["b", "c"],
        tuple: ("d", "e"),
        str_opt: None,
        vec_map_str: vec![("key1", "value1"), ("key2", "value2")],
        vec_map_f32: vec![("key3", 100.0), ("key4", 200.0)],
        vec_map_nested: vec![("n1", vec![("key1", "value1"), ("key2", "value2")])],
        hash_map_str: HashMap::from([("key1", "value1"), ("key2", "value2")]),
        hash_map_f32: HashMap::from([("key3", 100.0), ("key4", 200.0)]),
        hash_map_nested: HashMap::from([(
            "n1",
            HashMap::from([("key1", "value1"), ("key2", "value2")]),
        )]),
    };

    let row2 = Data {
        str: "f",
        array: vec!["g", "h"],
        tuple: ("i", "j"),
        str_opt: Some("k"),
        vec_map_str: vec![("key4", "value4"), ("key5", "value5")],
        vec_map_f32: vec![("key6", 300.0), ("key7", 400.0)],
        vec_map_nested: vec![("n2", vec![("key4", "value4"), ("key5", "value5")])],
        hash_map_str: HashMap::from([("key4", "value4"), ("key5", "value5")]),
        hash_map_f32: HashMap::from([("key6", 300.0), ("key7", 400.0)]),
        hash_map_nested: HashMap::from([(
            "n2",
            HashMap::from([("key4", "value4"), ("key5", "value5")]),
        )]),
    };

    let mut insert = client.insert::<Data<'_>>("test").await.unwrap();
    insert.write(&row1).await.unwrap();
    insert.write(&row2).await.unwrap();
    insert.end().await.unwrap();

    let mut cursor = client
        .query("SELECT ?fields FROM test")
        .fetch::<Data<'_>>()
        .unwrap();

    assert_eq!(cursor.next().await.unwrap().unwrap(), row1);
    assert_eq!(cursor.next().await.unwrap().unwrap(), row2);
    assert!(cursor.next().await.unwrap().is_none());
}

#[tokio::test]
async fn nested_data_type() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        id: u16,
        #[serde(rename = "nested.id")]
        nested_id: Vec<u32>,
        #[serde(rename = "nested.value")]
        nested_value: Vec<String>,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                id     UInt16,
                nested Nested(id UInt32, value String)
            )
            ENGINE = MergeTree
            ORDER BY id
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![
        Data {
            id: 42,
            nested_id: vec![1, 2, 3],
            nested_value: vec!["one".to_string(), "two".to_string(), "three".to_string()],
        },
        Data {
            id: 144,
            nested_id: vec![4, 5],
            nested_value: vec!["four".to_string(), "five".to_string()],
        },
    ];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

/// See https://github.com/ClickHouse/clickhouse-rs/issues/99
#[tokio::test]
#[ignore] // FIXME: requires https://github.com/ClickHouse/clickhouse-rs/issues/264
async fn issue_99_flatten_maps() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Metadata {
        foo: String,
        bar: String,
    }
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        #[serde(flatten)]
        metadata: Metadata,
        data: String,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                foo  String,
                bar  String,
                data String
            )
            ENGINE = MergeTree
            ORDER BY tuple()
            ",
        )
        .execute()
        .await
        .unwrap();

    let rows = vec![Data {
        metadata: Metadata {
            foo: "foo_value".to_string(),
            bar: "bar_value".to_string(),
        },
        data: "data_value".to_string(),
    }];

    let result = insert_and_select(&client, "test", rows.clone()).await;
    assert_eq!(result, rows);
}

#[tokio::test]
async fn struct_and_primitive_in_a_tuple() {
    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        id: u16,
        value: String,
    }

    let client = prepare_database!();
    client
        .query(
            "
            CREATE TABLE IF NOT EXISTS test (
                id  UInt16,
                value String
            )
            ENGINE = MergeTree
            ORDER BY id
            ",
        )
        .execute()
        .await
        .unwrap();

    let row1 = Data {
        id: 42,
        value: "forty-two".to_string(),
    };
    let row2 = Data {
        id: 144,
        value: "one four four".to_string(),
    };
    let rows = vec![&row1, &row2];

    let mut insert = client.insert::<Data>("test").await.unwrap();
    for data in rows {
        insert.write(data).await.unwrap();
    }
    insert.end().await.unwrap();

    let mut cursor = client
        .query("SELECT ?fields, count() FROM test GROUP BY ?fields")
        .fetch::<(Data, u64)>()
        .unwrap();

    let mut results = Vec::new();
    while let Some(row) = cursor.next().await.unwrap() {
        results.push(row);
    }

    assert_eq!(results, vec![(row1, 1), (row2, 1)]);
}

#[tokio::test]
async fn several_primitives_in_a_tuple() {
    let client = get_client();
    let mut cursor = client
        .query("SELECT number, number * 2 FROM system.numbers LIMIT 3")
        .fetch::<(u64, u64)>()
        .unwrap();
    let mut results = Vec::new();
    while let Some(row) = cursor.next().await.unwrap() {
        results.push(row);
    }
    assert_eq!(
        results,
        vec![(0, 0), (1, 2), (2, 4)],
        "Expected tuples with two u64 values"
    );
}

#[tokio::test]
async fn interval() {
    #[derive(Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        id: u32,
        interval_nanosecond: i64,
        interval_microsecond: i64,
        interval_millisecond: i64,
        interval_second: i64,
        interval_minute: i64,
        interval_hour: i64,
        interval_day: i64,
        interval_week: i64,
        interval_month: i64,
        interval_quarter: i64,
        interval_year: i64,
    }

    let client = get_client();
    let mut cursor = client
        .query(
            "
            SELECT * FROM (
                SELECT
                    0 :: UInt32                                  AS id,
                    toIntervalNanosecond  (0)                    AS interval_nanosecond,
                    toIntervalMicrosecond (0)                    AS interval_microsecond,
                    toIntervalMillisecond (0)                    AS interval_millisecond,
                    toIntervalSecond      (0)                    AS interval_second,
                    toIntervalMinute      (0)                    AS interval_minute,
                    toIntervalHour        (0)                    AS interval_hour,
                    toIntervalDay         (0)                    AS interval_day,
                    toIntervalWeek        (0)                    AS interval_week,
                    toIntervalMonth       (0)                    AS interval_month,
                    toIntervalQuarter     (0)                    AS interval_quarter,
                    toIntervalYear        (0)                    AS interval_year
                UNION ALL
                SELECT
                    1 :: UInt32                                  AS id,
                    toIntervalNanosecond  (-9223372036854775808) AS interval_nanosecond,
                    toIntervalMicrosecond (-9223372036854775808) AS interval_microsecond,
                    toIntervalMillisecond (-9223372036854775808) AS interval_millisecond,
                    toIntervalSecond      (-9223372036854775808) AS interval_second,
                    toIntervalMinute      (-9223372036854775808) AS interval_minute,
                    toIntervalHour        (-9223372036854775808) AS interval_hour,
                    toIntervalDay         (-9223372036854775808) AS interval_day,
                    toIntervalWeek        (-9223372036854775808) AS interval_week,
                    toIntervalMonth       (-9223372036854775808) AS interval_month,
                    toIntervalQuarter     (-9223372036854775808) AS interval_quarter,
                    toIntervalYear        (-9223372036854775808) AS interval_year
                UNION ALL
                SELECT
                    2 :: UInt32                                  AS id,
                    toIntervalNanosecond  (9223372036854775807)  AS interval_nanosecond,
                    toIntervalMicrosecond (9223372036854775807)  AS interval_microsecond,
                    toIntervalMillisecond (9223372036854775807)  AS interval_millisecond,
                    toIntervalSecond      (9223372036854775807)  AS interval_second,
                    toIntervalMinute      (9223372036854775807)  AS interval_minute,
                    toIntervalHour        (9223372036854775807)  AS interval_hour,
                    toIntervalDay         (9223372036854775807)  AS interval_day,
                    toIntervalWeek        (9223372036854775807)  AS interval_week,
                    toIntervalMonth       (9223372036854775807)  AS interval_month,
                    toIntervalQuarter     (9223372036854775807)  AS interval_quarter,
                    toIntervalYear        (9223372036854775807)  AS interval_year
            ) ORDER BY id ASC
            ",
        )
        .fetch::<Data>()
        .unwrap();

    assert_eq!(
        cursor.next().await.unwrap().unwrap(),
        Data {
            id: 0,
            interval_nanosecond: 0,
            interval_microsecond: 0,
            interval_millisecond: 0,
            interval_second: 0,
            interval_minute: 0,
            interval_hour: 0,
            interval_day: 0,
            interval_week: 0,
            interval_month: 0,
            interval_quarter: 0,
            interval_year: 0,
        }
    );

    assert_eq!(
        cursor.next().await.unwrap().unwrap(),
        Data {
            id: 1,
            interval_nanosecond: i64::MIN,
            interval_microsecond: i64::MIN,
            interval_millisecond: i64::MIN,
            interval_second: i64::MIN,
            interval_minute: i64::MIN,
            interval_hour: i64::MIN,
            interval_day: i64::MIN,
            interval_week: i64::MIN,
            interval_month: i64::MIN,
            interval_quarter: i64::MIN,
            interval_year: i64::MIN,
        }
    );

    assert_eq!(
        cursor.next().await.unwrap().unwrap(),
        Data {
            id: 2,
            interval_nanosecond: i64::MAX,
            interval_microsecond: i64::MAX,
            interval_millisecond: i64::MAX,
            interval_second: i64::MAX,
            interval_minute: i64::MAX,
            interval_hour: i64::MAX,
            interval_day: i64::MAX,
            interval_week: i64::MAX,
            interval_month: i64::MAX,
            interval_quarter: i64::MAX,
            interval_year: i64::MAX,
        }
    );
}

// See https://clickhouse.com/docs/sql-reference/statements/create/table#ephemeral
#[tokio::test]
async fn ephemeral_columns() {
    let table_name = "test_ephemeral_columns";

    #[derive(Clone, Debug, Row, Serialize, PartialEq)]
    struct DataInsert {
        id: u64,
        hexed: String,
    }

    #[derive(Clone, Debug, Row, Deserialize, PartialEq)]
    struct DataSelect {
        id: u64,
        raw: [u8; 3],
    }

    let client = prepare_database!();
    client
        .query(
            "
                CREATE OR REPLACE TABLE ?
                (
                    id    UInt64,
                    hexed String         EPHEMERAL,
                    raw   FixedString(3) DEFAULT unhex(hexed)
                )
                ENGINE = MergeTree
                ORDER BY id
            ",
        )
        .bind(Identifier(table_name))
        .execute()
        .await
        .unwrap();

    let rows_to_insert = vec![
        DataInsert {
            id: 1,
            hexed: "666F6F".to_string(), // "foo" in hex
        },
        DataInsert {
            id: 2,
            hexed: "626172".to_string(), // "bar" in hex
        },
    ];

    let mut insert = client.insert::<DataInsert>(table_name).await.unwrap();
    for row in rows_to_insert.into_iter() {
        insert.write(&row).await.unwrap();
    }
    insert.end().await.unwrap();

    let rows = client
        .query("SELECT ?fields FROM ? ORDER BY () ASC")
        .bind(Identifier(table_name))
        .fetch_all::<DataSelect>()
        .await
        .unwrap();

    assert_eq!(
        rows,
        vec![
            DataSelect {
                id: 1,
                raw: *b"foo",
            },
            DataSelect {
                id: 2,
                raw: *b"bar",
            }
        ]
    );
}

// See https://clickhouse.com/docs/sql-reference/statements/alter/column#materialize-column
#[tokio::test]
async fn materialized_columns() {
    let table_name = "test_materialized_columns";

    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Data {
        x: i64,
    }

    #[derive(Clone, Debug, Row, Serialize, Deserialize, PartialEq)]
    struct DataWithMaterialized {
        x: i64,
        // MATERIALIZED columns cannot be inserted into
        s: String,
    }

    let client = prepare_database!();
    execute_statements(
        &client,
        &[
            &format!(
                "
                    CREATE OR REPLACE TABLE {table_name} (x Int64)
                    ENGINE = MergeTree ORDER BY () PARTITION BY ()
                "
            ),
            &format!("INSERT INTO {table_name} SELECT * FROM system.numbers LIMIT 5"),
            &format!("ALTER TABLE {table_name} ADD COLUMN s String MATERIALIZED toString(x)"),
            &format!("ALTER TABLE {table_name} MATERIALIZE COLUMN s"),
        ],
    )
    .await;

    let rows = client
        .query("SELECT ?fields FROM ? ORDER BY x ASC")
        .bind(Identifier(table_name))
        .fetch_all::<DataWithMaterialized>()
        .await
        .unwrap();

    let expected_rows = (0..5)
        .map(|x| DataWithMaterialized {
            x,
            s: x.to_string(),
        })
        .collect::<Vec<_>>();
    assert_eq!(rows, expected_rows);

    let insert_data = AssertUnwindSafe(async {
        let _ = client
            .insert::<DataWithMaterialized>(table_name)
            .await
            .unwrap();
    });

    assert_panic_msg!(
        insert_data,
        ["column s is immutable (declared as `MATERIALIZED`)"]
    );

    let rows_to_insert = (5..10).map(|x| Data { x });

    let mut insert = client.insert::<Data>(table_name).await.unwrap();
    for row in rows_to_insert {
        insert.write(&row).await.unwrap();
    }
    insert.end().await.unwrap();

    let rows_after_insert = client
        .query("SELECT ?fields FROM ? ORDER BY x ASC")
        .bind(Identifier(table_name))
        .fetch_all::<DataWithMaterialized>()
        .await
        .unwrap();

    let expected_rows_after_insert = (0..10)
        .map(|x| DataWithMaterialized {
            x,
            s: x.to_string(),
        })
        .collect::<Vec<_>>();

    assert_eq!(rows_after_insert, expected_rows_after_insert);
}

// See https://clickhouse.com/docs/sql-reference/statements/create/table#alias
#[tokio::test]
async fn alias_columns() {
    let table_name = "test_alias_columns";

    #[derive(Clone, Debug, Row, Deserialize, PartialEq)]
    struct Data {
        id: u64,
        size_bytes: i64,
        size: String,
    }

    #[derive(Clone, Debug, Row, Serialize, PartialEq)]
    struct DataInsert {
        id: u64,
        size_bytes: i64,
    }

    let client = prepare_database!();
    execute_statements(
        &client,
        &[
            &format!(
                "
                    CREATE OR REPLACE TABLE {table_name}
                    (
                        id         UInt64,
                        size_bytes Int64,
                        size       String ALIAS formatReadableSize(size_bytes)
                    )
                    ENGINE = MergeTree
                    ORDER BY id;
                ",
            ),
            &format!("INSERT INTO {table_name} VALUES (1, 4678899)"),
        ],
    )
    .await;

    let rows = client
        .query("SELECT ?fields FROM ?")
        .bind(Identifier(table_name))
        .fetch_all::<Data>()
        .await
        .unwrap();

    let expected_rows = vec![Data {
        id: 1,
        size_bytes: 4678899,
        size: "4.46 MiB".to_string(),
    }];

    assert_eq!(rows, expected_rows);

    let rows_to_insert = vec![
        DataInsert {
            id: 2,
            size_bytes: 123456,
        },
        DataInsert {
            id: 3,
            size_bytes: 987654321,
        },
    ];

    let mut insert = client.insert::<DataInsert>(table_name).await.unwrap();
    for row in &rows_to_insert {
        insert.write(row).await.unwrap();
    }
    insert.end().await.unwrap();

    let rows_after_insert = client
        .query("SELECT ?fields FROM ? ORDER BY id ASC")
        .bind(Identifier(table_name))
        .fetch_all::<Data>()
        .await
        .unwrap();

    let expected_rows_after_insert = vec![
        Data {
            id: 1,
            size_bytes: 4678899,
            size: "4.46 MiB".to_string(),
        },
        Data {
            id: 2,
            size_bytes: 123456,
            size: "120.56 KiB".to_string(),
        },
        Data {
            id: 3,
            size_bytes: 987654321,
            size: "941.90 MiB".to_string(),
        },
    ];

    assert_eq!(rows_after_insert, expected_rows_after_insert);
}
