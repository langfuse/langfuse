import { useState, type ReactNode } from "react";
import { X } from "lucide-react";

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
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { GeneratedKeyContent } from "@/src/features/llm-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent";
import { api, reportNonTrpcError } from "@/src/utils/api";

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
  children: (control: { Trigger: typeof DialogTrigger }) => ReactNode;
}) {
  const [note, setNote] = useState("");
  const [metadata, setMetadata] = useState<MetadataField[]>(() => [
    { id: 1, key: "", value: "" },
    { id: 2, key: "", value: "" },
  ]);
  const [nextMetadataId, setNextMetadataId] = useState(3);
  const [generatedKeys, setGeneratedKeys] = useState<{
    publicKey: string;
    secretKey: string;
  } | null>(null);
  const utils = api.useUtils();
  const create = api.llmGateway.createApiKey.useMutation();

  const reset = () => {
    setNote("");
    setMetadata([
      { id: 1, key: "", value: "" },
      { id: 2, key: "", value: "" },
    ]);
    setGeneratedKeys(null);
    setNextMetadataId(3);
  };

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
      await utils.llmGateway.listApiKeys.invalidate({
        orgId: organizationId,
      });
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-api-keys");
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
            <p className="text-foreground-tertiary text-xs tracking-wider uppercase">
              New key
            </p>
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
                  <Label htmlFor="gateway-key-note">Description</Label>
                  <Input
                    id="gateway-key-note"
                    className="mt-1.5"
                    maxLength={500}
                    placeholder="e.g. Checkout agent, backend service"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    Shown in the key list. Use it to describe what consumes the
                    key.
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <Label>
                      Metadata{" "}
                      <span className="text-muted-foreground font-normal">
                        optional
                      </span>
                    </Label>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setMetadata((current) => [
                          ...current,
                          { id: nextMetadataId, key: "", value: "" },
                        ]);
                        setNextMetadataId((current) => current + 1);
                      }}
                    >
                      Add field
                    </Button>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Attached to every trace from this key, so you can filter and
                    group by it.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
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
                </div>
                <Alert>
                  <Alert.Title>Full gateway access, shown once</Alert.Title>
                  <Alert.Description>
                    The key can reach every enabled model on every provider
                    credential in this organization. Its secret is displayed
                    once after creation and never stored in readable form.
                  </Alert.Description>
                </Alert>
                {create.isError ? (
                  <Alert variant="destructive">
                    <Alert.Title>Gateway key could not be created</Alert.Title>
                    <Alert.Description>
                      Check the metadata and try again.
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
      {({ Trigger }) => children({ Trigger })}
    </DialogController>
  );
}
