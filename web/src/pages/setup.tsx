import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { env } from "@/src/env.mjs";
import { STARTER_PROJECT_INVITE_PROMPT_STORAGE_KEY } from "@/src/features/onboarding/lib/starterProjectInvitePrompt";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { SetupPage as ManualSetupPage } from "@/src/features/setup/components/SetupPage";
import { api } from "@/src/utils/api";

export default function RootSetupPage() {
  const router = useRouter();
  const session = useSession();
  const attemptedBootstrapRef = useRef(false);
  const [isAutoProvisioning, setIsAutoProvisioning] = useState(false);
  const ensureStarterWorkspaceMutation =
    api.onboarding.ensureStarterWorkspace.useMutation();
  const homePath = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;

  const organizations = session.data?.user?.organizations;
  const hasRealOrganization = Boolean(
    organizations?.some((org) => org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID),
  );
  const shouldEnsureStarterWorkspace =
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) &&
    session.status === "authenticated" &&
    organizations !== undefined &&
    !hasRealOrganization &&
    Boolean(session.data?.user?.canCreateOrganizations);

  useEffect(() => {
    if (!shouldEnsureStarterWorkspace || attemptedBootstrapRef.current) {
      return;
    }

    attemptedBootstrapRef.current = true;
    setIsAutoProvisioning(true);

    void ensureStarterWorkspaceMutation
      .mutateAsync()
      .then(async (result) => {
        if (result.shouldShowInvitePrompt && result.starterProjectId) {
          localStorage.setItem(
            STARTER_PROJECT_INVITE_PROMPT_STORAGE_KEY,
            JSON.stringify({
              projectId: result.starterProjectId,
            }),
          );
        }

        try {
          await session.update();
        } catch {
          showErrorToast(
            "Workspace created",
            "Your workspace was created, but we couldn't refresh your session. Reloading the app to continue.",
            "WARNING",
          );
        }

        try {
          const didNavigate = await router.replace(homePath);
          if (!didNavigate && typeof window !== "undefined") {
            window.location.assign(homePath);
          }
        } catch {
          if (typeof window !== "undefined") {
            window.location.assign(homePath);
          }
        }
      })
      .catch(() => {
        setIsAutoProvisioning(false);
        showErrorToast(
          "Workspace setup failed",
          "We couldn't automatically create your starter workspace. You can create it manually below.",
        );
      });
  }, [
    ensureStarterWorkspaceMutation,
    homePath,
    router,
    session,
    shouldEnsureStarterWorkspace,
  ]);

  if (session.status === "loading" || isAutoProvisioning) {
    return <NoDataOrLoading isLoading />;
  }

  return <ManualSetupPage />;
}
