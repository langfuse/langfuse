//! `extract_skills` reads available skills from `langfuse.observation.skills_available`
//! and loaded resources from successful skill-tool calls. It returns names,
//! versions and file paths; the worker resolves project-specific IDs later.
//!
//! The catalog and argument limits cap parsing work; the 100-item limit caps downstream lookup
//! requests.

use std::collections::HashSet;

use super::attributes::{JsonParseCache, ParsedJson};
use super::types::{JsonObject, SkillAvailableInput, SkillResourceInput};
use super::value::{Object, Value};

use crate::command_paths::cat_file_paths;

mod rules;
use rules::TOOL_RULES;

struct ToolRule {
    names: &'static [&'static str],
    skill_name: SkillNameSource,
    file_path: FileSource,
}

enum SkillNameSource {
    Argument(&'static [&'static str]),
    CanonicalArgument(&'static [&'static str]),
    FromPath,
}

enum FileSource {
    Literal(&'static str),
    Argument(&'static [&'static str]),
}

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
    let is_tool = event_type == "TOOL";
    let tool_rule = if is_tool {
        TOOL_RULES
            .iter()
            .find(|rule| rule.names.contains(&observation_name))
    } else {
        None
    };
    let is_codex_shell =
        is_tool && is_codex_shell_tool(observation_name) && is_codex_metadata(metadata);
    let is_tool_resource = is_tool
        && (tool_rule.is_some() || is_codex_shell)
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

    // Named arguments take precedence over Codex command input. A non-null value
    // blocks command scanning even when it is not a valid skill name.
    let candidates = if is_codex_shell && !has_named_skill_argument(&args) {
        let command = args.as_str().or_else(|| {
            args.as_object()
                .and_then(|object| object.get("cmd"))
                .and_then(Value::as_str)
        });
        get_skill_resources_from_command(command, &available)
    } else {
        let candidate = tool_rule
            .and_then(|rule| skill_resource_from_arguments(rule, args.as_object()?, &available));
        candidate.into_iter().collect()
    };
    let candidates = candidates
        .into_iter()
        .filter(|candidate| {
            !candidate.skill_name.is_empty()
                && candidate.skill_name.chars().count() <= 128
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
    if name.is_empty() || name.chars().count() > 128 {
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

fn skill_resource_from_arguments(
    rule: &ToolRule,
    args: &Object,
    available: &[SkillAvailableInput],
) -> Option<SkillResourceInput> {
    let file_path = match rule.file_path {
        FileSource::Literal(path) => path,
        FileSource::Argument(keys) => string_argument(args, keys)?,
    };
    let skill_name = match rule.skill_name {
        SkillNameSource::Argument(keys) => string_argument(args, keys)?.to_owned(),
        SkillNameSource::CanonicalArgument(keys) => {
            canonical_skill_name(string_argument(args, keys)?, available)
        }
        SkillNameSource::FromPath => {
            return extract_skill_resource_from_path(Some(file_path), available, true);
        }
    };
    Some(SkillResourceInput {
        skill_name,
        file_path: file_path.to_owned(),
        skill_version: None,
    })
}

fn string_argument<'a>(args: &'a Object, keys: &[&str]) -> Option<&'a str> {
    // Nullish fallback precedes type validation: an invalid supplied value must
    // not be replaced by a later string argument.
    keys.iter()
        .find_map(|key| args.get(*key).filter(|value| !value.is_null()))
        .and_then(Value::as_str)
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

fn canonical_skill_name(skill_name: &str, available: &[SkillAvailableInput]) -> String {
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
    use crate::otel::value::json;
    use proptest::prelude::*;

    #[test]
    fn command_resource_input_limit_is_preserved() {
        let available = vec![SkillAvailableInput {
            name: "alpha".into(),
            version: None,
        }];
        let mut command = "cat /skills/alpha/read.md".to_owned();
        command.push_str(&" ".repeat(MAX_SKILL_TOOL_ARGS_JSON_BYTES - command.len()));
        assert_eq!(
            get_skill_resources_from_command(Some(&command), &available).len(),
            1
        );
        command.push(' ');
        assert!(get_skill_resources_from_command(Some(&command), &available).is_empty());
    }

    proptest! {
        #[test]
        fn skill_names_use_unicode_character_limits(
            character in prop::sample::select(vec!['a', '工', '😀', '𐀀']),
            length in prop_oneof![Just(0usize), Just(64), Just(65), Just(128), Just(129)],
            alias in any::<bool>(),
        ) {
            let name = character.to_string().repeat(length);
            let key = if alias { "skillName" } else { "name" };
            let attrs = json!({SKILLS_AVAILABLE_ATTRIBUTE: [{"name": "ordinary"}, {(key): name}]});
            let metadata = JsonObject::new();
            let (available, _) = extract_skills(attrs.as_object().unwrap(), &metadata, "GENERATION", "", None, None, false);
            let valid = (1..=128).contains(&length);
            prop_assert_eq!(available.len(), if valid { 2 } else { 0 });
            let input = json!({"name": name});
            let (_, loaded) = extract_skills(attrs.as_object().unwrap(), &metadata, "TOOL", "skill", Some(&input), Some(&Value::Bool(true)), false);
            prop_assert_eq!(loaded.len(), usize::from(valid));
        }

        #[test]
        fn cat_commands_preserve_unique_resource_order_and_limit_lookups(
            name in prop_oneof!["[a-z]{1,5}", Just("工具".to_owned())],
            catalog_size in 0usize..4,
            wrapped in any::<bool>(),
            suffix in prop::sample::select(vec!["", " space", "*literal", ";list", "😀"]),
            trailing_space in "[ \t]{0,2}",
            unique_prefix in prop_oneof![Just(0usize), Just(1), Just(99), Just(100), Just(101)],
            candidates in prop::collection::vec((0usize..4, 0usize..16, 0u8..4, 0usize..3, 0usize..4), 0..32),
        ) {
            let available = (0..catalog_size).map(|index| SkillAvailableInput {
                name: format!("{name}-{index}"), version: None,
            }).collect::<Vec<_>>();
            let prefix = (0..unique_prefix).map(|file| (0, file, 0, file % 3, file % 4));
            let mut command = if wrapped { String::new() } else { String::from("cat ") };
            let mut expected = Vec::new();
            for (ordinal, (skill, file, kind, quote, separator)) in prefix.chain(candidates).enumerate() {
                let skill_name = format!("{name}-{skill}");
                let file_name = if quote == 0 { format!("file{file}.md") } else { format!("file {file}{suffix}.md") };
                let path = match kind {
                    0 => format!("/skills/{skill_name}/{file_name}"),
                    1 => format!("/skills/{skill_name}/../{file_name}"),
                    2 => format!("/skills/{skill_name}/{skill_name}/{file_name}"),
                    _ => format!("/unknown/{file_name}"),
                };
                // This suite owns catalog filtering and lookup limits. The command utility
                // separately checks escapes and malformed arguments against the regex contract.
                let argument = match quote {
                    0 => path,
                    1 => format!("'{path}'"),
                    _ => format!("\"{path}\""),
                };
                if wrapped {
                    if ordinal > 0 { command.push_str(" && "); }
                    let inner = format!("cat {argument}{trailing_space}");
                    let outer = if quote == 1 { '"' } else { '\'' };
                    command.push_str(&format!("bash -lc {outer}{inner}{outer}"));
                } else {
                    if ordinal > 0 { command.push_str([" ", "; cat ", "\ncat ", "\t"][separator]); }
                    command.push_str(&argument);
                }
                // Valid paths are constructed above; the expected values never call the parser.
                let resource = (skill_name, file_name);
                if kind == 0 && skill < catalog_size && !expected.contains(&resource) && expected.len() < 100 {
                    expected.push(resource);
                }
            }
            prop_assert!(command.len() <= MAX_SKILL_TOOL_ARGS_JSON_BYTES);
            let actual = get_skill_resources_from_command(Some(&command), &available);
            prop_assert_eq!(actual.into_iter().map(|item| (item.skill_name, item.file_path)).collect::<Vec<_>>(), expected);
        }
    }
}
