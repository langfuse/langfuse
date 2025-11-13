//! # UI failure tests
//!
//! These tests are designed to ensure that the `#[derive(Row)]` macro
//! produces expected errors when used incorrectly. Test cases must be
//! added to the `tests/ui/` directory (use existing ones as an example).
//!
//! Run with `TRYBUILD=overwrite` to update snapshots (*.stderr files).

#[test]
fn ui() {
    let t = trybuild::TestCases::new();
    t.compile_fail("tests/ui/*.rs");
}
