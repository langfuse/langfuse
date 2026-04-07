import { useRouter } from "next/router";
import { DevProjectPreviewShell } from "@/src/features/dev/components/DevProjectPreviewShell";
import { GreenfieldOnboardingView } from "../components/GreenfieldOnboardingView";

export default function GreenfieldPreviewPage() {
  const router = useRouter();

  return (
    <DevProjectPreviewShell currentPath={router.pathname} title="Greenfield">
      <GreenfieldOnboardingView projectId="preview-project" />
    </DevProjectPreviewShell>
  );
}
