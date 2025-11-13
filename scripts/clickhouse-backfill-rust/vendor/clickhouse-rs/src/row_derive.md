Derive macro for [`Row`][trait@crate::Row].

```rust,no_run
use clickhouse::Row;

#[derive(Row)]
struct MyRow {
    foo: u32,
    bar: String,
    baz: bool, 
}
```

# `#[clickhouse(crate = "...")]`

Override the name of the `clickhouse` crate where referenced by the macro.

Useful if the `clickhouse` package is renamed in Cargo.


## Example
`Cargo.toml`:
```toml
# Renames the `clickhouse` dependency to `foo`
[dependencies.foo]
package = "clickhouse"
version = "0.14"
```

```rust,no_run
# extern crate clickhouse as foo;
use foo::Row;

#[derive(Row)]
#[clickhouse(crate = "foo")]
struct MyRow {
    foo: u32,
    bar: String,
    baz: bool, 
}
```
