import { env } from "@/src/env.mjs";

export const CloudPrivacyNotice = ({ action }: { action: string }) =>
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined ? (
    <div className="text-muted-foreground mx-auto mt-10 max-w-lg text-center text-xs">
      By {action} you are agreeing to our{" "}
      <a
        href="https://clickhouse.com/legal/clickhouse-general-terms-and-conditions"
        target="_blank"
        rel="noopener noreferrer"
        className="italic"
      >
        ClickHouse General Terms and Conditions
      </a>
      ,{" "}
      <a
        href="https://clickhouse.com/legal/langfuse-cloud-addendum"
        target="_blank"
        rel="noopener noreferrer"
        className="italic"
      >
        Langfuse Cloud Addendum
      </a>
      , and{" "}
      <a
        href="https://langfuse.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="italic"
      >
        Langfuse Privacy Policy
      </a>
      . You also confirm that the entered data is accurate.
    </div>
  ) : null;
