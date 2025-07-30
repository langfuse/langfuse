import { accountTableColumns } from "@/src/features/accounts/table-definition";
import { DataTable } from "@/src/components/table/data-table";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { CreateUserDialog } from "@/src/features/accounts/CreateUserDialog";

// fetch all users from supabase
// show 3 tabs, real, synthethic and snapshots
// create must vary between real and synthetic
// snapshot can be created from message view only and requires no input, writes to djb metadata
// synthethic also writes to djb metadata
// usernames are auto constructed
// differ between real and synthetic by the type of djb_metadata, pick if its client side filter or search params with separate routes

export function AccountsPage() {
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
        actionButtonsRight: <CreateUserDialog />,
      }}
    >
      <DataTable
        tableName="accounts"
        columns={accountTableColumns}
        data={{
          data: data,
          isLoading: isLoading,
          isError: isError,
        }}
      />
    </Page>
  );
}
