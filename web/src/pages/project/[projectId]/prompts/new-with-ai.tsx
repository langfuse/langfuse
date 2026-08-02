import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import Page from "@/src/components/layouts/page";
import { MetaPromptPage } from "@/src/features/meta-prompt/components/MetaPromptPage";

export default function NewPromptWithAI() {
  const projectId = useProjectIdFromURL();

  return (
    <Page
      headerProps={{
        title: "New prompt with AI",
        help: {
          description:
            "Use AI to help you create well-structured prompts. Describe your requirements in the chat and the AI assistant will generate an optimized prompt for you.",
          href: "https://langfuse.com/docs/prompts",
        },
        breadcrumb: [
          {
            name: "Prompts",
            href: `/project/${projectId}/prompts/`,
          },
          {
            name: "New prompt with AI",
          },
        ],
      }}
    >
      <MetaPromptPage />
    </Page>
  );
}
