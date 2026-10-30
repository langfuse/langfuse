import { useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { ChevronRight, Plus, X } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input as DesignSystemInput } from "@/src/components/design-system/Input/Input";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Button } from "@/src/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  ApiKeyExpirationInput,
  type ApiKeyExpirationPreset,
  resolveApiKeyExpiration,
} from "@/src/features/apiKey";
import { GeneratedKeyContent } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/GeneratedKeyContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

type MetadataField = {
  id: number;
  key: string;
  value: string;
};

type IssuedAs = "user" | "serviceAccount";

const issuedAsDescriptions: Record<IssuedAs, string> = {
  user: "Stops working if you leave the organization.",
  serviceAccount: "Keeps working when people leave the organization.",
};

export function CreateGatewayApiKeyDialogController({
  organizationId,
  children,
}: {
  organizationId: string;
  children: (control: { openDialog: () => void }) => ReactNode;
}) {
  const [name, setName] = useState("");
  const [expiryPreset, setExpiryPreset] =
    useState<ApiKeyExpirationPreset>("never");
  const [customExpiry, setCustomExpiry] = useState("");
  const [metadata, setMetadata] = useState<MetadataField[]>(() => [
    { id: 1, key: "", value: "" },
  ]);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [nextMetadataId, setNextMetadataId] = useState(2);
  const [issuedAs, setIssuedAs] = useState<IssuedAs>("user");
  const canIssueServiceAccountKeys = useHasOrganizationAccess({
    organizationId,
    scope: "gateway:manage",
  });
  const [generatedSecretKey, setGeneratedSecretKey] = useState<string | null>(
    null,
  );
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const session = useSession();
  const create = api.aiGateway.createApiKey.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-api-keys"),
  });

  const reset = () => {
    setName("");
    setExpiryPreset("never");
    setCustomExpiry("");
    setMetadata([{ id: 1, key: "", value: "" }]);
    setIsMetadataOpen(false);
    setGeneratedSecretKey(null);
    setNextMetadataId(2);
    setIssuedAs("user");
  };

  const metadataCount = metadata.filter((field) => field.key.trim()).length;
  const expiresAt = resolveApiKeyExpiration(expiryPreset, customExpiry);
  const effectiveIssuedAs = canIssueServiceAccountKeys ? issuedAs : "user";
  const isNameMissing = !name.trim();

  const submit = async () => {
    if (expiresAt === undefined || isNameMissing) return;
    const metadataObject = Object.fromEntries(
      metadata
        .filter((field) => field.key.trim())
        .map((field) => [field.key.trim(), field.value]),
    );
    try {
      const created = await create.mutateAsync({
        orgId: organizationId,
        name: name.trim(),
        metadata: metadataObject,
        expiresAt,
        issuedAs: effectiveIssuedAs,
      });
      capture("ai_gateway:api_key_created", {
        orgId: organizationId,
        creatorRole:
          session.data?.user?.organizations.find(
            (organization) => organization.id === organizationId,
          )?.role ?? null,
        isServiceAccount: effectiveIssuedAs === "serviceAccount",
        hasMetadata: metadataCount > 0,
        metadataCount,
        hasDescription: name.trim().length > 0,
        expiryPreset,
      });
      setGeneratedSecretKey(created.secretKey);
      await utils.aiGateway.listApiKeys.invalidate({
        orgId: organizationId,
      });
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-api-keys");
    }
  };

  return (
    <DialogController
      onBeforeClose={() => !create.isPending}
      renderDialog={() =>
        generatedSecretKey ? (
          <Dialog title="Gateway key created" size="md" closeLabel="Done">
            <GeneratedKeyContent
              organizationId={organizationId}
              secretKey={generatedSecretKey}
            />
          </Dialog>
        ) : (
          <Dialog
            title="Issue API key"
            size="md"
            actions={[
              {
                label: "Create key",
                loading: create.isPending,
                disabled:
                  create.isPending || expiresAt === undefined || isNameMissing,
                onClick: submit,
              },
            ]}
          >
            <Dialog.Body>
              {canIssueServiceAccountKeys ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Issued as</Label>
                  <div>
                    <Tabs
                      activationMode="manual"
                      value={issuedAs}
                      onValueChange={(value) => setIssuedAs(value as IssuedAs)}
                    >
                      <Tabs.List
                        variant="inset"
                        size="md"
                        aria-label="Issued as"
                      >
                        <Tabs.Trigger value="user" label="My user" />
                        <Tabs.Trigger
                          value="serviceAccount"
                          label="Service account"
                        />
                      </Tabs.List>
                    </Tabs>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {issuedAsDescriptions[issuedAs]}
                  </p>
                </div>
              ) : null}
              <CustomTooltip
                content={
                  <span>
                    Shown in the key list. Use it to describe what consumes the
                    key.
                  </span>
                }
              >
                {({ getTriggerProps }) => (
                  <FormField
                    label="Name"
                    required
                    registerLabelTooltip={getTriggerProps}
                  >
                    {(field) => (
                      <DesignSystemInput
                        id={field.id}
                        aria-describedby={field.inputDescribedById}
                        maxLength={500}
                        required
                        placeholder="e.g. Checkout agent, backend service"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    )}
                  </FormField>
                )}
              </CustomTooltip>
              <ApiKeyExpirationInput
                id="gateway-key-expiry"
                expiryPreset={expiryPreset}
                customExpiry={customExpiry}
                onExpiryPresetChange={setExpiryPreset}
                onCustomExpiryChange={setCustomExpiry}
              />
              <Collapsible
                open={isMetadataOpen}
                onOpenChange={setIsMetadataOpen}
              >
                <div className="flex items-center gap-1.5">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="group flex items-center gap-2 text-left text-sm"
                    >
                      <ChevronRight
                        size="base"
                        color="tertiary"
                        __rawClassName="translate-y-px transition-transform group-data-[state=open]:rotate-90"
                      />
                      <span>Metadata</span>
                      <span className="text-muted-foreground font-normal">
                        (optional)
                        {metadataCount > 0 ? ` · ${metadataCount} set` : ""}
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  <InfoTooltip label="About gateway key metadata">
                    Attached to every trace from this key, so you can filter and
                    group by it.
                  </InfoTooltip>
                </div>
                <CollapsibleContent className="mt-2 pl-5.5">
                  <div className="flex flex-col gap-2">
                    {metadata.map((field) => (
                      <div
                        key={field.id}
                        className="ph-no-capture flex items-center gap-2"
                      >
                        <Input
                          aria-label="Metadata key"
                          placeholder="key"
                          value={field.key}
                          onChange={(event) =>
                            setMetadata((current) =>
                              current.map((item) =>
                                item.id === field.id
                                  ? { ...item, key: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <Input
                          aria-label="Metadata value"
                          placeholder="value"
                          value={field.value}
                          onChange={(event) =>
                            setMetadata((current) =>
                              current.map((item) =>
                                item.id === field.id
                                  ? { ...item, value: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Remove metadata field"
                          onClick={() =>
                            setMetadata((current) =>
                              current.filter((item) => item.id !== field.id),
                            )
                          }
                        >
                          <X size="sm" color="default" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-primary mt-2 flex items-center gap-1 text-sm hover:underline"
                    onClick={() => {
                      setMetadata((current) => [
                        ...current,
                        { id: nextMetadataId, key: "", value: "" },
                      ]);
                      setNextMetadataId((current) => current + 1);
                    }}
                  >
                    <Plus size="base" />
                    Add metadata
                  </button>
                </CollapsibleContent>
              </Collapsible>
              {create.isError ? (
                <Alert variant="destructive">
                  <Alert.Title>Gateway key could not be created</Alert.Title>
                  <Alert.Description>
                    {create.error?.message ??
                      "Check the metadata and try again."}
                  </Alert.Description>
                </Alert>
              ) : null}
            </Dialog.Body>
          </Dialog>
        )
      }
    >
      {({ openDialog }) =>
        children({
          openDialog: () => {
            reset();
            openDialog();
          },
        })
      }
    </DialogController>
  );
}
