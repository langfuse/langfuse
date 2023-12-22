import { Card } from "@tremor/react";
import { CodeView } from "@/src/components/ui/code";
import { env } from "@/src/env.mjs";

export function HostNameProject() {
  const hostname =
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "EU" ? window.origin : undefined;

  return (
    <div>
      <h2 className="mb-5 text-base font-semibold leading-6 text-gray-900">
        Host Name
      </h2>
      <Card className="mb-4 p-4">
        {hostname ? (
          <>
            <div className="mb-6">
              <div className="my-2">
                When connecting to Langfuse, use this hostname / baseurl.
              </div>
              <CodeView content={hostname} />
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
