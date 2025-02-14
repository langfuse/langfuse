import Page from "@/src/components/layouts/page";
import { PromptTable } from "@/src/features/prompts/components/prompts-table";

export default function Prompts() {
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
    >
      <PromptTable />
    </Page>
  );
}
