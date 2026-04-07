import { useRouter } from "next/router";
import { DevProjectPreviewShell } from "@/src/features/dev/components/DevProjectPreviewShell";
import { GreenfieldOnboardingView } from "@/src/features/greenfield/components/GreenfieldOnboardingView";

export default function DashboardPreviewPage() {
  const router = useRouter();

  return (
    <DevProjectPreviewShell currentPath={router.pathname} title="Home">
      <GreenfieldOnboardingView projectId="preview-project" />
    </DevProjectPreviewShell>
  );
}
