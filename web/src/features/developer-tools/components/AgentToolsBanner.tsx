import { Callout } from "@/src/components/design-system/Callout/Callout";
import { DismissController } from "@/src/components/DismissController";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";

const DOCS_HREF =
  "https://langfuse.com/docs/api-and-data-platform/features/agent-skill";

/**
 * Informational, dismissible banner that highlights Langfuse's support for AI
 * coding agents via the Agent Skill, MCP server, and CLI. Rendered on the
 * organization overview page.
 */
export function AgentToolsBanner() {
  const t = useTranslations("agentToolsBanner");
  return (
    <DismissController id="agent-tools-banner:v1" family="callouts">
      {({ onDismiss }) => (
        <div className="mb-4">
          <Callout
            variant="info"
            align="middle"
            actions={
              <Button asChild size="sm" variant="secondary">
                <Link href={DOCS_HREF} target="_blank">
                  {t("learnMore")}
                </Link>
              </Button>
            }
            onDismiss={onDismiss}
          >
            <div className="flex items-start gap-2 sm:items-center">
              <Bot className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
              <span>
                <span className="font-bold">{t("title")}</span>{" "}
                {t("description")}
              </span>
            </div>
          </Callout>
        </div>
      )}
    </DismissController>
  );
}
