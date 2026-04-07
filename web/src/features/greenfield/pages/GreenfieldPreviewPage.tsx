import { DevProjectPreviewShell } from "@/src/features/dev/components/DevProjectPreviewShell";
import { GreenfieldOnboardingView } from "../components/GreenfieldOnboardingView";

const PREVIEW_ROUTE = "/dev/greenfield";

export default function GreenfieldPreviewPage() {
  return (
    <DevProjectPreviewShell
      currentPath={PREVIEW_ROUTE}
      title="Greenfield"
      helpDescription="This is a mocked authenticated shell for design review only. The real authenticated greenfield route remains unchanged."
    >
      <GreenfieldOnboardingView projectId="preview-project" />
    </DevProjectPreviewShell>
  );
}
