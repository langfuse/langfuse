use std::fmt;

// Trust clickhouse-connect https://github.com/ClickHouse/clickhouse-connect/blob/5d85563410f3ec378cb199ec51d75e033211392c/clickhouse_connect/driver/binding.py#L15

// See https://clickhouse.tech/docs/en/sql-reference/syntax/#syntax-string-literal
pub(crate) fn string(src: &str, dst: &mut impl fmt::Write) -> fmt::Result {
    dst.write_char('\'')?;
    escape(src, dst)?;
    dst.write_char('\'')
}

// See https://clickhouse.tech/docs/en/sql-reference/syntax/#syntax-identifiers
pub(crate) fn identifier(src: &str, dst: &mut impl fmt::Write) -> fmt::Result {
    dst.write_char('`')?;
    escape(src, dst)?;
    dst.write_char('`')
}

pub(crate) fn escape(src: &str, dst: &mut impl fmt::Write) -> fmt::Result {
    const REPLACE: &[char] = &['\\', '\'', '`', '\t', '\n'];
    let mut rest = src;
    while let Some(nextidx) = rest.find(REPLACE) {
        let (before, after) = rest.split_at(nextidx);
        rest = &after[1..];
        dst.write_str(before)?;
        dst.write_char('\\')?;
        dst.write_str(&after[..1])?;
    }
    dst.write_str(rest)
}

// See https://clickhouse.com/docs/en/sql-reference/syntax#string
pub(crate) fn hex_bytes(s: &[u8], dst: &mut impl fmt::Write) -> fmt::Result {
    dst.write_char('X')?;
    dst.write_char('\'')?;
    for &byte in s {
        write!(dst, "{byte:02X}")?;
    }
    dst.write_char('\'')
}

#[test]
fn it_escapes_string() {
    let mut actual = String::new();
    string(r"f\o'o '' b\'ar'", &mut actual).unwrap();
    assert_eq!(actual, r"'f\\o\'o \'\' b\\\'ar\''");
}

#[test]
fn it_escapes_identifier() {
    let mut actual = String::new();
    identifier(r"f\o`o `` b\`ar`", &mut actual).unwrap();
    assert_eq!(actual, r"`f\\o\`o \`\` b\\\`ar\``");
}
