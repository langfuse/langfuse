import Header from "@/src/components/layouts/header";
import { BotsTable } from "@/src/features/bots/components/bots-table";
import { useRouter } from "next/router";

export default function Prompts() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="xl:container">
      <Header
        title="Bots"
        help={{
          description:
            "Manage and customize your bots to complete tasks in Langfuse. Bots can be created and deployed from langfuse. Retrieve the production version via the SDKs. Learn more in the docs.",
          href: "https://langfuse.com/docs/bots?????",
        }}
      />
      <BotsTable projectId={projectId} />
    </div>
  );
}
