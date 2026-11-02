import { useId, useState, type ChangeEvent } from "react";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Input } from "@/src/components/design-system/Input/Input";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { CopyAgentPromptPanel } from "./CopyAgentPromptPanel";
import { CliSetupAccordion } from "./CliSetupAccordion";
import { shellQuote } from "../utils/shellQuote";

export function CliSkillImportInstructions({
  projectId,
  host,
}: {
  projectId: string;
  host: string;
}) {
  const id = useId();
  const [scope, setScope] = useState("all");
  const [directory, setDirectory] = useState(".agents/skills");
  const [skillPath, setSkillPath] = useState(".agents/skills/my-skill");
  const path = (scope === "all" ? directory : skillPath).trim();
  const command = `langfuse skills push ${shellQuote(path)}${scope === "all" ? " --recursive" : ""}`;
  const prompt = `Import these local skills into Langfuse.

Follow the CLI setup and authentication guidance:
https://github.com/langfuse/langfuse-cli
Use @langfuse/cli@beta for skill import.

Langfuse host: ${JSON.stringify(host)}

Run from the repository root:
${command}

Use local project credentials. If missing, ask me to configure them locally; never paste secrets into chat or commit them.

Check the selected folder contains the intended SKILL.md files before pushing. The name in each SKILL.md identifies the skill in Langfuse. This creates new skills or publishes new versions when files change. Verify the imported skills in Langfuse.`;

  const handlePathChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (scope === "all") setDirectory(event.target.value);
    else setSkillPath(event.target.value);
  };

  return (
    <div className="ph-no-capture flex min-w-0 flex-col gap-4">
      <p className="text-muted-foreground">
        Choose what to import, then let your coding agent handle setup or run
        the command yourself.
      </p>
      <CliSetupAccordion projectId={projectId} host={host} />
      <div className="flex flex-col gap-3">
        <Accordion type="single" collapsible>
          <Accordion.Item value="configuration">
            <Accordion.Trigger size="sm">
              Configure import command
            </Accordion.Trigger>
            <Accordion.Content>
              <div className="flex flex-col gap-3 py-3">
                <Tabs value={scope} onValueChange={setScope}>
                  <Tabs.List
                    aria-label="Import scope"
                    variant="inset"
                    size="md"
                  >
                    <Tabs.Trigger value="all" label="All skills" />
                    <Tabs.Trigger value="single" label="Single skill" />
                  </Tabs.List>
                </Tabs>
                <div className="flex flex-col gap-2">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor={`${id}-path`}
                  >
                    {scope === "all" ? "Skills directory" : "Skill folder"}
                  </label>
                  <Input
                    id={`${id}-path`}
                    value={scope === "all" ? directory : skillPath}
                    onChange={handlePathChange}
                    aria-invalid={!path}
                  />
                </div>
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
        {!path ? (
          <p role="alert" className="text-destructive">
            Enter a folder path to generate the import command.
          </p>
        ) : (
          <CopyAgentPromptPanel prompt={prompt} command={command} />
        )}
      </div>

      <Accordion type="single" collapsible>
        <Accordion.Item value="updates">
          <Accordion.Trigger size="sm">Updating later</Accordion.Trigger>
          <Accordion.Content>
            <div className="flex min-w-0 flex-col gap-3 py-3">
              <p className="text-muted-foreground">
                Run the same import command after editing your local skills. The
                name in SKILL.md identifies each skill in Langfuse. Changed
                files publish a new version; new names create new skills.
              </p>
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}
