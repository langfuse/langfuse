//! Supported tool aliases and their skill-resource argument mappings.
//!
//! Argument keys use the first non-null value before checking its type. Canonical
//! names resolve `/skills/<name>` and `/skills/<name>/SKILL.md` through the catalog.
//! Codex command precedence and resource validation are handled by `event_skills`.

use super::{FileSource, SkillNameSource, ToolRule};

pub(super) const TOOL_RULES: &[ToolRule] = &[
    ToolRule {
        names: &["skill"],
        skill_name: SkillNameSource::CanonicalArgument(&["name", "skill"]),
        file_path: FileSource::Literal("SKILL.md"),
    },
    ToolRule {
        names: &["Skill", "loadSkill", "langfuse_loadSkill"],
        skill_name: SkillNameSource::Argument(&["name", "skill"]),
        file_path: FileSource::Literal("SKILL.md"),
    },
    ToolRule {
        names: &["skill_read"],
        skill_name: SkillNameSource::CanonicalArgument(&["skillName"]),
        file_path: FileSource::Argument(&["path"]),
    },
    ToolRule {
        names: &["loadSkillResource", "langfuse_loadSkillResource"],
        skill_name: SkillNameSource::Argument(&["name", "skill"]),
        file_path: FileSource::Argument(&["path"]),
    },
    ToolRule {
        names: &["readFile", "Read"],
        skill_name: SkillNameSource::FromPath,
        file_path: FileSource::Argument(&["path", "file_path"]),
    },
];
