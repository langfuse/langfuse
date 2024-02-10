import Header from "@/src/components/layouts/header";
import { PromptTable } from "@/src/features/prompts/components/prompts-table";
import { useRouter } from "next/router";

export default function Prompts() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="xl:container">
      <Header
        title="Prompts"
        help={{
          description:
            "Manage and version your prompts in Langfuse. Edit and update them via the UI and SDK. Retrieve the production version via the SDKs. Learn more in the docs.",
          href: "https://langfuse.com/docs/prompts",
        }}
      />
      <PromptTable projectId={projectId} />
    </div>
  );
}
