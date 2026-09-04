import { useState } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { CredentialFields } from "@/src/features/llm-gateway/components/GatewayProvidersPage/components/CredentialFields";
import { providerLabels } from "@/src/features/llm-gateway/constants/providerLabels";
import type { GatewayConnection } from "@/src/features/llm-gateway/types/gatewayConnection";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function EditProviderForm({
  organizationId,
  connection,
  closeDialog,
}: {
  organizationId: string;
  connection: GatewayConnection;
  closeDialog: () => void;
}) {
  const [name, setName] = useState(connection.name);
  const [credential, setCredential] = useState("");
  const utils = api.useUtils();
  const update = api.llmGateway.updateConnection.useMutation();

  const submit = async () => {
    try {
      await update.mutateAsync({
        orgId: organizationId,
        id: connection.id,
        name,
        ...(credential ? { credential } : {}),
      });
      await utils.llmGateway.listConnections.invalidate({
        orgId: organizationId,
      });
      closeDialog();
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-providers");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit provider credential</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div>
          <Label>Provider</Label>
          <Input
            className="mt-1.5"
            value={providerLabels[connection.provider]}
            disabled
          />
        </div>
        <CredentialFields
          name={name}
          credential={credential}
          credentialPlaceholder="Leave blank to keep current key"
          onNameChange={setName}
          onCredentialChange={setCredential}
        />
        {update.isError ? (
          <Alert variant="destructive">
            <Alert.Title>Provider validation failed</Alert.Title>
            <Alert.Description>
              The credential could not be saved or validated. Check the key and
              try again.
            </Alert.Description>
          </Alert>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button
          disabled={!name.trim() || update.isPending}
          loading={update.isPending}
          onClick={submit}
        >
          Test and save
        </Button>
      </DialogFooter>
    </>
  );
}
