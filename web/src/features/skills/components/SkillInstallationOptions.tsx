import { useId, useState } from "react";
import { SkillNameSchema } from "@langfuse/shared";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Input } from "@/src/components/design-system/Input/Input";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { Button } from "@/src/components/design-system/Button/Button";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { SkillCliSelector } from "./SkillCliSelector";
import { shellQuote } from "../utils/shellQuote";

export type SkillInstallationOptionsProps = {
  host: string;
  initialValues: {
    by: "all" | "name" | "tag";
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
  host,
  initialValues,
  labels,
  tags,
  names,
}: SkillInstallationOptionsProps) {
  const id = useId();
  const { copy, isCopied } = useCopyToClipboard();
  const [copyError, setCopyError] = useState(false);
  const [by, setBy] = useState<"all" | "name" | "tag">(initialValues.by);
  const [name, setName] = useState(initialValues.name);
  const [selector, setSelector] = useState<string>(
    initialValues.version === null ? "label" : "version",
  );
  const [version, setVersion] = useState(String(initialValues.version ?? 1));
  const [nameLabel, setNameLabel] = useState(initialValues.label);
  const [tag, setTag] = useState(initialValues.tag);
  const [bulkLabel, setBulkLabel] = useState(initialValues.label);
  const [directory, setDirectory] = useState(".agents/skills");
  const directoryFlag =
    directory === ".agents/skills"
      ? ""
      : ` --directory=${shellQuote(directory)}`;
  const labelOptions = [...new Set([...labels, "production", "latest"])];
  const activeSelector = by === "name" ? selector : "label";
  const pinnedVersion = activeSelector === "version";
  const validVersion =
    /^[1-9]\d*$/.test(version) && Number.isSafeInteger(Number(version));
  const selectedName = selectedOption(name, names);
  const selectedTag = tags.length > 0 ? selectedOption(tag, tags) : tag;
  const selectedNameLabel = selectedOption(nameLabel, labelOptions);
  const selectedBulkLabel = selectedOption(bulkLabel, labelOptions);
  const nameValidation = SkillNameSchema.safeParse(selectedName);
  const normalizedName = nameValidation.success
    ? nameValidation.data
    : selectedName;
  const nameTarget = pinnedVersion
    ? `${shellQuote(normalizedName)} --version ${version}`
    : `${shellQuote(normalizedName)} --label=${shellQuote(selectedNameLabel)}`;
  const targets = {
    all: `--all --label=${shellQuote(selectedBulkLabel)}`,
    tag: `--tag=${shellQuote(selectedTag.trim())} --label=${shellQuote(selectedBulkLabel)}`,
    name: nameTarget,
  };
  const target = targets[by];
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
  const errors = {
    all: names.length === 0 ? "No skills available in this project." : null,
    name: nameError ?? versionError,
    tag: tagError,
  };
  const error = errors[by];
  const command = `langfuse skills install ${target}${directoryFlag}`;
  const prompt = `Install these Langfuse skills in this repository.

Follow the CLI setup and authentication guidance:
https://github.com/langfuse/langfuse-cli
Use @langfuse/cli@beta for skill installation.

Langfuse host: ${JSON.stringify(host)}

Run from the repository root:
${command}

Use local project credentials. If missing, ask me to configure them locally; never paste secrets into chat or commit them.

Verify the skills are installed in ${JSON.stringify(directory)} and retain langfuse-skills-lock.json for reproducible installs.`;
  const handleCopyPrompt = async () => {
    setCopyError(false);
    try {
      await copy(prompt);
    } catch {
      setCopyError(true);
    }
  };

  return (
    <div className="ph-no-capture flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Accordion type="single" collapsible>
          <Accordion.Item value="configuration">
            <Accordion.Trigger size="sm">
              Configure install command
            </Accordion.Trigger>
            <Accordion.Content>
              <div className="flex flex-col gap-3 py-3">
                <div className="grid min-w-0 gap-4 sm:grid-cols-3">
                  <Tabs
                    value={by}
                    onValueChange={(value) => {
                      if (
                        value === "all" ||
                        value === "name" ||
                        value === "tag"
                      ) {
                        setBy(value);
                      }
                    }}
                  >
                    <Tabs.List
                      aria-label="Install by"
                      variant="inset"
                      size="md"
                    >
                      <Tabs.Trigger value="all" label="All" />
                      <Tabs.Trigger value="name" label="Name" />
                      <Tabs.Trigger value="tag" label="Tag" />
                    </Tabs.List>
                    <Tabs.Content value="name">
                      <div className="pt-3">
                        <SkillCliSelector
                          label="Skill name"
                          options={names.map((name) => ({
                            value: name,
                            label: name,
                          }))}
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
                            options={tags.map((tag) => ({
                              value: tag,
                              label: tag,
                            }))}
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
                    <Tabs.List
                      aria-label="Version selection"
                      variant="inset"
                      size="md"
                    >
                      <Tabs.Trigger
                        value="version"
                        label="Version"
                        disabled={by !== "name"}
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
                          value={
                            by === "name"
                              ? selectedNameLabel
                              : selectedBulkLabel
                          }
                          onValueChange={
                            by === "name" ? setNameLabel : setBulkLabel
                          }
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
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <>
            <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div className="flex flex-col gap-1">
                <h3 className="font-bold">Set up with your coding agent</h3>
                <p className="text-muted-foreground text-xs">
                  Paste this prompt into Claude, Cursor, Copilot, or another
                  coding agent.
                </p>
              </div>
              <Button
                text={isCopied && !copyError ? "Copied" : "Copy prompt"}
                onClick={handleCopyPrompt}
              />
            </div>
            {copyError && (
              <p role="alert" className="text-destructive">
                Could not copy the prompt. Please try again.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs">
                Or run in your project directory:
              </p>
              <Codeblock language="bash" value={command} variant="read-only" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function selectedOption(value: string, options: string[]) {
  return options.includes(value) ? value : (options[0] ?? "");
}
