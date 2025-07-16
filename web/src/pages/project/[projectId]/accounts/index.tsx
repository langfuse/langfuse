import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";

export default function AccountsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <Page
      headerProps={{
        title: "Accounts",
        breadcrumb: [
          { name: "Accounts", href: `/project/${projectId}/accounts` },
        ],
      }}
    >
      <div>content</div>
    </Page>
  );
}
