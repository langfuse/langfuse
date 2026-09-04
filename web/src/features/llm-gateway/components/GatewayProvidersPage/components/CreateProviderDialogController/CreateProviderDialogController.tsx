import { useState, type ReactNode } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogController,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogTrigger,
} from "@/src/components/ui/dialog";
import { CredentialFields } from "@/src/features/llm-gateway/components/GatewayProvidersPage/components/CredentialFields";
import { ProviderSelect } from "@/src/features/llm-gateway/components/GatewayProvidersPage/components/ProviderSelect";
import type { GatewayProvider } from "@/src/features/llm-gateway/types/gatewayProvider";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function CreateProviderDialogController({
  organizationId,
  children,
}: {
  organizationId: string;
  children: (control: { Trigger: typeof DialogTrigger }) => ReactNode;
}) {
  const [provider, setProvider] = useState<GatewayProvider>("OPENAI");
  const [name, setName] = useState("");
  const [credential, setCredential] = useState("");
  const utils = api.useUtils();
  const create = api.llmGateway.createConnection.useMutation();

  const reset = () => {
    setProvider("OPENAI");
    setName("");
    setCredential("");
  };

  const submit = async (closeDialog: () => void) => {
    try {
      await create.mutateAsync({
        orgId: organizationId,
        provider,
        name,
        credential,
      });
      await utils.llmGateway.listConnections.invalidate({
        orgId: organizationId,
      });
      closeDialog();
      reset();
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-providers");
    }
  };

  return (
    <DialogController
      size="default"
      closeOnInteractionOutside={false}
      onDismiss={reset}
      onBeforeClose={() => !create.isPending}
      renderContent={({ closeDialog }) => (
        <>
          <DialogHeader>
            <DialogTitle>Add provider credential</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <ProviderSelect value={provider} onChange={setProvider} />
            <CredentialFields
              name={name}
              credential={credential}
              credentialPlaceholder="Enter secret key"
              onNameChange={setName}
              onCredentialChange={setCredential}
            />
            {create.isError ? (
              <Alert variant="destructive">
                <Alert.Title>Provider validation failed</Alert.Title>
                <Alert.Description>
                  The credential could not be saved or validated. Check the key
                  and try again.
                </Alert.Description>
              </Alert>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              disabled={!name.trim() || !credential || create.isPending}
              loading={create.isPending}
              onClick={() => submit(closeDialog)}
            >
              Test and save
            </Button>
          </DialogFooter>
        </>
      )}
    >
      {({ Trigger }) => children({ Trigger })}
    </DialogController>
  );
}
