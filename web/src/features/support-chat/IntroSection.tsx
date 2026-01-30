import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Github,
  Bug,
  Lightbulb,
  Sparkles,
  LibraryBig,
  LifeBuoy,
  Radio,
  Calendar,
} from "lucide-react";
//eslint-disable-next-line no-restricted-imports
import { SiDiscord } from "react-icons/si";
import { RainbowButton } from "@/src/components/magicui/rainbow-button";
import { Separator } from "@/src/components/ui/separator";
import { usePlan } from "@/src/features/entitlements/hooks";
import { isCloudPlan } from "@langfuse/shared";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type SupportType = "in-app-support" | "custom" | "community";

export function IntroSection({
  onStartForm,
}: {
  onStartForm: () => void;
  displayDensity?: "default" | "compact";
}) {
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
        <div className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4" /> Ask AI
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Get instant, helpful answers. Our AI knows the docs, examples, and
          best practices to guide you fast.
        </p>

        <RainbowButton asChild>
          <a
            href="https://langfuse.com/docs/ask-ai"
            target="_blank"
            rel="noopener"
          >
            Chat with AI
          </a>
        </RainbowButton>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-base font-semibold">
          <LibraryBig className="h-4 w-4" /> Docs
        </div>
        <p className="text-sm text-muted-foreground">
          Dive into guides, concepts, and API reference — clear steps and
          examples to move quickly.
        </p>

        <Button asChild variant="outline">
          <a
            href={
              uiCustomization?.documentationHref ?? "https://langfuse.com/docs"
            }
            target="_blank"
            rel="noopener"
          >
            View documentation
          </a>
        </Button>
      </div>

      <Separator />

      {supportType === "custom" && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <LifeBuoy className="h-4 w-4" /> Support
            </div>
            <p className="text-sm text-muted-foreground">
              Ask AI & Docs did not unblock you? Get in touch with the support
              team.
            </p>
            <Button variant="outline" asChild>
              <a
                href={uiCustomization?.supportHref}
                target="_blank"
                rel="noopener"
              >
                Open Support
              </a>
            </Button>
            {uiCustomization?.feedbackHref && (
              <Button variant="outline" asChild>
                <a
                  href={uiCustomization?.feedbackHref}
                  target="_blank"
                  rel="noopener"
                >
                  Submit Feedback
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
                    Feature request
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a
                    href="https://langfuse.com/issues"
                    target="_blank"
                    rel="noopener"
                  >
                    Report a bug
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
            <div className="flex items-center gap-2 text-base font-semibold">
              <LifeBuoy className="h-4 w-4" /> Email a Support Engineer
            </div>
            <p className="text-sm text-muted-foreground">
              Ask AI & Docs did not unblock you? One of our support engineers
              will help you get unblocked.
            </p>
            <Button variant="outline" onClick={onStartForm}>
              Email a Support Engineer
            </Button>
          </div>

          <Separator />
        </>
      )}

      {supportType === "community" && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <LifeBuoy className="h-4 w-4" /> Community Support
            </div>
            <p className="text-sm text-muted-foreground">
              Ask AI & Docs did not unblock you? Get help from and share
              feedback with the community.
            </p>
            <Button variant="outline" asChild>
              <a
                href="https://langfuse.com/gh-support"
                target="_blank"
                rel="noopener"
              >
                <Github className="mr-2 h-4 w-4" /> Get Help ↗
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://langfuse.com/ideas"
                target="_blank"
                rel="noopener"
              >
                <Lightbulb className="mr-2 h-4 w-4" /> Feature request ↗
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://langfuse.com/issues"
                target="_blank"
                rel="noopener"
              >
                <Bug className="mr-2 h-4 w-4" /> Report a bug ↗
              </a>
            </Button>
          </div>

          <Separator />
        </>
      )}

      {supportType !== "custom" && (
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            <Github className="h-4 w-4" /> Community & Resources
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Join the conversation and connect with the Langfuse community.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Button asChild variant="ghost" className="justify-start px-1.5">
              <a
                href="https://langfuse.com/gh-support"
                target="_blank"
                rel="noopener"
              >
                <Github className="mr-2 h-4 w-4" /> GitHub ↗
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
                <Calendar className="mr-2 h-4 w-4" /> Community Hours ↗
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
                  <Radio className="mr-2 h-4 w-4" /> Status Page ↗
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
