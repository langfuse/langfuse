import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { CodeBlock } from "@/src/components/design-system/Codeblock/Codeblock";
import Link from "next/link";
import { Bot, SquareTerminal, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

const DocsButton = ({ href, label }: { href: string; label: string }) => (
  <Button asChild variant="ghost">
    <Link href={href} target="_blank">
      {label}
    </Link>
  </Button>
);

const ManageApiKeysButton = ({
  projectId,
  label,
}: {
  projectId: string;
  label: string;
}) => (
  <Button asChild variant="secondary">
    <Link href={`/project/${projectId}/settings/api-keys`}>{label}</Link>
  </Button>
);

export function DeveloperToolsSettings({ projectId }: { projectId: string }) {
  const t = useTranslations("auxSettings.developerTools");

  return (
    <div>
      <Header title={t("title")} />
      <p className="text-muted-foreground mb-6 text-sm">{t("description")}</p>
      <div className="space-y-6">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="text-foreground h-5 w-5" />
            <span className="font-bold">{t("agentSkill.title")}</span>
          </div>
          <p className="text-primary mb-4 text-sm">
            {t("agentSkill.description")}
          </p>
          <CodeBlock
            language="shell"
            value={`npx skills add langfuse/skills --skill "langfuse"`}
          />
          <div className="mt-4 flex items-center gap-2">
            <DocsButton
              href="https://langfuse.com/docs/api-and-data-platform/features/agent-skill"
              label={t("documentation")}
            />
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Bot className="text-foreground h-5 w-5" />
            <span className="font-bold">{t("mcpServer.title")}</span>
          </div>
          <p className="text-primary mb-4 text-sm">
            {t("mcpServer.description")}
          </p>
          <CodeBlock
            language="shell"
            value={`claude mcp add --transport http langfuse \\
  https://cloud.langfuse.com/api/public/mcp \\
  --header "Authorization: Basic {your-base64-token}"`}
          />
          <div className="mt-4 flex items-center gap-2">
            <ManageApiKeysButton
              projectId={projectId}
              label={t("manageApiKeys")}
            />
            <DocsButton
              href="https://langfuse.com/docs/api-and-data-platform/features/mcp-server"
              label={t("documentation")}
            />
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <SquareTerminal className="text-foreground h-5 w-5" />
            <span className="font-bold">{t("cli.title")}</span>
          </div>
          <p className="text-primary mb-4 text-sm">{t("cli.description")}</p>
          <CodeBlock
            language="shell"
            value={`export LANGFUSE_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_SECRET_KEY="sk-lf-..."

npx langfuse-cli api <resource> <action>`}
          />
          <div className="mt-4 flex items-center gap-2">
            <ManageApiKeysButton
              projectId={projectId}
              label={t("manageApiKeys")}
            />
            <DocsButton
              href="https://langfuse.com/docs/api-and-data-platform/features/cli"
              label={t("documentation")}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
