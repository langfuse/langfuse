//! Infer literal path candidates following `cat` in command text.
//!
//! Quote boundaries keep commands inside quoted payloads from consuming surrounding
//! text. Matching does not interpret command names, execution, or expansions: quoted
//! data can still look like a read, and escaped/concatenated filenames stay unresolved.
//! Literal boundaries are inferred locally without parsing the surrounding language.
//! Conflicting intervals retain raw matching. Callers own input-size limits, path
//! validation, and limits on returned resources.

use std::collections::HashSet;

pub(crate) fn cat_file_paths(command: &str) -> impl Iterator<Item = &str> {
    argument_paths(command, cat_candidates(command))
}

fn cat_candidates(command: &str) -> impl Iterator<Item = (usize, usize)> + '_ {
    let mut limits = QuoteLimits::new(command);
    command
        .match_indices("cat")
        .filter(|&(start, _)| is_cat_candidate(command, start))
        .map(move |(start, _)| (start + 3, limits.at(command, start)))
}

fn is_cat_candidate(command: &str, start: usize) -> bool {
    let prefix = &command[..start];
    let separator = prefix.is_empty()
        || prefix.ends_with("\\n")
        || prefix
            .chars()
            .next_back()
            .is_some_and(|c| matches!(c, ';' | '"' | '\'' | '`') || is_command_whitespace(c));
    separator && matches!(command.as_bytes().get(start + 3), Some(b' ' | b'\t'))
}

fn is_command_whitespace(character: char) -> bool {
    character == '\u{feff}' || (character.is_whitespace() && character != '\u{0085}')
}

fn argument_paths(
    command: &str,
    mut candidates: impl Iterator<Item = (usize, usize)>,
) -> impl Iterator<Item = &str> {
    let mut visited = VisitedCursors::new(command.len());
    let mut argument_cursor = None;
    std::iter::from_fn(move || loop {
        if let Some(path) = read_argument(command, &mut argument_cursor, &mut visited) {
            return Some(path);
        }
        argument_cursor = Some(candidates.next()?);
    })
}

#[inline]
fn read_argument<'a>(
    command: &'a str,
    next: &mut Option<(usize, usize)>,
    visited: &mut VisitedCursors,
) -> Option<&'a str> {
    let (cursor, limit) = next.take()?;
    if !visited.insert(cursor, limit) {
        return None;
    }
    let (consumed, path) = argument(&command[cursor..limit])?;
    *next = Some((cursor + consumed, limit));
    Some(path)
}

struct QuoteLimits {
    first_quote: Option<usize>,
    ranges: Option<Vec<(usize, usize)>>,
    cursor: usize,
    parents: Vec<(usize, usize)>,
}
impl QuoteLimits {
    fn new(command: &str) -> Self {
        Self {
            first_quote: command
                .find('\'')
                .into_iter()
                .chain(command.find('"'))
                .min(),
            ranges: None,
            cursor: 0,
            parents: Vec::new(),
        }
    }
    #[inline]
    fn at(&mut self, command: &str, start: usize) -> usize {
        if self.first_quote.is_none_or(|p| p >= start) {
            return command.len();
        }
        let ranges = self
            .ranges
            .get_or_insert_with(|| quote_regions(command).unwrap_or_default());
        while self.cursor < ranges.len() && ranges[self.cursor].0 <= start {
            let range = ranges[self.cursor];
            while self.parents.last().is_some_and(|p| p.1 <= range.0) {
                self.parents.pop();
            }
            self.parents.push(range);
            self.cursor += 1;
        }
        while self.parents.last().is_some_and(|p| p.1 <= start) {
            self.parents.pop();
        }
        self.parents.last().map_or(command.len(), |r| r.1)
    }
}

struct VisitedCursors {
    bitmap: Vec<u64>,
    bitmap_words: usize,
    bitmap_limit: usize,
    other_limits: Option<HashSet<(usize, usize)>>,
}

impl VisitedCursors {
    fn new(command_len: usize) -> Self {
        Self {
            bitmap: Vec::new(),
            bitmap_words: command_len / 64 + 1,
            bitmap_limit: 0,
            other_limits: None,
        }
    }

    fn insert(&mut self, cursor: usize, limit: usize) -> bool {
        // Most arguments share a boundary, so a bitmap avoids hashing that common case.
        if self.bitmap.is_empty() {
            self.bitmap.resize(self.bitmap_words, 0);
            self.bitmap_limit = limit;
        }
        if limit != self.bitmap_limit {
            return self
                .other_limits
                .get_or_insert_with(HashSet::new)
                .insert((cursor, limit));
        }
        let slot = &mut self.bitmap[cursor / 64];
        let bit = 1u64 << (cursor % 64);
        let fresh = *slot & bit == 0;
        *slot |= bit;
        fresh
    }
}

