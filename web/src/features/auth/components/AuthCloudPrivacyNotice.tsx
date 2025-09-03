import { env } from "@/src/env.mjs";
import { useTranslation } from "next-i18next";

export const CloudPrivacyNotice = ({ actionKey }: { actionKey: string }) => {
  const { t } = useTranslation("common");
  const action = t(actionKey);
  console.log("actionKey", actionKey, "action", action);

  return env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined ? (
    <div className="mx-auto mt-10 max-w-lg text-center text-xs text-muted-foreground">
      {t("auth.byActionAgreeing", { action })}{" "}
      <a
        href="https://langfuse.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="italic"
      >
        {t("auth.termsAndConditions")}
      </a>
      ,{" "}
      <a
        href="https://langfuse.com/privacy"
        rel="noopener noreferrer"
        className="italic"
      >
        {t("auth.privacyPolicy")}
      </a>
      , {t("auth.and")}{" "}
      <a
        href="https://langfuse.com/cookie-policy"
        rel="noopener noreferrer"
        className="italic"
      >
        {t("auth.cookiePolicy")}
      </a>
      . {t("auth.confirmDataAccurate")}
    </div>
  ) : null;
};
