import Page from "@/src/components/layouts/page";
import { AccountsTable } from "@/src/features/accounts/AccountsTable";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";

export default function AccountsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const { data, isLoading, isError } = api.accounts.getUsers.useQuery({
    projectId,
  });

  return (
    <Page
      headerProps={{
        title: "Accounts",
        breadcrumb: [
          { name: "Accounts", href: `/project/${projectId}/accounts` },
        ],
      }}
    >
      <div>
        {isLoading && <div>Loading...</div>}
        {isError && <div>Error</div>}
        {data && <AccountsTable users={data} />}
      </div>
    </Page>
  );
}
