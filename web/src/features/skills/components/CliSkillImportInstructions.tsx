import { useId, useState } from "react";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Button } from "@/src/components/design-system/Button/Button";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { Input } from "@/src/components/design-system/Input/Input";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { useLangfuseBaseUrl } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { shellQuote } from "../utils/shellQuote";

export function CliSkillImportInstructions({
  projectId,
}: {
  projectId: string;
}) {
  const host = useLangfuseBaseUrl();
  const id = useId();
  const [scope, setScope] = useState("all");
  const [directory, setDirectory] = useState(".agents/skills");
  const [skillPath, setSkillPath] = useState(".agents/skills/my-skill");
  const { copy, isCopied } = useCopyToClipboard();
  const [copyError, setCopyError] = useState(false);
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
      <p className="text-muted-foreground">
        Choose what to import, then let your coding agent handle setup or run
        the command yourself.
      </p>
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
                    onChange={(event) =>
                      scope === "all"
                        ? setDirectory(event.target.value)
                        : setSkillPath(event.target.value)
                    }
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
      <Accordion type="single" collapsible>
        <Accordion.Item value="setup">
          <Accordion.Trigger size="sm">First-time CLI setup</Accordion.Trigger>
          <Accordion.Content>
            <div className="flex flex-col items-start gap-3 py-3">
              <p className="text-muted-foreground">
                Requires Node.js 20+. Run in your project directory.
              </p>
              <Codeblock
                language="bash"
                value="npm install -g @langfuse/cli@beta"
                variant="read-only"
              />
              <p className="text-muted-foreground">
                Replace the placeholders with your project’s API keys. These
                settings apply to your current terminal session.
              </p>
              <Button
                text="Get project API keys"
                href={`/project/${projectId}/settings/api-keys`}
                variant="secondary"
                size="sm"
              />
              <div className="ph-no-capture w-full">
                <Codeblock
                  language="bash"
                  value={`export LANGFUSE_PUBLIC_KEY='pk-lf-...'\nexport LANGFUSE_SECRET_KEY='sk-lf-...'\nexport LANGFUSE_HOST=${shellQuote(host)}`}
                  variant="read-only"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                If LANGFUSE_BASE_URL is already set, use the same host. The CLI
                is in beta.
              </p>
            </div>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="updates">
          <Accordion.Trigger size="sm">Updating later</Accordion.Trigger>
          <Accordion.Content>
            <div className="py-3">
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
