import Header from "@/src/components/layouts/header";
import { ConnectedGatewayApiKeysTable } from "./components/GatewayApiKeysTable/ConnectedGatewayApiKeysTable";

export function GatewayApiKeysPage({
  organizationId,
}: {
  organizationId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway API keys" />
      <p className="text-muted-foreground text-sm">
        These organization keys authenticate requests to the AI Gateway only.
      </p>
      <ConnectedGatewayApiKeysTable
        key={organizationId}
        organizationId={organizationId}
      />
    </div>
  );
}
