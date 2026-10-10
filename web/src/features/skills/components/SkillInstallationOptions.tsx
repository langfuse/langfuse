import { useId, useState } from "react";
import { SkillNameSchema } from "@langfuse/shared";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Input } from "@/src/components/design-system/Input/Input";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { SkillCliSelector } from "./SkillCliSelector";
import { shellQuote } from "../utils/shellQuote";

export type SkillInstallationOptionsProps = {
  initialValues: {
    by: "name" | "tag";
    name: string;
    version: number | null;
    label: string;
    tag: string;
  };
  labels: string[];
  tags: string[];
  names: string[];
};

export function SkillInstallationOptions({
  initialValues,
  labels,
  tags,
  names,
}: SkillInstallationOptionsProps) {
  const id = useId();
  const [by, setBy] = useState<string>(initialValues.by);
  const [name, setName] = useState(initialValues.name);
  const [selector, setSelector] = useState<string>(
    initialValues.version === null ? "label" : "version",
  );
  const [version, setVersion] = useState(String(initialValues.version ?? 1));
  const [nameLabel, setNameLabel] = useState(initialValues.label);
  const [tag, setTag] = useState(initialValues.tag);
  const [tagLabel, setTagLabel] = useState(initialValues.label);
  const [directory, setDirectory] = useState(".agents/skills");
  const directoryFlag =
    directory === ".agents/skills"
      ? ""
      : ` --directory=${shellQuote(directory)}`;
  const labelOptions = [...new Set([...labels, "production", "latest"])];
  const activeSelector = by === "tag" ? "label" : selector;
  const pinnedVersion = activeSelector === "version";
  const validVersion =
    /^[1-9]\d*$/.test(version) && Number.isSafeInteger(Number(version));
  const selectedName = selectedOption(name, names);
  const selectedTag = tags.length > 0 ? selectedOption(tag, tags) : tag;
  const selectedNameLabel = selectedOption(nameLabel, labelOptions);
  const selectedTagLabel = selectedOption(tagLabel, labelOptions);
  const nameValidation = SkillNameSchema.safeParse(selectedName);
  const normalizedName = nameValidation.success
    ? nameValidation.data
    : selectedName;
  const nameTarget = pinnedVersion
    ? `${shellQuote(normalizedName)} --version ${version}`
    : `${shellQuote(normalizedName)} --label=${shellQuote(selectedNameLabel)}`;
  const target =
    by === "tag"
      ? `--tag=${shellQuote(selectedTag.trim())} --label=${shellQuote(selectedTagLabel)}`
      : nameTarget;
  const invalidNameError = nameValidation.success
    ? null
    : "Select a valid skill name.";
  const nameError =
    names.length === 0
      ? "No skills available in this project."
      : invalidNameError;
  const tagError = selectedTag.trim()
    ? null
    : "Enter a tag to generate the install command.";
  const versionError =
    pinnedVersion && !validVersion
      ? "Enter a positive whole-number version."
      : null;
  const error = by === "name" ? (nameError ?? versionError) : tagError;
  const description = getInstallationDescription(by, pinnedVersion);

  return (
    <div className="ph-no-capture flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h3 className="font-bold">3. Install skills</h3>
        <div className="grid min-w-0 gap-4 sm:grid-cols-3">
          <Tabs value={by} onValueChange={setBy}>
            <Tabs.List aria-label="Install by" variant="inset" size="md">
              <Tabs.Trigger value="name" label="Name" />
              <Tabs.Trigger value="tag" label="Tag" />
            </Tabs.List>
            <Tabs.Content value="name">
              <div className="pt-3">
                <SkillCliSelector
                  label="Skill name"
                  options={names.map((name) => ({ value: name, label: name }))}
                  value={selectedName}
                  onValueChange={setName}
                />
              </div>
            </Tabs.Content>
            <Tabs.Content value="tag">
              <div className="pt-3">
                {tags.length > 0 ? (
                  <SkillCliSelector
                    label="Skill tag"
                    options={tags.map((tag) => ({ value: tag, label: tag }))}
                    value={selectedTag}
                    onValueChange={setTag}
                  />
                ) : (
                  <div className="flex min-w-0 flex-col gap-2">
                    <label
                      className="text-muted-foreground text-xs"
                      htmlFor={`${id}-tag`}
                    >
                      Skill tag
                    </label>
                    <Input
                      id={`${id}-tag`}
                      value={selectedTag}
                      onChange={(event) => setTag(event.target.value)}
                      placeholder="my-tag"
                    />
                  </div>
                )}
              </div>
            </Tabs.Content>
          </Tabs>
          <Tabs value={activeSelector} onValueChange={setSelector}>
            <Tabs.List aria-label="Version selection" variant="inset" size="md">
              <Tabs.Trigger
                value="version"
                label="Version"
                disabled={by === "tag"}
              />
              <Tabs.Trigger value="label" label="Label" />
            </Tabs.List>
            <Tabs.Content value="version">
              <div className="flex min-w-0 flex-col gap-2 pt-3">
                <label
                  className="text-muted-foreground text-xs"
                  htmlFor={`${id}-version`}
                >
                  Skill version
                </label>
                <Input
                  id={`${id}-version`}
                  type="number"
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  aria-invalid={!validVersion}
                />
              </div>
            </Tabs.Content>
            <Tabs.Content value="label">
              <div className="pt-3">
                <SkillCliSelector
                  label="Version label"
                  options={labelOptions.map((label) => ({
                    value: label,
                    label,
                  }))}
                  value={by === "tag" ? selectedTagLabel : selectedNameLabel}
                  onValueChange={by === "tag" ? setTagLabel : setNameLabel}
                />
              </div>
            </Tabs.Content>
          </Tabs>
          <div className="flex min-w-0 flex-col gap-3 sm:pt-10">
            <SkillCliSelector
              label="Install to"
              options={[
                { value: ".agents/skills", label: "Default" },
                { value: ".claude/skills", label: "Claude Code" },
                { value: ".cursor/skills", label: "Cursor" },
              ].map(({ value, label }) => ({
                value,
                label: (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0">{label} </span>
                    <span
                      className="text-muted-foreground truncate text-xs"
                      title={value}
                    >
                      {value}
                    </span>
                  </span>
                ),
              }))}
              value={directory}
              onValueChange={setDirectory}
            />
          </div>
        </div>
        <p className="text-muted-foreground">{description}</p>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <Codeblock
            language="bash"
            value={`langfuse skills install ${target}${directoryFlag}`}
          />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">4. Update installed skills</h3>
        <p className="text-muted-foreground">
          Skills are installed in <code>{directory}</code>. Commit{" "}
          <code>langfuse-skills-lock.json</code> to share the selection with
          your team. Updates use the saved directories and follow saved labels;
          pinned versions stay fixed.
        </p>
        <Codeblock language="bash" value="langfuse skills update" />
      </div>
    </div>
  );
}

function selectedOption(value: string, options: string[]) {
  return options.includes(value) ? value : (options[0] ?? "");
}

function getInstallationDescription(by: string, pinnedVersion: boolean) {
  if (by === "tag") {
    return "Installs every skill with this tag at the chosen label. Each skill must have that label.";
  }
  if (pinnedVersion) {
    return "Pins this skill to the selected version.";
  }
  return "Follows this label when you update, even when it moves to a new version.";
}
