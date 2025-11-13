use crate::sql;
use serde::{Deserialize, Serialize};

#[doc(hidden)]
#[derive(Debug, Clone, PartialEq)]
pub enum RowKind {
    Primitive,
    Struct,
    Tuple,
    Vec,
}

/// Represents a row that can be used in queries.
///
/// Implemented for:
/// * All [`#[derive(Row)]`][row-derive] items
/// * `(P1, P2, ...)` where P* is a primitive type or string
///
/// Do not implement this trait directly, use [`#[derive(Row)]`][row-derive] instead.
///
/// In order to write a generic code over rows, check
/// * [`RowRead`] for reading queries.
/// * [`RowWrite`] for writing queries.
/// * [`RowOwned`] for rows that do not hold any references.
///
/// [row-derive]: derive@crate::Row
pub trait Row {
    // NOTE: all properties are unstable and, hence, not following semver.

    #[doc(hidden)]
    const NAME: &'static str;
    // TODO: different list for SELECT/INSERT (de/ser)
    #[doc(hidden)]
    const COLUMN_NAMES: &'static [&'static str];
    #[doc(hidden)]
    const COLUMN_COUNT: usize;
    #[doc(hidden)]
    const KIND: RowKind;
    #[doc(hidden)]
    type Value<'a>: Row;
}

/// Represents a row that can be read from the database.
///
/// This trait is implemented automatically for all `Row + Deserialize` types.
///
/// The main purpose of this trait is to simplify writing generic code.
///
/// # Examples
/// Let's say we want to iterate over rows of a provided table in a generic way
/// and apply a function to each row:
/// ```
/// use clickhouse::{Client, RowOwned, RowRead, sql::Identifier, error::Result};
///
/// async fn iterate<R: RowOwned + RowRead>(
///     table: &str,
///     client: Client,
///     f: impl Fn(R),
/// ) -> Result<()> {
///     let mut cursor = client
///         .query("SELECT ?fields FROM ?")
///         .bind(Identifier(table))
///         .fetch::<R>()?;
///
///     while let Some(row) = cursor.next().await? {
///         f(row);
///     }
///
///     Ok(())
/// }
///
/// // Usage
///
/// #[derive(clickhouse::Row, serde::Deserialize)]
/// struct SomeRow { a: u32, b: String }
/// fn callback(row: SomeRow) {}
///
/// # async fn usage(client: Client) -> Result<()> {
/// iterate::<SomeRow>("table", client, callback).await?;
/// # Ok(())
/// # }
/// ```
///
/// However, this code works only for rows that do not hold any references.
/// To support also rows that borrows data from cursor (avoiding extra allocations),
/// the signature should be changed to less intuitive one:
/// ```
/// # use clickhouse::{Client, Row, RowRead, sql::Identifier, error::Result};
/// async fn iterate<R: Row + RowRead>(  //<<< Row instead of RowOwned
///     table: &str,
///     client: Client,
///     f: impl Fn(R::Value<'_>),        //<<< R::Value instead of R
/// ) -> Result<()> {
///     /* same code */
/// #   let mut cursor = client.query("SELECT ?fields FROM ?").bind(Identifier(table)).fetch::<R>()?;
/// #   while let Some(row) = cursor.next().await? { f(row); }
/// #   Ok(())
/// }
///
/// // Usage
///
/// #[derive(Row, serde::Deserialize)]
/// struct SomeRow<'a> { a: u32, b: &'a str }
/// fn callback(row: SomeRow<'_>) {}
///
/// # async fn usage(client: Client) -> Result<()> {
/// iterate::<SomeRow<'_>>("table", client, callback).await?;
/// # Ok(())
/// # }
/// ```
///
/// We use [`Row`] instead of [`RowOwned`] and `R::Value<'_>` instead of `R` here.
/// The last one is actually the same `R` but with a changed lifetime restricted
/// to the cursor.
pub trait RowRead: for<'a> Row<Value<'a>: Deserialize<'a>> {}
impl<R> RowRead for R where R: for<'a> Row<Value<'a>: Deserialize<'a>> {}

