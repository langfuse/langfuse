import { env } from "@/src/env.mjs";
import { useTranslation } from "react-i18next";

export const CloudPrivacyNotice = ({ action }: { action: string }) => {
  const { t } = useTranslation();

  return env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined ? (
    <div className="mx-auto mt-10 max-w-lg text-center text-xs text-muted-foreground">
      {action === "signing in"
        ? t("auth.privacy.bySigningIn")
        : t("auth.privacy.byCreatingAccount")}{" "}
      <a
        href="https://langfuse.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="italic"
      >
        {t("auth.privacy.termsAndConditions")}
      </a>
      {t("auth.privacy.comma")}{" "}
      <a
        href="https://langfuse.com/privacy"
        rel="noopener noreferrer"
        className="italic"
      >
        {t("auth.privacy.privacyPolicy")}
      </a>
      {t("auth.privacy.comma")} {t("auth.privacy.and")}{" "}
      <a
        href="https://langfuse.com/cookie-policy"
        rel="noopener noreferrer"
        className="italic"
      >
        {t("auth.privacy.cookiePolicy")}
      </a>
      . {t("auth.privacy.dataAccuracy")}
    </div>
  ) : null;
};
