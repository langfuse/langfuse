import { useRouter } from "next/router";
import { DevProjectPreviewShell } from "@/src/features/dev/components/DevProjectPreviewShell";
import { getPromptStageHref } from "@/src/product/shell/product-manifest";
import { GreenfieldOnboardingView } from "../components/GreenfieldOnboardingView";

const PREVIEW_PROJECT_ID = "test";
const DEFAULT_PROMPT_PATH = ["support", "triage-agent"];

export default function GreenfieldPreviewPage() {
  const router = useRouter();

  return (
    <DevProjectPreviewShell currentPath={router.pathname} title="Greenfield">
      <GreenfieldOnboardingView
        projectId={PREVIEW_PROJECT_ID}
        iterateHref={getPromptStageHref(
          PREVIEW_PROJECT_ID,
          DEFAULT_PROMPT_PATH,
          "iterate",
        )}
        iterateLabel="Open Prompt Workspace"
      />
    </DevProjectPreviewShell>
  );
}
