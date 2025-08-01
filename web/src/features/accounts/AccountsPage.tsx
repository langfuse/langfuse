import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";
import { CreateUserDialog } from "@/src/features/accounts/CreateUserDialog";
import { useQueryParam, withDefault, StringParam } from "use-query-params";
import { SyntheticUsersPage } from "@/src/features/accounts/synthetic/SyntheticUsersPage";
import { SnapshotUsersPage } from "@/src/features/accounts/snapshot/SnapshotUsersPage";
import { CreateSyntheticUserDialog } from "@/src/features/accounts/synthetic/CreateSyntheticUserDialog";
import { RealUsersTable } from "@/src/features/accounts/RealUsersTable";

// fetch all users from supabase
// show 3 tabs, real, synthetic and snapshots
// create must vary between real and synthetic
// snapshot can be created from message view only and requires no input, writes to djb metadata
// synthetic also writes to djb metadata
// usernames are auto constructed
// differ between real and synthetic by the type of djb_metadata, pick if its client side filter or search params with separate routes

export function AccountsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // Use query param for tab, default to "real" if no tab is specified
  const [activeTab] = useQueryParam("tab", withDefault(StringParam, "real"));

  // Define tabs configuration
  const tabs = [
    {
      label: "Real Users",
      value: "real",
      href: `/project/${projectId}/accounts?tab=real`,
    },
    {
      label: "Synthetic Users",
      value: "synthetic",
      href: `/project/${projectId}/accounts?tab=synthetic`,
    },
    {
      label: "Snapshot Users",
      value: "snapshot",
      href: `/project/${projectId}/accounts?tab=snapshot`,
    },
  ];

  // Render different content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "synthetic":
        return <SyntheticUsersPage projectId={projectId} />;
      case "snapshot":
        return <SnapshotUsersPage projectId={projectId} />;
      case "real":
        return <RealUsersTable projectId={projectId} />;
    }
  };

  // Show appropriate create dialog based on active tab
  const renderActionButton = () => {
    switch (activeTab) {
      case "synthetic":
        return <CreateSyntheticUserDialog projectId={projectId} />;
      case "real":
        return <CreateUserDialog />;
      case "snapshot":
      default:
        return undefined;
    }
  };

  return (
    <Page
      headerProps={{
        title: "Accounts",
        breadcrumb: [
          { name: "Accounts", href: `/project/${projectId}/accounts` },
        ],
        actionButtonsRight: renderActionButton(),
        tabsProps: {
          tabs,
          activeTab,
        },
      }}
    >
      {renderTabContent()}
    </Page>
  );
}
