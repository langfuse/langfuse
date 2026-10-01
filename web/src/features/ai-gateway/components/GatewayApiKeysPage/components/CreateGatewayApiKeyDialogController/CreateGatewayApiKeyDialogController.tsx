import { useState, type ReactNode } from "react";
import { ChevronRight, Plus, X } from "lucide-react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import {
  DialogBody,
  DialogController,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { GeneratedKeyContent } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent";
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

export function CreateGatewayApiKeyDialogController({
  organizationId,
  children,
}: {
  organizationId: string;
  children: (control: { openDialog: () => void }) => ReactNode;
}) {
  const [note, setNote] = useState("");
  const [metadata, setMetadata] = useState<MetadataField[]>(() => [
    { id: 1, key: "", value: "" },
  ]);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [nextMetadataId, setNextMetadataId] = useState(2);
  const [generatedKeys, setGeneratedKeys] = useState<{
    publicKey: string;
    secretKey: string;
  } | null>(null);
  const utils = api.useUtils();
  const create = api.aiGateway.createApiKey.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-api-keys"),
  });

  const reset = () => {
    setNote("");
    setMetadata([{ id: 1, key: "", value: "" }]);
    setIsMetadataOpen(false);
    setGeneratedKeys(null);
    setNextMetadataId(2);
  };

  const metadataCount = metadata.filter((field) => field.key.trim()).length;

  const submit = async () => {
    const metadataObject = Object.fromEntries(
      metadata
        .filter((field) => field.key.trim())
        .map((field) => [field.key.trim(), field.value]),
    );
    try {
      const created = await create.mutateAsync({
        orgId: organizationId,
        note: note.trim() || undefined,
        metadata: metadataObject,
      });
      setGeneratedKeys({
        publicKey: created.publicKey,
        secretKey: created.secretKey,
      });
      await utils.aiGateway.listApiKeys.invalidate({
        orgId: organizationId,
      });
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-api-keys");
    }
  };

  return (
    <DialogController
      size="default"
      closeOnInteractionOutside={false}
      onBeforeClose={() => !create.isPending}
      onDismiss={reset}
      renderContent={({ closeDialog }) => (
        <>
          <DialogHeader>
            <DialogTitle>
              {generatedKeys ? "Gateway API key created" : "Issue API key"}
            </DialogTitle>
          </DialogHeader>
          {generatedKeys ? (
            <GeneratedKeyContent generatedKeys={generatedKeys} />
          ) : (
            <>
              <DialogBody>
                <div>
                  <Label
                    htmlFor="gateway-key-note"
                    className="flex items-center gap-1.5"
                  >
                    Description
                    <InfoTooltip label="About gateway key descriptions">
                      Shown in the key list. Use it to describe what consumes
                      the key.
                    </InfoTooltip>
                  </Label>
                  <Input
                    id="gateway-key-note"
                    className="mt-1.5"
                    maxLength={500}
                    placeholder="e.g. Checkout agent, backend service"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
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
                        <ChevronRight className="text-muted-foreground size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                        <span>Metadata</span>
                        <span className="text-muted-foreground font-normal">
                          (optional)
                          {metadataCount > 0 ? ` · ${metadataCount} set` : ""}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    <InfoTooltip label="About gateway key metadata">
                      Attached to every trace from this key, so you can filter
                      and group by it.
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
                            <X className="size-4" />
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
                      <Plus className="size-3.5" />
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
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  loading={create.isPending}
                  disabled={create.isPending}
                  onClick={submit}
                >
                  Create key
                </Button>
              </DialogFooter>
            </>
          )}
        </>
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}
