import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import SessionsTable from "@/src/components/table/use-cases/sessions";
import DocPopup from "@/src/components/layouts/doc-popup";

export default function Sessions() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div>
      <Header
        title="Sessions"
        actionButtons={
          <DocPopup
            description="Calculated multiplying the number of tokens with cost per token for each model."
            link="https://langfuse.com/docs/token-usage"
          />
        }
      />

      <SessionsTable projectId={projectId} />
    </div>
  );
}
