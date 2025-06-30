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
      <div className="mb-4">
        <div className="text-md mb-2 font-semibold">Signature Verification</div>
        <div className="mb-2 text-sm">
          Langfuse sends a{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            Langfuse-Signature
          </code>{" "}
          header with each webhook request for verification:
        </div>
        <CodeView
          content={`// Example verification in your webhook endpoint
import crypto from 'crypto';

function verifyLangfuseSignature(payload, signature, secret) {
  const elements = signature.split(',');
  let timestamp = null;
  const signatures = [];

  for (const element of elements) {
    const [key, value] = element.split('=', 2);
    if (key === 't') {
      timestamp = parseInt(value, 10);
    } else if (key === 'v1') {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  // Create expected signature
  const signedPayload = \`\${timestamp}.\${payload}\`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  // Verify signature
  return signatures.some(sig => 
    crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(sig, 'hex')
    )
  );
}`}
        />
      </div>
    </>
  );
};
