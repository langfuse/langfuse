import React from "react";
import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";

export const WebhookSecretRender = ({
  webhookSecret,
}: {
  webhookSecret: string;
}) => {
  return (
    <>
      <div className="mb-4">
        <div className="font-bold">Webhook Secret</div>
        <div className="my-2 text-sm">
          This secret can only be viewed once. You can regenerate it in the
          automation settings if needed. Use this secret to verify webhook
          signatures in your endpoint.
        </div>
        <CodeSection variant="outline" copyValue={webhookSecret}>
          {webhookSecret}
        </CodeSection>
      </div>
    </>
  );
};