/// Represents a row that can be written into the database.
///
/// This trait is implemented automatically for all `Row + Serialize` types.
///
/// The main purpose of this trait is to simplify writing generic code.
///
/// # Examples
/// Let's say we want to write a function that insert the provided batch of rows:
/// ```
/// use clickhouse::{Client, RowOwned, RowWrite, error::Result};
///
/// async fn write_batch<R: RowOwned + RowWrite>(
///     table: &str,
///     client: Client,
///     data: &[R],
/// ) -> Result<()> {
///     let mut insert = client.insert::<R>(table).await?;
///     for row in data {
///         insert.write(row).await?;
///     }
///     insert.end().await
/// }
///
/// // Usage
///
/// #[derive(clickhouse::Row, serde::Serialize)]
/// struct SomeRow { a: u32, b: String }
///
/// # async fn usage(client: Client) -> Result<()> {
/// write_batch::<SomeRow>("table", client, &[/* ... */]).await?;
/// # Ok(())
/// # }
/// ```
///
/// However, this code works only for rows that do not hold any references.
/// To support also rows that borrows data avoiding extra allocations,
/// the signature should be changed to less intuitive one:
/// ```
/// # use clickhouse::{Client, Row, RowWrite, error::Result};
/// async fn write_batch<R: Row + RowWrite>(  //<<< Row instead of RowOwned
///     table: &str,
///     client: Client,
///     data: &[R::Value<'_>],                //<<< R::Value instead of R
/// ) -> Result<()> {
///     /* same code */
/// #   let mut insert = client.insert::<R>(table).await?;
/// #   for row in data { insert.write(row).await?; }
/// #   insert.end().await
/// }
///
/// // Usage
///
/// #[derive(Row, serde::Serialize)]
/// struct SomeRow<'a> { a: u32, b: &'a str }
///
/// # async fn usage(client: Client) -> Result<()> {
/// let (first_b, second_b) = ("first", "second");
/// let rows = [SomeRow { a: 0, b: first_b }, SomeRow { a: 1, b: second_b }];
/// write_batch::<SomeRow>("table", client, &rows).await?;
/// # Ok(())
/// # }
/// ```
///
/// We use [`Row`] instead of [`RowOwned`] and `R::Value<'_>` instead of `R` here.
/// The last one is actually the same `R` but with a changed lifetime restricted to data.
pub trait RowWrite: for<'a> Row<Value<'a>: Serialize> {}
impl<R> RowWrite for R where R: for<'a> Row<Value<'a>: Serialize> {}

/// Represents a row not holding any references.
///
/// This trait is implemented automatically and useful for writing generic code.
/// Usually used with [`RowRead`] and [`RowWrite`].
pub trait RowOwned: 'static + for<'a> Row<Value<'a> = Self> {}
impl<R> RowOwned for R where R: 'static + for<'a> Row<Value<'a> = R> {}

// Actually, it's not public now.
#[doc(hidden)]
pub trait Primitive {}

macro_rules! impl_primitive_for {
    ($t:ty, $($other:tt)*) => {
        impl Primitive for $t {}
        impl_primitive_for!($($other)*);
    };
    () => {};
}

// TODO: char? &str? SocketAddr? Path? Duration? NonZero*?
impl_primitive_for![
    bool, String, u8, u16, u32, u64, u128, usize, i8, i16, i32, i64, i128, isize, f32, f64,
];

macro_rules! count_tokens {
    () => { 0 };
    ($head:tt $($tail:tt)*) => { 1 + count_tokens!($($tail)*) };
}

/// Two forms are supported:
/// * (P1, P2, ...)
/// * (SomeRow, P1, P2, ...)
///
/// The second one is useful for queries like
/// `SELECT ?fields, count() FROM ... GROUP BY ?fields`.
macro_rules! impl_row_for_tuple {
    ($i:ident $($other:ident)+) => {
        impl<$i: Row, $($other: Primitive),+> Row for ($i, $($other),+) {
            const NAME: &'static str = $i::NAME;
            const COLUMN_NAMES: &'static [&'static str] = $i::COLUMN_NAMES;
            const COLUMN_COUNT: usize = $i::COLUMN_COUNT + count_tokens!($($other)*);
            const KIND: RowKind = RowKind::Tuple;

            type Value<'a> = Self;
        }

        impl_row_for_tuple!($($other)+);
    };
    ($i:ident) => {};
}

