import { DevProjectPreviewShell } from "@/src/features/dev/components/DevProjectPreviewShell";
import {
  GreenfieldOnboardingView,
  greenfieldReferenceGaps,
} from "@/src/features/greenfield/components/GreenfieldOnboardingView";

const PREVIEW_ROUTE = "/dev/dashboard";

export default function DashboardPreviewPage() {
  return (
    <DevProjectPreviewShell
      currentPath={PREVIEW_ROUTE}
      title="Home"
      helpDescription={
        <div className="space-y-2">
          <p>
            Dev-only onboarding dashboard prototype using Langfuse&apos;s
            existing card, accordion, badge, and button primitives.
          </p>
          <ul role="list" className="space-y-1">
            {greenfieldReferenceGaps.map((gap) => (
              <li key={gap} className="text-sm text-pretty">
                {gap}
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <GreenfieldOnboardingView projectId="preview-project" />
    </DevProjectPreviewShell>
  );
}
