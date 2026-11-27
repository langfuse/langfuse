/* eslint-disable @repo/no-style-props */
import { type ReactNode, useState } from "react";
import { Braces, FileCode, type IconComponent } from "@langfuse/icons";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { MaskedGatewayKey } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/components/MaskedGatewayKey";
import { StepCodeSection } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/components/StepCodeSection";
import { GatewaySecretKeyContext } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/contexts/gatewaySecretKeyContext";
import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import {
  getLangfuseEnvCode,
  projectIdPlaceholder,
} from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import {
  buildMcpHarnessCommands,
  shellCommand,
} from "@/src/features/public-api/components/mcpHarnessCommands";
import { cn } from "@/src/utils/tailwind";

/** ApiKeyDetailContentProps name the project a project key's examples use as the public key. */
export type ApiKeyDetailContentProps = {
  secretKey: string;
  baseUrl: string;
  className?: string;
  showMcpSection: boolean;
} & ({ scope: "project"; projectId: string } | { scope: "organization" });

type UsageTab = {
  id: string;
  label: string;
  icon: IconComponent;
  description?: ReactNode;
  /** Snippet with GATEWAY_KEY_PLACEHOLDER where `secret` goes. */
  code: string;
  secret: string;
};

export function ApiKeyDetailContent(props: ApiKeyDetailContentProps) {
  const { scope, secretKey, baseUrl, className, showMcpSection } = props;
  const projectId = exampleProjectId(props);
  const [activeTab, setActiveTab] = useState<string>("sdk");

  const tabs: UsageTab[] = [
    {
      id: "sdk",
      label: "SDK",
      icon: FileCode,
      description:
        "Add these environment variables to your application to send traces to Langfuse.",
      code: getLangfuseEnvCode(baseUrl, {
        projectId,
        secretKey: GATEWAY_KEY_PLACEHOLDER,
      }),
      secret: secretKey,
    },
    {
      id: "api",
      label: "API",
      icon: Braces,
      description: (
        <>
          Call the{" "}
          <DocsLink href="https://langfuse.com/docs/api-and-data-platform/features/public-api">
            Langfuse API
          </DocsLink>{" "}
          with the secret key as a bearer token.
        </>
      ),
      code: shellCommand(
        `curl -H "Authorization: Bearer ${GATEWAY_KEY_PLACEHOLDER}"`,
        // An organization key names its project per request; a project key is bound to one.
        ...(scope === "organization"
          ? [`-H "langfuse-project-id: ${projectId}"`]
          : []),
        `${baseUrl}/api/public/projects`,
      ),
      secret: secretKey,
    },
  ];
  if (showMcpSection) {
    for (const command of buildMcpHarnessCommands(
      `${baseUrl}/api/public/mcp`,
      secretKey,
    )) {
      tabs.push({
        id: command.id,
        label: command.label,
        icon: command.icon,
        description: (
          <>
            Run in your terminal to connect {command.product} to Langfuse. For
            more information see the{" "}
            <DocsLink href="https://langfuse.com/docs/api-and-data-platform/features/mcp-server">
              MCP setup docs
            </DocsLink>
            .
          </>
        ),
        code: command.code,
        secret: command.secret,
      });
    }
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1.5">
        <h4 className="text-sm font-bold">Secret Key</h4>
        <p className="text-muted-foreground text-sm">
          This key can only be viewed once. You can always create new keys in
          the {scope} settings.
        </p>
        <MaskedGatewayKey secretKey={secretKey} />
      </div>
      <hr />
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">Usage instructions</h3>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex h-9 items-center border-b">
            <Tabs.List
              variant="underline"
              overflow="menu"
              aria-label="Usage instructions"
            >
              {tabs.map((tab) => (
                <Tabs.Trigger
                  key={tab.id}
                  value={tab.id}
                  label={tab.label}
                  icon={tab.icon}
                />
              ))}
            </Tabs.List>
          </div>
          {tabs.map((tab) => (
            <Tabs.Content key={tab.id} value={tab.id}>
              <div className="flex flex-col gap-2 pt-4">
                {tab.description ? (
                  <p className="text-muted-foreground text-sm">
                    {tab.description}
                  </p>
                ) : null}
                <GatewaySecretKeyContext value={{ value: tab.secret }}>
                  <StepCodeSection code={tab.code} language="sh" />
                </GatewaySecretKeyContext>
              </div>
            </Tabs.Content>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

/** DocsLink opens a Langfuse docs page in a new tab. */
function DocsLink(props: { href: string; children: ReactNode }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noreferrer"
      className="text-foreground underline"
    >
      {props.children}
    </a>
  );
}

/** exampleProjectId is the project id the examples use: the key's own project, or a placeholder for an organization key. */
function exampleProjectId(props: ApiKeyDetailContentProps): string {
  if (props.scope === "project") return props.projectId;
  return projectIdPlaceholder;
}
