import { FileCode, Plug, type IconComponent } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
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
  title: string;
  docsLabel: string;
  docsUrl: string;
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

/**
 * Same layout and components as the AI gateway's created-key dialog: the
 * secret is masked until revealed and always copied in full.
 */
export function ApiKeyDetailContent(props: ApiKeyDetailContentProps) {
  const { scope, secretKey, publicKey, baseUrl, className, showMcpSection } =
    props;

  const tabs: UsageTab[] = [
    {
      id: "env",
      label: ".env",
      icon: FileCode,
      title: "Add the keys to your environment",
      docsLabel: "How to send your first trace",
      docsUrl: "https://langfuse.com/docs/observability/get-started",
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
      title: "Send this header from your MCP client",
      docsLabel: "How to connect the MCP server",
      docsUrl:
        "https://langfuse.com/docs/api-and-data-platform/features/mcp-server",
      code: `Authorization: Basic ${GATEWAY_KEY_PLACEHOLDER}`,
      secret: encodeMcpCredential(publicKey, secretKey),
    });
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <p className="text-muted-foreground text-sm">
        Copy the secret key now. It is shown only once. You can always create
        new keys in the {scope} settings.
      </p>
      <div className="flex flex-col gap-1.5">
        <h4 className="text-sm font-bold">Secret key</h4>
        <MaskedGatewayKey secretKey={secretKey} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h4 className="text-sm font-bold">Public key</h4>
        <CodeSection variant="outline" content={publicKey} />
      </div>
      <hr />
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="font-bold">Usage instructions</h3>
          <p className="text-muted-foreground text-sm">
            Use the keys from your code or connect an AI tool to Langfuse. Each
            tab has the steps for one option.
          </p>
        </div>
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
              <div className="pt-4">
                <Stepper
                  number={1}
                  title={tab.title}
                  description={
                    <Button
                      variant="text"
                      text={tab.docsLabel}
                      href={tab.docsUrl}
                    />
                  }
                  variant="outline"
                  size="sm"
                  isCollapsible={false}
                  compactBottomSpacing
                >
                  <GatewaySecretKeyContext value={{ value: tab.secret }}>
                    <StepCodeSection code={tab.code} language="sh" />
                  </GatewaySecretKeyContext>
                </Stepper>
              </div>
            </Tabs.Content>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
