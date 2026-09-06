import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Bug,
  Lightbulb,
  Sparkles,
  LibraryBig,
  LifeBuoy,
  Radio,
  Calendar,
} from "lucide-react";
import { SiDiscord, SiGithub } from "react-icons/si";
import { RainbowButton } from "@/src/components/magicui/rainbow-button";
import { Separator } from "@/src/components/ui/separator";
import { usePlan } from "@/src/features/entitlements/hooks";
import { isCloudPlan } from "@langfuse/shared";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useTranslations } from "next-intl";

type SupportType = "in-app-support" | "custom" | "community";

export function IntroSection({ onStartForm }: { onStartForm: () => void }) {
  const t = useTranslations("sharedUi.support");
  const uiCustomization = useUiCustomization();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const capture = usePostHogClientCapture();

  // Note: We previously added an entitlement for in-app support, but removed it for now.
  //       The issue was that on global routes e.g., https://langfuse.com/setup, the entitlement
  //       hook would not have access to an org or project an therefore no plan, always returning
  //       false if asked. However on these pages, the in-app-chat should be available.
  //       Therefore we now check for whether wer are in a cloud deployment instead.
  // const hasInAppSupportEntitlement = useHasEntitlement("in-app-support");
  const hasInAppSupportEntitlement = !!isLangfuseCloud;
  const plan = usePlan();

  const supportType: SupportType = useMemo(() => {
    if (uiCustomization?.supportHref) {
      return "custom";
    }
    if (hasInAppSupportEntitlement) {
      return "in-app-support";
    }
    return "community";
  }, [hasInAppSupportEntitlement, uiCustomization]);

  const showStatusPageLink = useMemo(() => {
    return isCloudPlan(plan);
  }, [plan]);

  return (
    <div className="mt-1 flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-base font-bold">
          <Sparkles className="h-4 w-4" /> {t("askAi")}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("askAiDescription")}
        </p>

        <RainbowButton asChild>
          <a
            href="https://langfuse.com/docs/ask-ai"
            target="_blank"
            rel="noopener"
          >
            {t("chatWithAi")}
          </a>
        </RainbowButton>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-base font-bold">
          <LibraryBig className="h-4 w-4" /> {t("docs")}
        </div>
        <p className="text-muted-foreground text-sm">{t("docsDescription")}</p>

        <Button asChild variant="outline">
          <a
            href={
              uiCustomization?.documentationHref ?? "https://langfuse.com/docs"
            }
            target="_blank"
            rel="noopener"
          >
            {t("viewDocumentation")}
          </a>
        </Button>
      </div>

      <Separator />

      {supportType === "custom" && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-base font-bold">
              <LifeBuoy className="h-4 w-4" /> {t("title")}
            </div>
            <p className="text-muted-foreground text-sm">
              {t("supportDescription")}
            </p>
            <Button variant="outline" asChild>
              <a
                href={uiCustomization?.supportHref}
                target="_blank"
                rel="noopener"
              >
                {t("openSupport")}
              </a>
            </Button>
            {uiCustomization?.feedbackHref && (
              <Button variant="outline" asChild>
                <a
                  href={uiCustomization?.feedbackHref}
                  target="_blank"
                  rel="noopener"
                >
                  {t("submitFeedback")}
                </a>
              </Button>
            )}
            {!uiCustomization?.supportHref && (
              <>
                <Button variant="outline" asChild>
                  <a
                    href="https://langfuse.com/ideas"
                    target="_blank"
                    rel="noopener"
                  >
                    {t("featureRequest")}
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a
                    href="https://langfuse.com/issues"
                    target="_blank"
                    rel="noopener"
                  >
                    {t("reportBug")}
                  </a>
                </Button>
              </>
            )}
          </div>

          <Separator />
        </>
      )}

      {supportType === "in-app-support" && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-base font-bold">
              <LifeBuoy className="h-4 w-4" /> {t("emailSupportEngineer")}
            </div>
            <p className="text-muted-foreground text-sm">
              {t("emailSupportDescription")}
            </p>
            <Button variant="outline" onClick={onStartForm}>
              {t("emailSupportEngineer")}
            </Button>
          </div>

          <Separator />
        </>
      )}

      {supportType === "community" && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-base font-bold">
              <LifeBuoy className="h-4 w-4" /> {t("communitySupport")}
            </div>
            <p className="text-muted-foreground text-sm">
              {t("communitySupportDescription")}
            </p>
            <Button variant="outline" asChild>
              <a
                href="https://langfuse.com/gh-support"
                target="_blank"
                rel="noopener"
              >
                <SiGithub className="mr-2 h-4 w-4" /> {t("getHelp")} ↗
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://langfuse.com/ideas"
                target="_blank"
                rel="noopener"
              >
                <Lightbulb className="mr-2 h-4 w-4" /> {t("featureRequest")} ↗
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://langfuse.com/issues"
                target="_blank"
                rel="noopener"
              >
                <Bug className="mr-2 h-4 w-4" /> {t("reportBug")} ↗
              </a>
            </Button>
          </div>

          <Separator />
        </>
      )}

      {supportType !== "custom" && (
        <div>
          <div className="flex items-center gap-2 text-base font-bold">
            <SiGithub className="h-4 w-4" /> {t("communityResources")}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("communityResourcesDescription")}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Button asChild variant="ghost" className="justify-start px-1.5">
              <a
                href="https://langfuse.com/gh-support"
                target="_blank"
                rel="noopener"
              >
                <SiGithub className="mr-2 h-4 w-4" /> GitHub ↗
              </a>
            </Button>
            <Button asChild variant="ghost" className="justify-start px-1.5">
              <a
                href="https://langfuse.com/discord"
                target="_blank"
                rel="noopener"
                className="flex items-center"
              >
                <SiDiscord className="mr-2 h-4 w-4" /> Discord ↗
              </a>
            </Button>
            <Button asChild variant="ghost" className="justify-start px-1.5">
              <a
                href="https://lu.ma/langfuse"
                target="_blank"
                rel="noopener"
                className="flex items-center"
                onClick={() => capture("support_chat:community_hours_click")}
              >
                <Calendar className="mr-2 h-4 w-4" /> {t("communityHours")} ↗
              </a>
            </Button>

            {showStatusPageLink && (
              <Button asChild variant="ghost" className="justify-start px-1.5">
                <a
                  href="https://status.langfuse.com"
                  target="_blank"
                  rel="noopener"
                  className="flex items-center"
                >
                  <Radio className="mr-2 h-4 w-4" /> {t("statusPage")} ↗
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