// Match the existing literal argument syntax without allocating regex captures.
// Escapes remain literal, and a quoted argument cannot span CR/LF.
fn argument(source: &str) -> Option<(usize, &str)> {
    let start = source
        .bytes()
        .position(|byte| !matches!(byte, b' ' | b'\t'))?;
    if start == 0 {
        return None;
    }
    let tail = &source[start..];
    match tail.as_bytes()[0] {
        quote @ (b'\'' | b'"') => {
            let end = 1 + tail[1..]
                .bytes()
                .position(|byte| byte == quote || matches!(byte, b'\r' | b'\n'))?;
            (tail.as_bytes()[end] == quote).then_some((start + end + 1, &tail[1..end]))
        }
        _ => {
            let end = tail
                .char_indices()
                .find(|(_, character)| {
                    if character.is_ascii() {
                        matches!(
                            character,
                            '\t'..='\r'
                                | ' '
                                | '"'
                                | '\''
                                | '`'
                                | '\\'
                                | ';'
                                | '|'
                                | '&'
                                | ','
                                | '('
                                | ')'
                                | '{'
                                | '}'
                                | '<'
                                | '>'
                        )
                    } else {
                        (*character != '\u{0085}' && character.is_whitespace())
                            || *character == '\u{feff}'
                    }
                })
                .map_or(tail.len(), |(position, _)| position);
            (end != 0).then_some((start + end, &tail[..end]))
        }
    }
}

