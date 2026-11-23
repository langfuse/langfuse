//! The built-in rules a guardrail can match. Patterns compile in ASCII mode, so
//! `\b` and `\d` stay on the fast DFA path even when the text holds non-ASCII.
use std::sync::LazyLock;

use regex::bytes::{Regex, RegexBuilder, RegexSet, RegexSetBuilder};
use serde::Deserialize;

/// Web sends preset ids as strings; an id this gateway does not know matches nothing.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Preset {
    Email,
    UsSsn,
    CreditCard,
    Iban,
    AwsAccessKeyId,
    #[serde(other)]
    Unknown,
}

/// The presets a text matched, one bit per entry of `RULES`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct Matches(u8);

impl Matches {
    pub(crate) const ALL: Self = Self(u8::MAX);

    pub(crate) fn of(presets: &[Preset]) -> Self {
        Self(
            presets
                .iter()
                .filter_map(|preset| RULES.iter().position(|rule| rule.preset == *preset))
                .fold(0, |bits, index| bits | 1 << index),
        )
    }

    pub(crate) fn is_empty(self) -> bool {
        self.0 == 0
    }

    pub(crate) fn intersects(self, other: Self) -> bool {
        self.0 & other.0 != 0
    }

    pub(crate) fn contains(self, other: Self) -> bool {
        self.0 & other.0 == other.0
    }

    fn insert(&mut self, index: usize) {
        self.0 |= 1 << index;
    }

    pub(crate) fn union(self, other: Self) -> Self {
        Self(self.0 | other.0)
    }
}

struct Rule {
    preset: Preset,
    pattern: &'static str,
    /// Confirms a candidate match, for rules whose pattern alone matches too much.
    validate: Option<fn(&[u8]) -> bool>,
}

const RULES: [Rule; 5] = [
    Rule {
        preset: Preset::Email,
        pattern: r"(?i)\b[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b",
        validate: None,
    },
    Rule {
        preset: Preset::UsSsn,
        pattern: r"\b(?:00[1-9]|0[1-9]\d|[1-578]\d\d|6[0-57-9]\d|66[0-57-9])-(?:0[1-9]|[1-9]\d)-(?:000[1-9]|00[1-9]\d|0[1-9]\d\d|[1-9]\d{3})\b",
        validate: None,
    },
    Rule {
        preset: Preset::CreditCard,
        pattern: r"\b(?:\d[ -]?){12,18}\d\b",
        validate: Some(luhn),
    },
    Rule {
        preset: Preset::Iban,
        pattern: r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b",
        validate: Some(iban_checksum),
    },
    Rule {
        preset: Preset::AwsAccessKeyId,
        pattern: r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
        validate: None,
    },
];

/// A rule's pattern alone, to confirm its candidates with the rule's validator.
type Validator = (Regex, fn(&[u8]) -> bool);

struct Engine {
    set: RegexSet,
    validators: Vec<Option<Validator>>,
}

impl Engine {
    fn new() -> Result<Self, regex::Error> {
        let set = RegexSetBuilder::new(RULES.iter().map(|rule| rule.pattern))
            .unicode(false)
            .build()?;
        let validators = RULES
            .iter()
            .map(|rule| {
                rule.validate
                    .map(|validate| {
                        RegexBuilder::new(rule.pattern)
                            .unicode(false)
                            .build()
                            .map(|regex| (regex, validate))
                    })
                    .transpose()
            })
            .collect::<Result<_, _>>()?;
        Ok(Self { set, validators })
    }

    fn matches(&self, text: &[u8]) -> Matches {
        let mut matches = Matches::default();
        for index in self.set.matches(text) {
            let confirmed = match self.validators.get(index) {
                Some(Some((regex, validate))) => regex
                    .find_iter(text)
                    .any(|found| validate(found.as_bytes())),
                _ => true,
            };
            if confirmed {
                matches.insert(index);
            }
        }
        matches
    }
}

static ENGINE: LazyLock<Option<Engine>> = LazyLock::new(|| {
    Engine::new()
        .inspect_err(|error| tracing::error!(%error, "guardrail presets failed to compile"))
        .ok()
});

/// The presets any of `texts` matches, stopping once all of `wanted` matched.
/// `None` when the presets could not compile.
pub(crate) fn scan<'a>(
    texts: impl IntoIterator<Item = &'a str>,
    wanted: Matches,
) -> Option<Matches> {
    let engine = ENGINE.as_ref()?;
    let mut matched = Matches::default();
    for text in texts {
        matched = matched.union(engine.matches(text.as_bytes()));
        if matched.contains(wanted) {
            break;
        }
    }
    Some(matched)
}

fn digits(candidate: &[u8]) -> impl Iterator<Item = u32> + '_ {
    candidate
        .iter()
        .filter(|byte| byte.is_ascii_digit())
        .map(|byte| u32::from(byte - b'0'))
}

fn luhn(candidate: &[u8]) -> bool {
    let sum: u32 = digits(candidate)
        .collect::<Vec<_>>()
        .iter()
        .rev()
        .enumerate()
        .map(|(index, digit)| match (index % 2, digit * 2) {
            (1, doubled) if doubled > 9 => doubled - 9,
            (1, doubled) => doubled,
            _ => *digit,
        })
        .sum();
    sum.is_multiple_of(10)
}

/// ISO 13616 mod-97: the country code and check digits move to the end, letters
/// count as 10..35, and the whole number leaves remainder 1.
fn iban_checksum(candidate: &[u8]) -> bool {
    let compact: Vec<u8> = candidate
        .iter()
        .copied()
        .filter(|byte| *byte != b' ')
        .collect();
    if compact.len() < 4 {
        return false;
    }
    let (head, tail) = compact.split_at(4);
    tail.iter().chain(head).try_fold(0u32, |remainder, byte| {
        let value = match byte {
            b'0'..=b'9' => u32::from(byte - b'0'),
            b'A'..=b'Z' => u32::from(byte - b'A') + 10,
            _ => return None,
        };
        let shift = if value >= 10 { 100 } else { 10 };
        Some((remainder * shift + value) % 97)
    }) == Some(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matched(text: &str) -> Vec<Preset> {
        let matches = scan([text], Matches::ALL).unwrap();
        RULES
            .iter()
            .enumerate()
            .filter(|(index, _)| matches.intersects(Matches(1 << index)))
            .map(|(_, rule)| rule.preset)
            .collect()
    }

    #[test]
    fn presets_match_their_data_and_not_lookalikes() {
        for (text, expected) in [
            (
                "write to jane.doe@example.co.uk please",
                vec![Preset::Email],
            ),
            ("my ssn is 123-45-6789", vec![Preset::UsSsn]),
            (
                "card 4111 1111 1111 1111 exp 12/29",
                vec![Preset::CreditCard],
            ),
            ("IBAN GB82 WEST 1234 5698 7654 32", vec![Preset::Iban]),
            ("key AKIAIOSFODNN7EXAMPLE", vec![Preset::AwsAccessKeyId]),
            // Fails the Luhn check, an invalid SSN area, and a bad IBAN checksum.
            ("order 4111 1111 1111 1112", vec![]),
            ("ref 000-12-3456", vec![]),
            ("IBAN GB82 WEST 1234 5698 7654 33", vec![]),
            ("Größe 42, résumé attached, no data here", vec![]),
        ] {
            assert_eq!(matched(text), expected, "{text}");
        }
    }

    #[test]
    fn unknown_presets_match_nothing() {
        assert!(Matches::of(&[Preset::Unknown]).is_empty());
    }
}
