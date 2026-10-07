import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  TOPICS_MODEL_SLOT_DETAILS,
  TOPICS_MODEL_SLOTS,
  TOPICS_SUPPORTED_ADAPTERS,
  type TopicsModelSettings,
  type TopicsModelSlotName,
} from "@langfuse/shared/topics";

const FORM_ID = "topics-model-settings";
const MODEL_PLACEHOLDERS: Record<TopicsModelSlotName, string> = {
  summary: "e.g. gpt-6-luna or us.openai.gpt-6-luna",
  embedding: "e.g. text-embedding-3-small or eu.cohere.embed-v4:0",
  naming: "e.g. gpt-5.6-terra or a Claude Sonnet model",
};

type StoredSettings = RouterOutputs["topics"]["modelSettings"];
type Connection = RouterOutputs["llmApiKey"]["all"]["data"][number];
type SlotDraft = { llmApiKeyId: string; model: string };

/** Model settings for Topics: the dialog, its trigger, and a page notice. */
export function useTopicModelSettings({
  projectId,
  canWrite,
}: {
  projectId: string;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const settings = api.topics.modelSettings.useQuery({ projectId });
  const connections = api.llmApiKey.all.useQuery({ projectId });
  const configured = Boolean(
    settings.data?.summary && settings.data.embedding && settings.data.naming,
  );

  const action = (
    <Button
      text="Models"
      variant="secondary"
      size="sm"
      onClick={() => setOpen(true)}
    />
  );

  let notice = null;
  if (settings.data?.pausedReason)
    notice = (
      <Alert variant="warning">
        <Alert.Title>Automatic Topics processing is paused</Alert.Title>
        <Alert.Description>
          <p className="break-words">{settings.data.pausedReason}</p>
        </Alert.Description>
      </Alert>
    );
  else if (settings.data && !configured)
    notice = (
      <Alert variant="info">
        <Alert.Title>Choose the models Topics runs on</Alert.Title>
        <Alert.Description>
          <p>
            Topics uses your LLM connections for three jobs: facet summaries,
            embeddings, and topic naming. Open Models to set all three.
          </p>
        </Alert.Description>
      </Alert>
    );

  const dialog = (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <Dialog
        title="Topics models"
        size="lg"
        actions={
          canWrite
            ? [{ label: "Save", type: "submit", form: FORM_ID }]
            : undefined
        }
      >
        <Dialog.Body>
          {settings.data && connections.data ? (
            <TopicModelSettingsForm
              projectId={projectId}
              stored={settings.data}
              connections={connections.data.data}
              canWrite={canWrite}
              onSaved={() => setOpen(false)}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              {settings.error || connections.error
                ? "Could not load the model settings or LLM connections."
                : "Loading…"}
            </p>
          )}
        </Dialog.Body>
      </Dialog>
    </DialogPrimitive.Root>
  );

  return { action, dialog, notice };
}

function TopicModelSettingsForm({
  projectId,
  stored,
  connections,
  canWrite,
  onSaved,
}: {
  projectId: string;
  stored: StoredSettings;
  connections: Connection[];
  canWrite: boolean;
  onSaved: () => void;
}) {
  const [slots, setSlots] = useState<Record<TopicsModelSlotName, SlotDraft>>(
    () => ({
      summary: stored.summary ?? { llmApiKeyId: "", model: "" },
      embedding: stored.embedding ?? { llmApiKeyId: "", model: "" },
      naming: stored.naming ?? { llmApiKeyId: "", model: "" },
    }),
  );
  const [dimensions, setDimensions] = useState(
    String(stored.embeddingDimensions),
  );
  const [enabled, setEnabled] = useState(stored.enabled);
  const utils = api.useUtils();
  const save = api.topics.saveModelSettings.useMutation({
    onSuccess: async () => {
      await utils.topics.modelSettings.invalidate({ projectId });
      onSaved();
    },
  });
  const connectionOptions = connections.map((connection) =>
    TOPICS_SUPPORTED_ADAPTERS.includes(connection.adapter)
      ? { value: connection.id, label: connection.provider }
      : {
          value: connection.id,
          label: connection.provider,
          disabled: true as const,
          disabledReason:
            "Topics needs OpenAI, Azure OpenAI, Amazon Bedrock, or Google connections; Anthropic has no embeddings API.",
        },
  );
  const slotValue = (slot: SlotDraft) =>
    slot.llmApiKeyId && slot.model.trim()
      ? { llmApiKeyId: slot.llmApiKeyId, model: slot.model.trim() }
      : null;
  const settings: TopicsModelSettings = {
    summary: slotValue(slots.summary),
    embedding: slotValue(slots.embedding),
    embeddingDimensions: Number(
      dimensions,
    ) as TopicsModelSettings["embeddingDimensions"],
    naming: slotValue(slots.naming),
    enabled,
  };
  const complete = Boolean(
    settings.summary && settings.embedding && settings.naming,
  );
  const updateSlot = (name: TopicsModelSlotName, update: Partial<SlotDraft>) =>
    setSlots((current) => ({
      ...current,
      [name]: { ...current[name], ...update },
    }));

  return (
    <form
      id={FORM_ID}
      className="ph-no-capture flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ projectId, ...settings });
      }}
    >
      <p className="text-muted-foreground text-sm">
        Topics runs on your own LLM connections and needs three models.
        Embeddings require an OpenAI, Azure OpenAI, Amazon Bedrock, or Google
        connection.{" "}
        <TextLink
          path={`/project/${projectId}/settings/llm-connections`}
          value="Manage LLM connections"
        />
      </p>
      {TOPICS_MODEL_SLOTS.map((name) => (
        <fieldset key={name} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">
            {TOPICS_MODEL_SLOT_DETAILS[name].label}
          </legend>
          <p className="text-muted-foreground text-xs">
            {TOPICS_MODEL_SLOT_DETAILS[name].recommendation}
          </p>
          <div className="flex flex-wrap gap-2">
            <div className="w-56 max-w-full">
              <SelectInput
                aria-label={`${TOPICS_MODEL_SLOT_DETAILS[name].label} connection`}
                placeholder="LLM connection"
                emptyMessage="No LLM connections in this project."
                value={slots[name].llmApiKeyId}
                options={connectionOptions}
                disabled={!canWrite}
                onValueChange={(llmApiKeyId) =>
                  updateSlot(name, { llmApiKeyId })
                }
              />
            </div>
            <div className="min-w-56 flex-1">
              <Input
                aria-label={`${TOPICS_MODEL_SLOT_DETAILS[name].label} model`}
                placeholder={MODEL_PLACEHOLDERS[name]}
                value={slots[name].model}
                disabled={!canWrite}
                onChange={(event) =>
                  updateSlot(name, { model: event.target.value })
                }
              />
            </div>
            {name === "embedding" && (
              <div className="w-28">
                <SelectInput
                  aria-label="Embedding dimensions"
                  placeholder="Dimensions"
                  value={dimensions}
                  disabled={!canWrite}
                  onValueChange={setDimensions}
                  options={[256, 512, 1024, 1536].map((value) => ({
                    value: String(value),
                    label: String(value),
                  }))}
                />
              </div>
            )}
          </div>
        </fieldset>
      ))}
      <SwitchInput
        id="topics-automatic-processing"
        description={
          complete
            ? "Summarize new traces automatically. Turning this off skips new traces; saved facets and rules are kept."
            : "Choose all three models to summarize new traces automatically."
        }
        checked={enabled}
        disabled={!canWrite || (!complete && !enabled)}
        onCheckedChange={setEnabled}
      />
      {save.error && (
        <Alert variant="destructive" size="sm">
          <Alert.Description>
            <p className="break-words">{save.error.message}</p>
          </Alert.Description>
        </Alert>
      )}
    </form>
  );
}
