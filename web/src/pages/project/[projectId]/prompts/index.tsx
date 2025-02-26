import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { PromptTable } from "@/src/features/prompts/components/prompts-table";
import { api } from "@/src/utils/api";
import { PromptsOnboarding } from "@/src/components/onboarding/PromptsOnboarding";

export default function Prompts() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // Check if the project has any prompts
  const { data: hasAnyPrompt, isLoading } = api.prompts.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const showOnboarding = !isLoading && !hasAnyPrompt;

  return (
    <Page
      headerProps={{
        title: "Prompts",
        help: {
          description:
            "Manage and version your prompts in Langfuse. Edit and update them via the UI and SDK. Retrieve the production version via the SDKs. Learn more in the docs.",
          href: "https://langfuse.com/docs/prompts",
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if project has no prompts */}
      {showOnboarding ? (
        <PromptsOnboarding projectId={projectId} />
      ) : (
        <PromptTable />
      )}
    </Page>
  );
}
