//! `extract_skills` reads available skills from `langfuse.observation.skills_available`
//! and loaded resources from successful skill-tool calls. It returns names,
//! versions and file paths; the worker resolves project-specific IDs later.
//!
//! The catalog and argument limits cap parsing work; the 100-item limit caps downstream lookup
//! requests.

use fancy_regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

use super::attributes::{JsonParseCache, ParsedJson};
use super::types::{JsonObject, SkillAvailableInput, SkillResourceInput};
use super::value::{Object, Value};

const SKILLS_AVAILABLE_ATTRIBUTE: &str = "langfuse.observation.skills_available";
const MAX_SKILLS_PER_OBSERVATION: usize = 100;
const MAX_SKILL_CATALOG_JSON_BYTES: usize = 64 * 1024;
const MAX_SKILL_TOOL_ARGS_JSON_BYTES: usize = 16 * 1024;
const MAX_SKILL_PATH_LENGTH: usize = 512;

pub fn extract_skills(
    attributes: &JsonObject,
    metadata: &JsonObject,
    event_type: &str,
    observation_name: &str,
    input: Option<&Value>,
    output: Option<&Value>,
    is_error: bool,
) -> (Vec<SkillAvailableInput>, Vec<SkillResourceInput>) {
    // Use a local cache so optional skill payload parsing stays separate from event-level values.
    let mut parse_cache = JsonParseCache::default();
    let is_tool_resource = event_type == "TOOL"
        && is_skill_load_tool(observation_name, metadata)
        && output.is_some_and(|value| !value.is_null())
        && !is_error;
    if event_type != "GENERATION" && !is_tool_resource {
        return (Vec::new(), Vec::new());
    }

    let available =
        parse_skill_available(attributes.get(SKILLS_AVAILABLE_ATTRIBUTE), &mut parse_cache);
    if event_type == "GENERATION" {
        return (available, Vec::new());
    }

    let Some(input) = input else {
        return (Vec::new(), Vec::new());
    };
    let Some(args) = parse_skill_tool_arguments(input, &mut parse_cache) else {
        return (Vec::new(), Vec::new());
    };

    // Check path arguments before matching the tool name, as the TypeScript extractor does.
    // JavaScript string length is measured in UTF-16 code units.
    if args
        .as_object()
        .into_iter()
        .flat_map(|object| [object.get("path"), object.get("file_path")])
        .flatten()
        .filter_map(Value::as_str)
        .any(|path| path.encode_utf16().count() > MAX_SKILL_TOOL_ARGS_JSON_BYTES)
    {
        return (Vec::new(), Vec::new());
    }

    let candidates = if is_codex_metadata(metadata)
        && is_codex_shell_tool(observation_name)
        && !has_named_skill_argument(&args)
    {
        let command = args.as_str().or_else(|| {
            args.as_object()
                .and_then(|object| object.get("cmd"))
                .and_then(Value::as_str)
        });
        get_skill_resources_from_command(command, &available)
    } else {
        let Some(args) = args.as_object() else {
            return (Vec::new(), Vec::new());
        };

        let candidate = match observation_name {
            "readFile" | "Read" => {
                let path = args
                    .get("path")
                    .filter(|value| !value.is_null())
                    .or_else(|| args.get("file_path"))
                    .and_then(Value::as_str);
                extract_skill_resource_from_path(path, &available, true)
            }
            _ => {
                let named_skill = args
                    .get("name")
                    .filter(|value| !value.is_null())
                    .or_else(|| args.get("skill"))
                    .and_then(Value::as_str);
                let path = args.get("path").and_then(Value::as_str);
                let fields = match observation_name {
                    "skill" | "Skill" | "loadSkill" | "langfuse_loadSkill" => {
                        named_skill.map(|name| (name, "SKILL.md"))
                    }
                    "skill_read" => args.get("skillName").and_then(Value::as_str).zip(path),
                    "loadSkillResource" | "langfuse_loadSkillResource" => named_skill.zip(path),
                    _ => None,
                };
                fields.map(|(skill_name, file_path)| SkillResourceInput {
                    skill_name: canonical_skill_name(observation_name, skill_name, &available),
                    file_path: file_path.to_owned(),
                    skill_version: None,
                })
            }
        };
        candidate.into_iter().collect()
    };
    let candidates = candidates
        .into_iter()
        .filter(|candidate| {
            !candidate.skill_name.is_empty()
                && candidate.skill_name.encode_utf16().count() <= 128
                && valid_skill_file_path(&candidate.file_path)
        })
        .collect::<Vec<_>>();
    if candidates.is_empty() {
        return (Vec::new(), Vec::new());
    }
    (available, candidates)
}

