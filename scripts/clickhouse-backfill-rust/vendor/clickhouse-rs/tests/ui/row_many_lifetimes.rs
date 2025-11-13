#[derive(clickhouse::Row)]
struct Row<'a, 'b> {
    a: &'a str,
    b: &'b str,
}

fn main() {}
