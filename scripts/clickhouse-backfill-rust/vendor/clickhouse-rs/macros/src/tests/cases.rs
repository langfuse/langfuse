//! # Snapshot tests for `Row` derive macro.
//!
//! - This module contains happy path tests. For failures, see `tests/ui/`.
//! - These tests are supposed to be used as intermediate checks for complex
//!   code generation, not as a final integration tests.

use super::render;

#[test]
fn simple_owned_row() {
    render! {
        #[derive(Row)]
        struct Sample {
            a: i32,
            b: String,
        }
    }
}

#[test]
fn generic_owned_row() {
    render! {
        #[derive(Row)]
        struct Sample<T> {
            a: i32,
            b: T,
        }
    }

    render! {
        #[derive(Row)]
        struct Sample<A, B> {
            a: A,
            b: B,
        }
    }

    render! {
        #[derive(Row)]
        struct Sample<T> where T: Clone {
            a: i32,
            b: T,
        }
    }
}

#[test]
fn simple_borrowed_row() {
    render! {
        #[derive(Row)]
        struct Sample<'a> {
            a: i32,
            b: &'a str,
        }
    }
}

#[test]
fn generic_borrowed_row() {
    render! {
        #[derive(Row)]
        struct Sample<'a, T> {
            a: i32,
            b: &'a T,
        }
    }

    render! {
        #[derive(Row)]
        struct Sample<'a, A, B> {
            a: A,
            b: &'a B,
        }
    }

    render! {
        #[derive(Row)]
        struct Sample<'a, T> where T: Clone {
            a: i32,
            b: &'a T,
        }
    }
}

#[test]
fn serde_rename() {
    render! {
        #[derive(Row)]
        struct Sample {
            a: i32,
            #[serde(rename = "items.a")]
            items_a: Vec<String>,
            #[serde(rename = "items.b")]
            items_b: Vec<u32>,
        }
    }
}

#[test]
fn serde_skip_serializing() {
    render! {
        #[derive(Row)]
        struct Sample {
            a: u32,
            #[serde(skip_serializing)]
            b: u32,
        }
    }
}

#[test]
fn serde_skip_deserializing() {
    render! {
        #[derive(Row)]
        struct Sample {
            a: u32,
            #[serde(skip_deserializing)]
            b: u32,
        }
    }
}

#[test]
fn crate_attribute() {
    render! {
        #[derive(Row)]
        #[clickhouse(crate = "foo")]
        struct Foo {
            a: u32,
            b: u32,
        }
    }
}
