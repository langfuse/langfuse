import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { type RouterOutput } from "@/src/utils/types";

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

function AccountsTable({
  users,
}: {
  users: RouterOutput["accounts"]["getUsers"];
}) {
  return (
    <div className="grid gap-4">{users.map((user) => user.identifier)}</div>
  );
}