fn parse_skill_available(
    value: Option<&Value>,
    parse_cache: &mut JsonParseCache,
) -> Vec<SkillAvailableInput> {
    let Some(value) = parse_skill_payload(value, MAX_SKILL_CATALOG_JSON_BYTES, parse_cache) else {
        return Vec::new();
    };
    let Some(values) = value.as_array() else {
        return Vec::new();
    };
    if values.len() > MAX_SKILLS_PER_OBSERVATION {
        return Vec::new();
    }
    values
        .iter()
        .map(parse_skill_available_entry)
        .collect::<Option<Vec<_>>>()
        .unwrap_or_default()
}

fn parse_skill_available_entry(value: &Value) -> Option<SkillAvailableInput> {
    let object = value.as_object()?;
    parse_skill_available_shape(object, "name", "version")
        .or_else(|| parse_skill_available_shape(object, "skillName", "skillVersion"))
}

fn parse_skill_available_shape(
    object: &Object,
    name_key: &str,
    version_key: &str,
) -> Option<SkillAvailableInput> {
    let name = object.get(name_key)?.as_str()?.to_owned();
    if name.is_empty() || name.encode_utf16().count() > 128 {
        return None;
    }
    let version = match object.get(version_key) {
        None | Some(Value::Null) => None,
        Some(Value::Number(number)) => {
            let version = number.as_f64()?;
            Some(
                (version.is_finite()
                    && version.fract() == 0.0
                    && (1.0..=2_147_483_647.0).contains(&version))
                .then_some(version as u32)?,
            )
        }
        _ => return None,
    };
    Some(SkillAvailableInput { name, version })
}

fn parse_skill_payload<'a>(
    value: Option<&'a Value>,
    max_bytes: usize,
    parse_cache: &mut JsonParseCache,
) -> Option<ParsedJson<'a>> {
    let value = value?;
    match value {
        Value::String(text) => (text.len() <= max_bytes).then(|| parse_cache.shared_or_self(value)),
        Value::Array(_) | Value::Object(_) => Some(ParsedJson::Borrowed(value)),
        _ => None,
    }
}

fn parse_skill_tool_arguments<'a>(
    value: &'a Value,
    parse_cache: &mut JsonParseCache,
) -> Option<ParsedJson<'a>> {
    match value {
        Value::String(text) if text.len() <= MAX_SKILL_TOOL_ARGS_JSON_BYTES => {
            Some(parse_cache.shared_or_self(value))
        }
        Value::String(_) => None,
        Value::Object(_) => Some(ParsedJson::Borrowed(value)),
        _ => None,
    }
}

fn is_skill_load_tool(tool_name: &str, metadata: &JsonObject) -> bool {
    matches!(
        tool_name,
        "skill"
            | "Skill"
            | "loadSkill"
            | "langfuse_loadSkill"
            | "skill_read"
            | "loadSkillResource"
            | "langfuse_loadSkillResource"
            | "readFile"
            | "Read"
    ) || (is_codex_shell_tool(tool_name) && is_codex_metadata(metadata))
}

fn is_codex_shell_tool(tool_name: &str) -> bool {
    tool_name == "skill"
        || tool_name.starts_with("skill:")
        || matches!(tool_name, "exec" | "exec_command")
}

fn is_codex_metadata(metadata: &JsonObject) -> bool {
    let service_name = match metadata.get("resourceAttributes.service.name") {
        None | Some(Value::Null) => metadata
            .get("resourceAttributes")
            .and_then(Value::as_object)
            .and_then(|attributes| attributes.get("service.name")),
        Some(value) => Some(value),
    };
    service_name.and_then(Value::as_str) == Some("codex")
}

fn has_named_skill_argument(args: &ParsedJson<'_>) -> bool {
    args.as_object().is_some_and(|object| {
        [object.get("name"), object.get("skill")]
            .into_iter()
            .flatten()
            .any(|value| !value.is_null())
    })
}

fn canonical_skill_name(
    tool_name: &str,
    skill_name: &str,
    available: &[SkillAvailableInput],
) -> String {
    if !matches!(tool_name, "skill" | "skill_read") {
        return skill_name.to_owned();
    }
    available
        .iter()
        .find(|skill| {
            skill_name == format!("/skills/{}", skill.name)
                || skill_name == format!("/skills/{}/SKILL.md", skill.name)
        })
        .map(|skill| skill.name.clone())
        .unwrap_or_else(|| skill_name.to_owned())
}

