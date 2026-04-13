import { Card } from "@/src/components/ui/card";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import Header from "@/src/components/layouts/header";
import { useLangfuseBaseUrl } from "@/src/features/public-api/hooks/useLangfuseEnvCode";

export function HostNameProject() {
  const baseUrl = useLangfuseBaseUrl();

  return (
    <div>
      <Header title="Host Name" />
      <Card className="mb-4 p-3">
        <div className="">
          <div className="mb-2 text-sm">
            When connecting to Langfuse, use this hostname / baseurl.
          </div>
          <CodeView content={baseUrl} />
        </div>
      </Card>
    </div>
  );
}
