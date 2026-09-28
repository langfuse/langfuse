import { useMemo } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";
import {
  WebCalloutSettingsTable,
  type WebCalloutEndpoint,
} from "./WebCalloutSettingsTable";

export function ConnectedWebCalloutSettingsTable({
  projectId,
  onCreate,
  onEdit,
}: {
  projectId: string;
  onCreate: () => void;
  onEdit: (endpoint: WebCalloutEndpoint) => void;
}) {
  const utils = api.useUtils();
  const endpoints = api.webCallouts.all.useQuery({ projectId });
  const deleteMutation = api.webCallouts.delete.useMutation({
    onSuccess: async () => {
      await utils.webCallouts.invalidate();
      showSuccessToast({
        title: "Callout endpoint deleted",
        description: "The endpoint was removed from this project.",
      });
    },
    onError: (error) => {
      showErrorToast("Failed to delete callout endpoint", error.message);
    },
  });

  const data = useMemo<AsyncTableData<WebCalloutEndpoint[]>>(() => {
    if (endpoints.isLoading) return { status: "loading" };
    if (endpoints.isError) {
      return {
        status: "error",
        error: "Failed to load the callout endpoint. Please try again.",
      };
    }
    return { status: "success", data: endpoints.data ?? [] };
  }, [endpoints.data, endpoints.isError, endpoints.isLoading]);

  const disabledReason = useMemo(() => {
    if (endpoints.isLoading) {
      return "Loading callout endpoint configuration.";
    }
    if (endpoints.isError) {
      return "Could not load the callout endpoint configuration.";
    }
    if (endpoints.data?.length) {
      return "Currently you can only create one callout per project.";
    }
    return undefined;
  }, [endpoints.data, endpoints.isError, endpoints.isLoading]);

  return (
    <ConfirmationDialogController<WebCalloutEndpoint>
      title="Delete Callout Endpoint"
      text="This removes the configured endpoint and hides the web callout action."
      confirmLabel="Delete endpoint"
      variant="destructive"
      loading={deleteMutation.isPending}
      onConfirm={(endpoint) =>
        deleteMutation.mutateAsync({ projectId, id: endpoint.id })
      }
    >
      {({ openDialog }) => (
        <WebCalloutSettingsTable
          data={data}
          noResultsMessage="No callout endpoint configured."
          createAction={{ disabledReason, onClick: onCreate }}
          onEdit={onEdit}
          onDelete={openDialog}
        />
      )}
    </ConfirmationDialogController>
  );
}
