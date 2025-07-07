import React from "react";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";

export const WebhookSecretRender = ({
  webhookSecret,
}: {
  webhookSecret: string;
}) => {
  return (
    <>
      <div className="mb-4">
        <div className="text-md font-semibold">Webhook Secret</div>
        <div className="my-2 text-sm">
          This secret can only be viewed once. You can regenerate it in the
          automation settings if needed. Use this secret to verify webhook
          signatures in your endpoint.
        </div>
        <CodeView content={webhookSecret} defaultCollapsed={false} />
      </div>
    </>
  );
};
