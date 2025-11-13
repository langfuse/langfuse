use rand::Rng;
use rand::distr::Alphanumeric;

use clickhouse::sql::Identifier;
use clickhouse::{Client, error::Result};

// This example covers derivation of container-like ClickHouse data types.
// See also:
// - https://clickhouse.com/docs/en/sql-reference/data-types
// - data_types_derive_simple.rs

#[tokio::main]
async fn main() -> Result<()> {
    let table_name = "chrs_data_types_derive_containers";
    let client = Client::default().with_url("http://localhost:8123");

    client
        .query(
            "
            CREATE OR REPLACE TABLE ?
            (
                arr               Array(String),
                arr2              Array(Array(String)),
                map               Map(String, UInt32),
                tuple             Tuple(String, UInt32),
                nested            Nested(name String, count UInt32),
                point             Point,
                ring              Ring,
                polygon           Polygon,
                multi_polygon     MultiPolygon,
                line_string       LineString,
                multi_line_string MultiLineString
            ) ENGINE MergeTree ORDER BY ();
            ",
        )
        .bind(Identifier(table_name))
        .execute()
        .await?;

    let mut insert = client.insert::<MyRow>(table_name).await?;
    insert.write(&MyRow::new()).await?;
    insert.end().await?;

    let rows = client
        .query("SELECT ?fields FROM ?")
        .bind(Identifier(table_name))
        .fetch_all::<MyRow>()
        .await?;

    println!("{rows:#?}");
    Ok(())
}

// See https://clickhouse.com/docs/en/sql-reference/data-types/geo
type Point = (f64, f64);
type Ring = Vec<Point>;
type Polygon = Vec<Ring>;
type MultiPolygon = Vec<Polygon>;
type LineString = Vec<Point>;
type MultiLineString = Vec<LineString>;

#[derive(Clone, Debug, PartialEq)]
#[derive(clickhouse::Row, serde::Serialize, serde::Deserialize)]
pub struct MyRow {
    arr: Vec<String>,
    arr2: Vec<Vec<String>>,
    map: Vec<(String, u32)>,
    tuple: (String, u32),
    // Nested columns are internally represented as arrays of the same length
    // https://clickhouse.com/docs/en/sql-reference/data-types/nested-data-structures/nested
    #[serde(rename = "nested.name")]
    nested_name: Vec<String>,
    #[serde(rename = "nested.count")]
    nested_count: Vec<u32>,
    // Geo types
    point: Point,
    ring: Ring,
    polygon: Polygon,
    multi_polygon: MultiPolygon,
    line_string: LineString,
    multi_line_string: MultiLineString,
}

impl MyRow {
    pub fn new() -> Self {
        let mut rng = rand::rng();
        MyRow {
            arr: vec![random_str()],
            arr2: vec![vec![random_str()]],
            map: vec![(random_str(), 42)],
            tuple: (random_str(), 144),
            // Nested
            // NB: the length of all vectors/slices representing Nested columns must be the same
            nested_name: vec![random_str(), random_str()],
            nested_count: vec![rng.random(), rng.random()],
            // Geo
            point: random_point(),
            ring: random_ring(),
            polygon: random_polygon(),
            multi_polygon: vec![random_polygon()],
            line_string: random_ring(), // on the type level, the same as the Ring
            multi_line_string: random_polygon(), // on the type level, the same as the Polygon
        }
    }
}

impl Default for MyRow {
    fn default() -> Self {
        Self::new()
    }
}

fn random_str() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(3)
        .map(char::from)
        .collect()
}

fn random_point() -> Point {
    let mut rng = rand::rng();
    (rng.random(), rng.random())
}

fn random_ring() -> Ring {
    vec![random_point(), random_point()]
}

fn random_polygon() -> Polygon {
    vec![random_ring(), random_ring()]
}
