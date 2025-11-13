use std::net::{Ipv4Addr, Ipv6Addr};

use serde::{Deserialize, Serialize};

use clickhouse::Row;

#[tokio::test]
async fn smoke() {
    let client = prepare_database!();

    #[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Row)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::ipv4")]
        ipv4: Ipv4Addr,
        ipv6: Ipv6Addr, // requires no annotations.
        #[serde(with = "clickhouse::serde::ipv4::option")]
        ipv4_opt: Option<Ipv4Addr>,
        ipv6_opt: Option<Ipv6Addr>, // requires no annotations.
    }

    client
        .query(
            "
            CREATE TABLE test(
                ipv4 IPv4,
                ipv6 IPv6,
                ipv4_opt Nullable(IPv4),
                ipv6_opt Nullable(IPv6),
            ) ENGINE = MergeTree ORDER BY ipv4
        ",
        )
        .execute()
        .await
        .unwrap();

    let original_row = MyRow {
        ipv4: Ipv4Addr::new(192, 168, 0, 1),
        ipv6: Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0xafc8, 0x10, 0x1),
        ipv4_opt: Some(Ipv4Addr::new(192, 168, 0, 1)),
        ipv6_opt: Some(Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0xafc8, 0x10, 0x1)),
    };

    let mut insert = client.insert::<MyRow>("test").await.unwrap();
    insert.write(&original_row).await.unwrap();
    insert.end().await.unwrap();

    let (row, row_ipv4_str, row_ipv6_str) = client
        .query("SELECT ?fields, toString(ipv4), toString(ipv6) FROM test")
        .fetch_one::<(MyRow, String, String)>()
        .await
        .unwrap();

    assert_eq!(row, original_row);
    assert_eq!(row_ipv4_str, original_row.ipv4.to_string());
    assert_eq!(row_ipv6_str, original_row.ipv6.to_string());
}