fn literal_boundary(c: char) -> bool {
    is_command_whitespace(c)
        || matches!(
            c,
            ';' | '|'
                | '&'
                | '('
                | ')'
                | '['
                | ']'
                | '{'
                | '}'
                | '<'
                | '>'
                | ','
                | '='
                | ':'
                | '\''
                | '"'
        )
}
// Match possible literals independently for each quote character. An apostrophe
// inside a word cannot open a token, and a quote followed by path text cannot close
// one. This keeps prose apostrophes from hiding reads without recognizing comment syntax.
fn quote_regions(source: &str) -> Option<Vec<(usize, usize)>> {
    let mut previous = [None, None];
    let mut ranges = Vec::new();
    let mut escaped = false;
    for (position, byte) in source.bytes().enumerate() {
        if escaped {
            escaped = false;
            continue;
        }
        if byte == b'\\' {
            escaped = true;
            continue;
        }
        let kind = match byte {
            b'\'' => 0,
            b'"' => 1,
            _ => continue,
        };
        if let Some(opening) = previous[kind] {
            let before = source[..opening].chars().next_back();
            let first = source[opening + 1..].chars().next();
            let after = source[position + 1..].chars().next();
            // A separator-led span may start at a wrapper's closing quote. Leave
            // it unbounded rather than treating later commands as one filename.
            if before.is_none_or(|c| literal_boundary(c) && !matches!(c, '\'' | '"'))
                && first.is_none_or(|c| !matches!(c, ';' | '&' | '|' | ')' | ']' | '}'))
                && after.is_none_or(literal_boundary)
            {
                ranges.push((opening + 1, position));
            }
        }
        previous[kind] = Some(position);
    }
    ranges.sort_unstable();
    // Crossed intervals admit conflicting readings. Do not let either reading
    // suppress a path; only disjoint or nested literals can constrain arguments.
    let mut ends = Vec::new();
    for &(start, end) in &ranges {
        while ends.last().is_some_and(|&e| e <= start) {
            ends.pop();
        }
        if ends.last().is_some_and(|&e| e < end) {
            return None;
        }
        ends.push(end);
    }
    Some(ranges)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    #[test]
    fn quoted_payload_cannot_consume_outer_commands() {
        for (command, expected) in [
            (
                r#"bash -lc "cat docs/first.md " && cat docs/guide.md && echo "done""#,
                vec!["docs/first.md", "docs/guide.md"],
            ),
            (
                r#"runner --eval "cat " && cat docs/guide.md && echo "done""#,
                vec!["docs/guide.md"],
            ),
            (
                r#"runner --eval "echo 'ok'; cat " && cat docs/guide.md && echo "done""#,
                vec!["docs/guide.md"],
            ),
        ] {
            for prefix in [
                "",
                "echo http://example.com; ",
                "ls /tmp//data; ",
                "ls docs/*/; ",
            ] {
                let command = format!("{prefix}{command}");
                assert_eq!(
                    cat_file_paths(&command).collect::<Vec<_>>(),
                    expected,
                    "{command}"
                );
            }
        }
    }
    #[test]
    fn operators_inside_a_quoted_filename_are_preserved() {
        assert_eq!(
            cat_file_paths(r#"cat "docs/guide.md && echo ""#).collect::<Vec<_>>(),
            ["docs/guide.md && echo "]
        );
    }

    #[test]
    fn escaped_quotes_do_not_create_false_child_boundaries() {
        let command = r#"runner --eval "echo \"Don't\"; cat 'docs/guide.md'; echo \"won't\"""#;
        assert_eq!(
            cat_file_paths(command).collect::<Vec<_>>(),
            ["docs/guide.md"]
        );
    }

    fn wrapped_command(before: &str, payload: &str, after: &str) -> String {
        format!(
            "{before}runner({});{after}",
            serde_json::to_string(payload).unwrap()
        )
    }

    #[test]
    fn surrounding_text_and_statements_preserve_known_reads() {
        let prefixes = [
            "",
            "cd /tmp; ",
            "echo x; ",
            "echo ''; ",
            "echo 'x'; ",
            "echo 'start'; cd /tmp; ",
            "echo 'x'; echo 'y'; ",
            "echo \"x\"; ",
            "echo \"Don't\"; ",
            "echo \"'\"; ",
            "ls docs/*/; echo '/* text */'; ",
        ];
        let suffixes = [
            "",
            "; echo end",
            "; echo '// text'",
            "; echo 'done'",
            "; echo \"done\"",
            "; echo \"won't\"",
        ];
        let comments = [
            ("", ""),
            ("-- Let's read it\n", "\n-- It's done"),
            ("Let's read it.\n", "\nIt's done."),
            ("REM Let's read it\n", "\nREM It's done"),
            ("// Let's read it\n", "\n// It's done"),
            ("// Let's read it\r\n", "\r\n// It's done"),
            ("// Let's read it\n", ""),
            ("", "\n// It's done"),
            ("/* Let's read it */\n", "\n/* It's done */"),
            ("/* Let's read it */", "/* It's done */"),
            ("const x=1;//Let's read it\n", "/*It's done*/"),
            ("let x/*Let's*/=1;", "/*It's done*/"),
            ("/* \"It's\" ready */", "// \"It's\" done"),
        ];
        for prefix in prefixes {
            for suffix in suffixes {
                for (before, after) in comments {
                    let payload = format!("{prefix}cat 'docs/guide.md'{suffix}");
                    let command = wrapped_command(before, &payload, after);
                    assert_eq!(
                        cat_file_paths(&command).collect::<Vec<_>>(),
                        ["docs/guide.md"],
                        "{command}"
                    );
                }
            }
        }
    }

    #[test]
    fn argument_matches_the_regex_contract() {
        let regex = fancy_regex::Regex::new(r#"^[ \t]+(?:'([^'\r\n]*)'|"([^"\r\n]*)"|([^\t-\r \u{00a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}"'`\\;|&,(){}<>]+))"#).unwrap();
        let characters = (0..=255).filter_map(char::from_u32).chain([
            '\u{1680}', '\u{2000}', '\u{2001}', '\u{2002}', '\u{2003}', '\u{2004}', '\u{2005}',
            '\u{2006}', '\u{2007}', '\u{2008}', '\u{2009}', '\u{200a}', '\u{200b}', '\u{2028}',
            '\u{2029}', '\u{202f}', '\u{205f}', '\u{3000}', '\u{feff}', '😀',
        ]);
        for c in characters {
            for prefix in ["", " ", "\t", " \t "] {
                for body in [
                    format!("{c}"),
                    format!("x{c}y next"),
                    format!("'{c}' next"),
                    format!("\"x{c}y\" next"),
                    format!("'{c}"),
                    format!("\"{c}"),
                ] {
                    let source = format!("{prefix}{body}");
                    let captures = regex.captures(&source).unwrap();
                    let expected = captures.as_ref().map(|captures| {
                        (
                            captures.get(0).unwrap().end(),
                            captures
                                .get(1)
                                .or_else(|| captures.get(2))
                                .or_else(|| captures.get(3))
                                .unwrap()
                                .as_str(),
                        )
                    });
                    assert_eq!(argument(&source), expected, "{source:?}");
                }
            }
        }
    }

    #[test]
    fn repeated_candidates_do_not_rescan_argument_suffixes() {
        assert_eq!(cat_file_paths(&"cat ".repeat(4096)).count(), 4095);
    }

    #[test]
    fn quote_boundaries_preserve_compatibility_candidates() {
        for (command, expected) in [
            (
                "cat docs/first.md 2>/dev/null; cat docs/guide.md",
                vec!["docs/first.md", "2", "docs/guide.md"],
            ),
            (
                "cat docs/first.md; echo \"$HOME\"; cat docs/guide.md",
                vec!["docs/first.md", "docs/guide.md"],
            ),
            (
                r#"runner --eval "cat docs/first.md " && cat docs/guide.md && echo "done" 2>/dev/null"#,
                vec!["docs/first.md", "docs/guide.md"],
            ),
            (
                "# \"\ncat \"docs/first.md\" \"docs/guide.md\"\n# \"",
                vec!["docs/first.md", "docs/guide.md"],
            ),
            (
                r#"echo "$( cat "docs/first.md")"; cat docs/guide.md"#,
                vec!["docs/first.md", "docs/guide.md"],
            ),
            (
                "cat docs/first.md; cat <<EOF\ncat docs/data.md\nEOF\ncat docs/guide.md",
                vec!["docs/first.md", "docs/data.md", "docs/guide.md"],
            ),
            (
                "echo 'cat docs/data.md'; cat docs/guide.md",
                vec!["docs/data.md", "docs/guide.md"],
            ),
            (
                "echo Let's go && cat 'docs/guide.md' && echo It's done",
                vec!["docs/guide.md"],
            ),
            (
                r#"cat "docs/it's.md" 'docs/a"b.md'"#,
                vec!["docs/it's.md", "docs/a\"b.md"],
            ),
        ] {
            assert_eq!(
                cat_file_paths(command).collect::<Vec<_>>(),
                expected,
                "{command}"
            );
        }
    }

    proptest! {
        #[test]
        fn surrounding_text_preserves_generated_reads(
            files in prop::collection::vec("[a-z0-9_-]{1,16}", 1..5),
            preceding in prop::collection::vec(prop::sample::select(vec![
                "pwd", "cd /tmp", "echo 'x'", "echo ''", "echo \"Don't\"",
                "echo '/* text */'", "echo '// text'", "echo '# text'",
                "ls docs/*/", "ls /tmp//data", "echo https://example.test",
            ]), 0..5),
            following in prop::collection::vec(prop::sample::select(vec![
                "echo done", "echo 'done'", "echo \"won't\"", "echo '/* text */'", "echo '// text'",
            ]), 0..5),
            before in prop::collection::vec(prop::sample::select(vec!["Let's", "It's", "text", "#", "/", "*", "-", "\"", "'", " ", "\n", "😀"]), 0..16),
            after in prop::collection::vec(prop::sample::select(vec!["Let's", "It's", "text", "#", "/", "*", "-", "\"", "'", " ", "\n", "😀"]), 0..16),
        ) {
            let paths = files.iter().map(|file| format!("docs/{file}.md")).collect::<Vec<_>>();
            let reads = paths.iter().map(|path| format!("cat '{path}'")).collect::<Vec<_>>();
            let payload = preceding.into_iter().chain(reads.iter().map(String::as_str)).chain(following).collect::<Vec<_>>().join("; ");
            let command = wrapped_command(&before.concat(), &payload, &after.concat());
            prop_assert_eq!(cat_file_paths(&command).collect::<Vec<_>>(), paths.iter().map(String::as_str).collect::<Vec<_>>());
        }

        #[test]
        fn quoted_payloads_cannot_swallow_outer_arguments(
            wrapper in "run_[a-z][a-z_-]{0,12}",
            first in "[a-z0-9 _-]{1,16}",
            second in "[a-z0-9 _-]{1,16}",
            outer_single in any::<bool>(),
            escaped_context in any::<bool>(),
            trailing_space in "[ \t]{0,3}",
        ) {
            let first = format!("docs/{first}.md");
            let second = format!("docs/{second}.md");
            let (outer, inner) = if outer_single { ('\'', '"') } else { ('"', '\'') };
            let (before, after) = if escaped_context && !outer_single {
                (r#"echo \"Don't\"; "#, r#"; echo \"won't\""#)
            } else {
                ("", "")
            };
            let command = format!("{wrapper} --eval {outer}{before}cat {inner}{first}{inner}{after}{trailing_space}{outer} && cat \"{second}\" && echo \"done\"");
            prop_assert_eq!(cat_file_paths(&command).collect::<Vec<_>>(), vec![first.as_str(), second.as_str()]);
        }
    }
}
