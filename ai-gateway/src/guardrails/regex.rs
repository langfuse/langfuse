//! Bounded cache of compiled multi-pattern guardrail regexes and single-pass
//! `LeftmostFirst` matching.
use std::{
    sync::{Arc, LazyLock},
    time::Duration,
};

use quick_cache::{
    Weighter,
    sync::{Cache, GuardResult},
};
use regex_automata::{
    Input, MatchKind, PatternID, meta,
    nfa::thompson::WhichCaptures,
    util::{captures::Captures, syntax},
};

/// A compiled regex set and, per pattern, the index of the guardrail it belongs to.
pub(super) struct Matcher {
    pub(super) regex: meta::Regex,
    pub(super) owners: Vec<usize>,
}

/// The matchers for one set of guardrails, and the memory their regexes hold.
pub(super) struct Compiled {
    pub(super) matchers: Vec<Matcher>,
    bytes: u64,
}

/// Per guardrail, its patterns.
type GuardrailPatterns = Vec<Vec<String>>;

#[derive(Clone)]
struct CompiledWeight;

impl Weighter<GuardrailPatterns, Arc<Compiled>> for CompiledWeight {
    fn weight(&self, _: &GuardrailPatterns, compiled: &Arc<Compiled>) -> u64 {
        compiled.bytes
    }
}

/// Memory the cached regexes may hold in total; rarely used sets are evicted
/// first. Search caches, one per thread scanning a set, come on top.
const MAX_COMPILED_BYTES: u64 = 64 * 1024 * 1024;

/// Compiled matchers, keyed by the patterns of the guardrails they check. Every
/// request of a key resolves the same guardrails, so they compile once and the
/// check is a scan. A set compiles without blocking lookups of other sets.
static COMPILED: LazyLock<Cache<GuardrailPatterns, Arc<Compiled>, CompiledWeight>> =
    LazyLock::new(|| Cache::with_weighter(1024, MAX_COMPILED_BYTES, CompiledWeight));

pub(super) fn compiled(active: &[(usize, &[String])]) -> Arc<Compiled> {
    let key: GuardrailPatterns = active
        .iter()
        .map(|(_, patterns)| (*patterns).to_vec())
        .collect();
    // A request that finds the set being compiled elsewhere compiles its own copy
    // rather than parking its thread, which may be an async worker, until then.
    match COMPILED.get_value_or_guard(&key, Some(Duration::ZERO)) {
        GuardResult::Value(compiled) => compiled,
        GuardResult::Guard(guard) => {
            let compiled = compile(&key);
            let _ = guard.insert(Arc::clone(&compiled));
            compiled
        }
        GuardResult::Timeout => compile(&key),
    }
}

fn compile(key: &GuardrailPatterns) -> Arc<Compiled> {
    let owned_patterns = |owners: &[usize]| -> Vec<(usize, &String)> {
        owners
            .iter()
            .filter_map(|owner| key.get(*owner).map(|patterns| (*owner, patterns)))
            .flat_map(|(owner, patterns)| patterns.iter().map(move |pattern| (owner, pattern)))
            .collect()
    };
    let all: Vec<usize> = (0..key.len()).collect();
    let matchers: Vec<Matcher> = match matcher(&owned_patterns(&all)) {
        Some(combined) => vec![combined],
        None => all
            .iter()
            .filter_map(|owner| matcher(&owned_patterns(std::slice::from_ref(owner))))
            .collect(),
    };
    let pattern_bytes: usize = key.iter().flatten().map(String::len).sum();
    let regex_bytes: usize = matchers
        .iter()
        .map(|matcher| matcher.regex.memory_usage())
        .sum();
    // At least one, since entries weighing nothing are never evicted.
    let bytes = u64::try_from(pattern_bytes + regex_bytes)
        .unwrap_or(u64::MAX)
        .max(1);
    Arc::new(Compiled { matchers, bytes })
}

/// The patterns compiled in ASCII mode, so `\b` and `\d` stay on the fast DFA path
/// even when the text holds non-ASCII; `None` when a pattern does not compile.
/// Uses `LeftmostFirst` with captures enabled so detection and `redact` span
/// extraction share one compiled cache and run in a single pass.
pub(super) fn matcher(patterns: &[(usize, &String)]) -> Option<Matcher> {
    let regex = meta::Builder::new()
        .configure(
            meta::Config::new()
                .match_kind(MatchKind::LeftmostFirst)
                .utf8_empty(false)
                .which_captures(WhichCaptures::All),
        )
        .syntax(syntax::Config::new().unicode(false).utf8(false))
        .build_many(
            &patterns
                .iter()
                .map(|(_, pattern)| pattern.as_str())
                .collect::<Vec<_>>(),
        )
        .inspect_err(|error| tracing::warn!(%error, "guardrail patterns failed to compile"))
        .ok()?;
    Some(Matcher {
        regex,
        owners: patterns.iter().map(|(owner, _)| *owner).collect(),
    })
}

/// Walks every non-overlapping `LeftmostFirst` match of `regex` in `text`,
/// passing `(pattern_id, start, end)` aligned to UTF-8 char boundaries.
///
/// Patterns that use capture group 1 to exclude surrounding boundary characters
/// (such as keyword lists, custom secret prefixes, and compressed IPv6) report
/// only group 1 and resume right after it so adjacent tokens still match.
pub(super) fn for_each_match(
    regex: &meta::Regex,
    caps: &mut Captures,
    text: &str,
    mut on_match: impl FnMut(PatternID, usize, usize),
) {
    let mut pos = 0usize;
    while pos <= text.len() {
        let input = Input::new(text.as_bytes()).range(pos..text.len());
        regex.captures(input, caps);
        let Some(full) = caps.get_match() else {
            break;
        };
        let pattern = full.pattern();
        let (raw_start, raw_end) = match caps.get_group(1) {
            Some(group1) => (group1.start, group1.end),
            None => (full.start(), full.end()),
        };
        let start = text.floor_char_boundary(raw_start);
        let end = text.ceil_char_boundary(raw_end);
        on_match(pattern, start, end);
        if raw_end > pos {
            pos = raw_end;
        } else if pos < text.len() {
            pos = text.ceil_char_boundary(pos.saturating_add(1));
        } else {
            break;
        }
    }
}
