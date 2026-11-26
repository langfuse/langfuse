//! Bounded cache of compiled multi-pattern guardrail regexes for overlapping
//! detection (`MatchKind::All`) and single-pass `LeftmostFirst` span extraction.
use std::{
    sync::{Arc, LazyLock},
    time::Duration,
};

use quick_cache::{
    Weighter,
    sync::{Cache, GuardResult},
};
use regex_automata::{Input, PatternID, meta, util::captures::Captures};

/// Named capture group emitted by boundary-wrapped generated patterns
/// (`containsWords`, `secretPrefixes`, compressed IPv6) so redaction replaces
/// only the matched token while user-authored custom regexes with ordinary
/// capture groups still redact their full match.
const MATCH_CAPTURE_GROUP_NAME: &str = "__lf_match";

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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum CompileMode {
    Detect,
    Redact,
}

/// Cache key: compilation mode plus each guardrail's patterns.
type CacheKey = (CompileMode, Vec<Vec<String>>);

#[derive(Clone)]
struct CompiledWeight;

impl Weighter<CacheKey, Arc<Compiled>> for CompiledWeight {
    fn weight(&self, _: &CacheKey, compiled: &Arc<Compiled>) -> u64 {
        compiled.bytes
    }
}

/// Memory the cached regexes may hold in total; rarely used sets are evicted
/// first. Search caches, one per thread scanning a set, come on top.
const MAX_COMPILED_BYTES: u64 = 64 * 1024 * 1024;

/// Compiled matchers, keyed by mode and guardrail patterns. Every request of a
/// key resolves the same guardrails, so they compile once and the check is a
/// scan. A set compiles without blocking lookups of other sets.
static COMPILED: LazyLock<Cache<CacheKey, Arc<Compiled>, CompiledWeight>> =
    LazyLock::new(|| Cache::with_weighter(1024, MAX_COMPILED_BYTES, CompiledWeight));

/// Overlapping multi-pattern detector (`MatchKind::All`, no captures) across
/// all local regex guardrails so no rule can shadow an overlapping match.
pub(super) fn compiled_detector(active: &[(usize, &[String])]) -> Arc<Compiled> {
    let patterns = active
        .iter()
        .map(|(_, patterns)| (*patterns).to_vec())
        .collect();
    lookup(&(CompileMode::Detect, patterns))
}

/// Combined `LeftmostFirst` capture matcher across all `REDACT` guardrails so
/// redaction runs in at most one pass per matching leaf.
pub(super) fn compiled_redactor(active: &[(usize, &[String])]) -> Arc<Compiled> {
    let patterns = active
        .iter()
        .map(|(_, patterns)| (*patterns).to_vec())
        .collect();
    lookup(&(CompileMode::Redact, patterns))
}

fn lookup(key: &CacheKey) -> Arc<Compiled> {
    // A request that finds the set being compiled elsewhere compiles its own copy
    // rather than parking its thread, which may be an async worker, until then.
    match COMPILED.get_value_or_guard(key, Some(Duration::ZERO)) {
        GuardResult::Value(compiled) => compiled,
        GuardResult::Guard(guard) => {
            let compiled = compile(key);
            let _ = guard.insert(Arc::clone(&compiled));
            compiled
        }
        GuardResult::Timeout => compile(key),
    }
}

fn compile((mode, groups): &CacheKey) -> Arc<Compiled> {
    let owned_patterns = |owners: &[usize]| -> Vec<(usize, &String)> {
        owners
            .iter()
            .filter_map(|owner| groups.get(*owner).map(|patterns| (*owner, patterns)))
            .flat_map(|(owner, patterns)| patterns.iter().map(move |pattern| (owner, pattern)))
            .collect()
    };
    let all: Vec<usize> = (0..groups.len()).collect();
    let matchers: Vec<Matcher> = match build_matcher(*mode, &owned_patterns(&all)) {
        Some(combined) => vec![combined],
        None => all
            .iter()
            .filter_map(|owner| build_matcher(*mode, &owned_patterns(std::slice::from_ref(owner))))
            .collect(),
    };
    let pattern_bytes: usize = groups.iter().flatten().map(String::len).sum();
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

fn build_matcher(mode: CompileMode, patterns: &[(usize, &String)]) -> Option<Matcher> {
    let raw: Vec<&str> = patterns
        .iter()
        .map(|(_, pattern)| pattern.as_str())
        .collect();
    let compiled = match mode {
        CompileMode::Detect => ai_gateway_guardrail_rules::compile_set(&raw),
        CompileMode::Redact => ai_gateway_guardrail_rules::compile_captures_set(&raw),
    };
    let regex = compiled
        .inspect_err(|error| tracing::warn!(%error, "guardrail patterns failed to compile"))
        .ok()?;
    Some(Matcher {
        regex,
        owners: patterns.iter().map(|(owner, _)| *owner).collect(),
    })
}

#[cfg(test)]
pub(super) fn matcher(patterns: &[(usize, &String)]) -> Option<Matcher> {
    build_matcher(CompileMode::Redact, patterns)
}

/// Walks every non-overlapping `LeftmostFirst` match of `regex` in `text`,
/// passing `(pattern_id, start, end)` aligned to UTF-8 char boundaries.
///
/// Generated patterns that use the `__lf_match` named capture group to exclude
/// surrounding boundary characters (such as keyword lists, custom secret
/// prefixes, and compressed IPv6) report only that group and resume right after
/// it so adjacent tokens still match. User-authored custom regexes with regular
/// capture groups report their full match.
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
        let (raw_start, raw_end) = match caps.get_group_by_name(MATCH_CAPTURE_GROUP_NAME) {
            Some(group) => (group.start, group.end),
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
