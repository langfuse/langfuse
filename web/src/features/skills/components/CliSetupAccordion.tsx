import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Button } from "@/src/components/design-system/Button/Button";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { shellQuote } from "../utils/shellQuote";

export function CliSetupAccordion({
  projectId,
  host,
}: {
  projectId: string;
  host: string;
}) {
  return (
    <Accordion type="single" collapsible>
      <Accordion.Item value="setup">
        <Accordion.Trigger size="sm">First-time CLI setup</Accordion.Trigger>
        <Accordion.Content>
          <div className="flex min-w-0 flex-col items-start gap-3 py-3">
            <p className="text-muted-foreground">
              Requires Node.js 20+. Run in your project directory.
            </p>
            <div className="w-full min-w-0">
              <Codeblock
                language="bash"
                value="npm install -g @langfuse/cli@beta"
                variant="read-only"
              />
            </div>
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
            <div className="ph-no-capture w-full min-w-0">
              <Codeblock
                language="bash"
                value={`export LANGFUSE_PUBLIC_KEY='pk-lf-...'\nexport LANGFUSE_SECRET_KEY='sk-lf-...'\nexport LANGFUSE_HOST=${shellQuote(host)}`}
                variant="read-only"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              If LANGFUSE_BASE_URL is already set, use the same host. The CLI is
              in beta.
            </p>
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}
