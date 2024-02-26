import { Card } from "@tremor/react";
import { CodeView } from "@/src/components/ui/code";
import { env } from "@/src/env.mjs";

export function HostNameProject() {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "EU") return null;

  return (
    <div>
      <h2 className="mb-5 text-base font-semibold leading-6 text-gray-900">
        Host Name
      </h2>
      <Card className="mb-4 p-4">
        <div className="mb-6">
          <div className="my-2">
            When connecting to Langfuse, use this hostname / baseurl.
          </div>
          <CodeView content={window.origin} />
        </div>
      </Card>
    </div>
  );
}
