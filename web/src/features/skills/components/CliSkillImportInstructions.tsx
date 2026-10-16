import { Button } from "@/src/components/design-system/Button/Button";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { useLangfuseBaseUrl } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { shellQuote } from "../utils/shellQuote";

export function CliSkillImportInstructions({
  projectId,
}: {
  projectId: string;
}) {
  const host = useLangfuseBaseUrl();

  return (
    <div className="flex flex-col gap-4">
      <p>
        Push skills from your local project to Langfuse. Requires Node.js 20 or
        later. The Langfuse CLI is in beta.
      </p>
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">1. Install or update the CLI</h3>
        <Codeblock language="bash" value="npm install -g @langfuse/cli@beta" />
      </div>
      <div className="flex flex-col items-start gap-2">
        <h3 className="font-bold">2. Configure your project</h3>
        <p className="text-muted-foreground">
          Replace the placeholders with this project’s API keys. These exports
          configure your current terminal session. If you already set{" "}
          <code>LANGFUSE_BASE_URL</code>, update it to the same host.
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
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">3. Import skills</h3>
        <p className="text-muted-foreground">
          Run from your local project directory. Replace the example path with a
          skill folder containing SKILL.md, or push all skills under a
          directory. The name in SKILL.md identifies the skill in Langfuse.
        </p>
        <Codeblock
          language="bash"
          value={`# Push one skill\nlangfuse skills push .agents/skills/my-skill\n\n# Push all skills in a directory\nlangfuse skills push .agents/skills --recursive`}
        />
        <p className="text-muted-foreground text-xs">
          Creates new skills or publishes a new version of existing skills when
          their files change.
        </p>
      </div>
    </div>
  );
}
