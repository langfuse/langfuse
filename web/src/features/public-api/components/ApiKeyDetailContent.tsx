import { SubHeader } from "@/src/components/layouts/header";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { Label } from "@/src/components/ui/label";
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
  const envCode = getLangfuseEnvCode(baseUrl, { secretKey, publicKey });
  const mcpCredential = encodeMcpCredential(publicKey, secretKey);

  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <SubHeader title="Secret Key" />
        <div className="text-muted-foreground text-sm">
          This key can only be viewed once. You can always create new keys in
          the {scope} settings.
        </div>
        <CodeView content={secretKey} className="mt-2" />
      </div>
      <div>
        <SubHeader title="Public Key" />
        <CodeView content={publicKey} className="mt-2" />
      </div>
      <div>
        <SubHeader title=".env" />
        <CodeView content={envCode} className="mt-2" />
      </div>
      {showMcpSection ? (
        <>
          <hr />
          <div>
            <SubHeader title="Using with MCP" />
            <p className="text-muted-foreground text-sm">
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
            </p>
            <div className="mt-4">
              <Label>Header</Label>
              <CodeView
                content={`Authorization: Basic ${mcpCredential}`}
                className="mt-2"
                lineWrap={false}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
