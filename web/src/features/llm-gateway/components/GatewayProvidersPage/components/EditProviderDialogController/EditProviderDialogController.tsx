import type { ReactNode } from "react";

import {
  DialogController,
  type DialogTrigger,
} from "@/src/components/ui/dialog";
import { EditProviderForm } from "@/src/features/llm-gateway/components/GatewayProvidersPage/components/EditProviderDialogController/components/EditProviderForm";
import type { GatewayConnection } from "@/src/features/llm-gateway/types/gatewayConnection";

export function EditProviderDialogController({
  organizationId,
  connection,
  children,
}: {
  organizationId: string;
  connection: GatewayConnection;
  children: (control: { Trigger: typeof DialogTrigger }) => ReactNode;
}) {
  return (
    <DialogController
      size="default"
      closeOnInteractionOutside={false}
      renderContent={({ closeDialog }) => (
        <EditProviderForm
          key={`${connection.id}:${connection.updatedAt.toISOString()}`}
          organizationId={organizationId}
          connection={connection}
          closeDialog={closeDialog}
        />
      )}
    >
      {({ Trigger }) => children({ Trigger })}
    </DialogController>
  );
}
