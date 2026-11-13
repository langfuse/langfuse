/* eslint-disable @repo/no-style-props */
import { type ReactNode } from "react";
import { FileCode, Plug, type IconComponent } from "@langfuse/icons";

import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Label } from "@/src/components/ui/label";
import { MaskedGatewayKey } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/components/MaskedGatewayKey";
import { StepCodeSection } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/components/StepCodeSection";
import { GatewaySecretKeyContext } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/contexts/gatewaySecretKeyContext";
import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import { getLangfuseEnvCode } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { cn } from "@/src/utils/tailwind";

type ApiKeyScope = "project" | "organization";

export type ApiKeyDetailContentProps = {
  scope: ApiKeyScope;
  secretKey: string;
  publicKey: string;
  baseUrl: string;
  className?: string;
  showMcpSection: boolean;
};

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

function encodeMcpCredential(publicKey: string, secretKey: string) {
  const credential = `${publicKey}:${secretKey}`;

  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(credential);
  }

  return Buffer.from(credential).toString("base64");
}

export function ApiKeyDetailContent(props: ApiKeyDetailContentProps) {
  const { scope, secretKey, publicKey, baseUrl, className, showMcpSection } =
    props;

  const tabs: UsageTab[] = [
    {
      id: "env",
      label: ".env",
      icon: FileCode,
      description:
        "Add these environment variables to your application to send traces to Langfuse.",
      code: getLangfuseEnvCode(baseUrl, {
        secretKey: GATEWAY_KEY_PLACEHOLDER,
        publicKey,
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
      secret: encodeMcpCredential(publicKey, secretKey),
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
      <div className="flex flex-col gap-1.5">
        <h4 className="text-sm font-bold">Public Key</h4>
        <CodeSection variant="outline" content={publicKey} />
      </div>
      <hr />
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">Usage instructions</h3>
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