fn get_skill_resources_from_command(
    command: Option<&str>,
    available: &[SkillAvailableInput],
) -> Vec<SkillResourceInput> {
    let Some(command) = command else {
        return Vec::new();
    };
    if available.is_empty() || command.len() > MAX_SKILL_TOOL_ARGS_JSON_BYTES {
        return Vec::new();
    }
    let mut resources = Vec::new();
    let mut seen = HashSet::new();
    for path in cat_file_paths(command) {
        let Some(resource) = extract_skill_resource_from_path(Some(path), available, false) else {
            continue;
        };
        let key = format!("{}/{}", resource.skill_name, resource.file_path);
        if seen.insert(key) {
            resources.push(resource);
            if resources.len() == MAX_SKILLS_PER_OBSERVATION {
                break;
            }
        }
    }
    resources
}

/// Extract filenames from literal `cat` command arguments while treating command text as data.
fn cat_file_paths(command: &str) -> impl Iterator<Item = &str> {
    // `SPACE` lists ECMAScript whitespace because Rust regex's Unicode whitespace class differs.
    const SPACE: &str =
        r"\t-\r \u{00a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}";
    static CAT: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(&format!(r#"(?:^|[{SPACE};"'`]|\\n)cat(?=[ \t])"#)).expect("valid cat matcher")
    });
    static ARGUMENT: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(&format!(
            r#"^[ \t]+(?:'([^'\r\n]*)'|"([^"\r\n]*)"|([^{SPACE}"'`\\;|&,(){{}}<>]+))"#
        ))
        .expect("valid cat argument matcher")
    });
    let mut cursor = 0;
    let mut in_arguments = false;
    std::iter::from_fn(move || loop {
        if in_arguments {
            if let Some(captures) = ARGUMENT.captures(&command[cursor..]).ok().flatten() {
                cursor += captures.get(0)?.end();
                return captures
                    .get(1)
                    .or_else(|| captures.get(2))
                    .or_else(|| captures.get(3))
                    .map(|path| path.as_str());
            }
        }
        // Resume searching for `cat` after the arguments consumed above.
        cursor = CAT.find_from_pos(command, cursor).ok()??.end();
        in_arguments = true;
    })
}

fn extract_skill_resource_from_path(
    path: Option<&str>,
    available: &[SkillAvailableInput],
    require_skills_directory: bool,
) -> Option<SkillResourceInput> {
    let path = path?;
    let segments = path.split('/').collect::<Vec<_>>();
    if segments.contains(&"..") {
        return None;
    }
    let matches = segments
        .iter()
        .filter(|segment| available.iter().any(|skill| skill.name == **segment))
        .collect::<Vec<_>>();
    if matches.len() != 1 {
        return None;
    }
    let skill_name = matches[0].to_string();
    let index = segments.iter().position(|segment| *segment == skill_name)?;
    if require_skills_directory && (index == 0 || segments[index - 1] != "skills") {
        return None;
    }
    Some(SkillResourceInput {
        skill_name,
        file_path: segments[index + 1..].join("/"),
        skill_version: None,
    })
}

fn valid_skill_file_path(path: &str) -> bool {
    if path.is_empty()
        || path.encode_utf16().count() > MAX_SKILL_PATH_LENGTH
        || path.starts_with('/')
        || path.ends_with('/')
        || path.contains('\\')
    {
        return false;
    }
    if path
        .chars()
        .any(|character| character <= '\u{1f}' || character == '\u{7f}')
    {
        return false;
    }
    !path
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_literal_cat_arguments_and_bounds_unique_resources() {
        let available = [SkillAvailableInput {
            name: "alpha".into(),
            version: None,
        }];
        for (command, expected) in [
            (
                "cat '/skills/alpha/SKILL.md' \"/skills/alpha/guide.md\"",
                vec!["SKILL.md", "guide.md"],
            ),
            ("cat ; cat /skills/alpha/SKILL.md", vec!["SKILL.md"]),
            ("cat /skills/alpha/../other", vec![]),
        ] {
            let resources = get_skill_resources_from_command(Some(command), &available);
            assert_eq!(
                resources
                    .iter()
                    .map(|item| item.file_path.as_str())
                    .collect::<Vec<_>>(),
                expected
            );
        }
        let command = format!(
            "cat {}",
            (0..110)
                .map(|i| format!("/skills/alpha/{i}.md"))
                .collect::<Vec<_>>()
                .join(" ")
        );
        assert_eq!(
            get_skill_resources_from_command(Some(&command), &available).len(),
            MAX_SKILLS_PER_OBSERVATION
        );
        assert!(get_skill_resources_from_command(Some(&command), &[]).is_empty());
        // The first `cat` starts argument mode; the remaining 511 `cat` words become filenames.
        assert_eq!(cat_file_paths(&"cat ".repeat(512)).count(), 511);
    }
}
