import { env } from "@/src/env.mjs";
import { useTranslations } from "next-intl";

export const CloudPrivacyNotice = ({ action }: { action: string }) => {
  const t = useTranslations("auth.cloud");

  return env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined ? (
    <div className="text-muted-foreground mx-auto mt-10 max-w-lg text-center text-xs">
      {t.rich("privacy", {
        action,
        terms: () => (
          <a
            href="https://clickhouse.com/legal/clickhouse-general-terms-and-conditions"
            target="_blank"
            rel="noopener noreferrer"
            className="italic"
          >
            ClickHouse General Terms and Conditions
          </a>
        ),
        addendum: () => (
          <a
            href="https://clickhouse.com/legal/langfuse-cloud-addendum"
            target="_blank"
            rel="noopener noreferrer"
            className="italic"
          >
            Langfuse Cloud Addendum
          </a>
        ),
        privacy: () => (
          <a
            href="https://langfuse.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="italic"
          >
            Langfuse Privacy Policy
          </a>
        ),
      })}
    </div>
  ) : null;
};
