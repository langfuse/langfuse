#[derive(clickhouse::Row)]
enum Enum {
    A(i32),
    B(String),
}

#[derive(clickhouse::Row)]
union Union {
    a: i32,
    b: u64,
}

#[derive(clickhouse::Row)]
pub struct UnitStruct;

#[derive(clickhouse::Row)]
pub struct EmptyStruct {}

fn main() {}
