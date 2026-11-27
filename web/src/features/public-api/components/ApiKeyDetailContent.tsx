/* eslint-disable @repo/no-style-props */
import { type ReactNode } from "react";
import { FileCode, Plug, type IconComponent } from "@langfuse/icons";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Label } from "@/src/components/ui/label";
import { MaskedGatewayKey } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/components/MaskedGatewayKey";
import { StepCodeSection } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/components/StepCodeSection";
import { GatewaySecretKeyContext } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/contexts/gatewaySecretKeyContext";
import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import {
  ExampleProjectSelect,
  useExampleProjectId,
} from "@/src/features/public-api/components/ExampleProjectSelect";
import { getLangfuseEnvCode } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { type ExampleProject } from "@/src/features/public-api/hooks/useOrganizationProjects";
import { cn } from "@/src/utils/tailwind";

/**
 * ApiKeyDetailContentProps name the project the examples use as the public
 * key: a project key's own project, or one of an organization key's projects.
 */
export type ApiKeyDetailContentProps = {
  secretKey: string;
  baseUrl: string;
  className?: string;
  showMcpSection: boolean;
} & (
  | { scope: "project"; projectId: string }
  | { scope: "organization"; projects: ExampleProject[] }
);

type UsageTab = {
  id: string;
  label: string;
  icon: IconComponent;
  title?: string;
  description?: ReactNode;
  codeLabel?: string;
  /** Snippet with GATEWAY_KEY_PLACEHOLDER where `secret` goes. */
  code: string;
  secret: string;
};

/** encodeMcpCredential returns the Basic auth token for a project id and secret key. */
function encodeMcpCredential(projectId: string, secretKey: string) {
  const credential = `${projectId}:${secretKey}`;

  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(credential);
  }

  return Buffer.from(credential).toString("base64");
}

export function ApiKeyDetailContent(props: ApiKeyDetailContentProps) {
  const { scope, secretKey, baseUrl, className, showMcpSection } = props;
  const projects = props.scope === "organization" ? props.projects : [];
  const [exampleProjectId, setExampleProjectId] = useExampleProjectId(projects);
  const projectId =
    props.scope === "project" ? props.projectId : exampleProjectId;

  const tabs: UsageTab[] = [
    {
      id: "env",
      label: ".env",
      icon: FileCode,
      description:
        "Add these environment variables to your application to send traces to Langfuse.",
      code: getLangfuseEnvCode(baseUrl, {
        projectId,
        secretKey: GATEWAY_KEY_PLACEHOLDER,
      }),
      secret: secretKey,
    },
  ];
  if (showMcpSection) {
    tabs.push({
      id: "mcp",
      label: "MCP",
      icon: Plug,
      title: "Using with MCP",
      description: (
        <>
          For a detailed guide on how to use this API key to connect to the
          Langfuse MCP server, see the{" "}
          <a
            href="https://langfuse.com/docs/api-and-data-platform/features/mcp-server"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            MCP setup docs
          </a>
          .
        </>
      ),
      codeLabel: "Header",
      code: `Authorization: Basic ${GATEWAY_KEY_PLACEHOLDER}`,
      secret: encodeMcpCredential(projectId, secretKey),
    });
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
        {props.scope === "organization" && props.projects.length > 0 ? (
          <ExampleProjectSelect
            projects={props.projects}
            value={projectId}
            onValueChange={setExampleProjectId}
          />
        ) : null}
        <Tabs defaultValue="env">
          <div className="flex h-9 items-center border-b">
            <Tabs.List variant="underline" aria-label="Usage instructions">
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
                {tab.title ? (
                  <h4 className="text-sm font-bold">{tab.title}</h4>
                ) : null}
                {tab.description ? (
                  <p className="text-muted-foreground text-sm">
                    {tab.description}
                  </p>
                ) : null}
                {tab.codeLabel ? <Label>{tab.codeLabel}</Label> : null}
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
