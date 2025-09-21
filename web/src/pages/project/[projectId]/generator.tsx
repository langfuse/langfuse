import Page from "@/src/components/layouts/page";
import { PromptGenerator } from "@/src/features/prompts/components/PromptGenerator";

export default function Generator() {
  return (
    <Page
      headerProps={{
        title: "Auto Sweep",
        help: {
          description:
            "Generate multiple variations of your prompts using the existing default LLM. Select a prompt and specify how many variations you want to create.",
          href: "https://langfuse.com/docs/prompt-management/get-started",
        },
      }}
    >
      <PromptGenerator />
    </Page>
  );
}
