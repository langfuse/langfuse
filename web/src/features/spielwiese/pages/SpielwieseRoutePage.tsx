import SpielwieseIntroPage from "./SpielwieseIntroPage";
import SpielwieseDashboardPage from "./SpielwieseDashboardPage";
import SpielwieseOnboardingPage from "./SpielwieseOnboardingPage";
import { SpielwieseRouteTransitionProvider } from "../spielwieseRouteTransition";

type SpielwieseRoutePageProps = {
  slug?: string[];
};

export function getSpielwieseRoute(slug?: string[]) {
  if (slug?.[0] === "onboarding") {
    return "onboarding";
  }

  if (slug?.[0] === "dashboard") {
    return "dashboard";
  }

  return "intro";
}

function renderSpielwieseRoutePage({
  route,
  stepId,
}: {
  route: ReturnType<typeof getSpielwieseRoute>;
  stepId?: string;
}) {
  switch (route) {
    case "onboarding":
      return <SpielwieseOnboardingPage stepId={stepId} />;
    case "dashboard":
      return <SpielwieseDashboardPage />;
    case "intro":
      return <SpielwieseIntroPage />;
  }
}

export default function SpielwieseRoutePage({
  slug,
}: SpielwieseRoutePageProps) {
  const route = getSpielwieseRoute(slug);

  return (
    <SpielwieseRouteTransitionProvider>
      {renderSpielwieseRoutePage({ route, stepId: slug?.[1] })}
    </SpielwieseRouteTransitionProvider>
  );
}