// TODO: revise this?
impl Primitive for () {}

impl<P: Primitive> Row for P {
    const NAME: &'static str = stringify!(P);
    const COLUMN_NAMES: &'static [&'static str] = &[];
    const COLUMN_COUNT: usize = 1;
    const KIND: RowKind = RowKind::Primitive;

    type Value<'a> = Self;
}

impl_row_for_tuple!(T0 T1 T2 T3 T4 T5 T6 T7 T8);

impl<T> Row for Vec<T> {
    const NAME: &'static str = "Vec";
    const COLUMN_NAMES: &'static [&'static str] = &[];
    const COLUMN_COUNT: usize = 1;
    const KIND: RowKind = RowKind::Vec;

    type Value<'a> = Self;
}

/// Collects all field names in depth and joins them with comma.
pub(crate) fn join_column_names<R: Row>() -> Option<String> {
    if R::COLUMN_NAMES.is_empty() {
        return None;
    }

    let out = R::COLUMN_NAMES
        .iter()
        .enumerate()
        .fold(String::new(), |mut res, (idx, name)| {
            if idx > 0 {
                res.push(',');
            }
            sql::escape::identifier(name, &mut res).expect("impossible");
            res
        });

    Some(out)
}

#[cfg(test)]
mod tests {
    use crate::Row;

    use super::*;

    #[test]
    fn it_grabs_simple_struct() {
        #[derive(Row)]
        #[clickhouse(crate = "crate")]
        #[allow(dead_code)]
        struct Simple1 {
            one: u32,
        }

        #[derive(Row)]
        #[clickhouse(crate = "crate")]
        #[allow(dead_code)]
        struct Simple2 {
            one: u32,
            two: u32,
        }

        assert_eq!(join_column_names::<Simple1>().unwrap(), "`one`");
        assert_eq!(join_column_names::<Simple2>().unwrap(), "`one`,`two`");
    }

    #[test]
    fn it_grabs_mix() {
        #[derive(Row)]
        #[clickhouse(crate = "crate")]
        struct SomeRow {
            _a: u32,
        }

        assert_eq!(join_column_names::<(SomeRow, u32)>().unwrap(), "`_a`");
    }

    #[test]
    fn it_supports_renaming() {
        use serde::Serialize;

        #[derive(Row, Serialize)]
        #[clickhouse(crate = "crate")]
        #[allow(dead_code)]
        struct TopLevel {
            #[serde(rename = "two")]
            one: u32,
        }

        assert_eq!(join_column_names::<TopLevel>().unwrap(), "`two`");
    }

    #[test]
    fn it_skips_serializing() {
        use serde::Serialize;

        #[derive(Row, Serialize)]
        #[clickhouse(crate = "crate")]
        #[allow(dead_code)]
        struct TopLevel {
            one: u32,
            #[serde(skip_serializing)]
            two: u32,
        }

        assert_eq!(join_column_names::<TopLevel>().unwrap(), "`one`");
    }

    #[test]
    fn it_skips_deserializing() {
        use serde::Deserialize;

        #[derive(Row, Deserialize)]
        #[clickhouse(crate = "crate")]
        #[allow(dead_code)]
        struct TopLevel {
            one: u32,
            #[serde(skip_deserializing)]
            two: u32,
        }

        assert_eq!(join_column_names::<TopLevel>().unwrap(), "`one`");
    }

    #[test]
    fn it_rejects_other() {
        #[allow(dead_code)]
        #[derive(Row)]
        #[clickhouse(crate = "crate")]
        struct NamedTuple(u32, u32);

        assert_eq!(join_column_names::<u32>(), None);
        assert_eq!(join_column_names::<(u32, u64)>(), None);
        assert_eq!(join_column_names::<NamedTuple>(), None);
    }

    #[test]
    fn it_handles_raw_identifiers() {
        use serde::Serialize;

        #[derive(Row, Serialize)]
        #[clickhouse(crate = "crate")]
        #[allow(dead_code)]
        struct MyRow {
            r#type: u32,
            #[serde(rename = "if")]
            r#match: u32,
        }

        assert_eq!(join_column_names::<MyRow>().unwrap(), "`type`,`if`");
    }
}
