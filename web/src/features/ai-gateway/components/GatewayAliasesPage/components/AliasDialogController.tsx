import { useState } from "react";
import { Plus, Trash2 } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { SortableList } from "@/src/components/design-system/SortableList/SortableList";
import { Combobox } from "@/src/components/ui/Combobox";
import { api, reportNonTrpcError, type RouterOutputs } from "@/src/utils/api";

type GatewayAlias = RouterOutputs["aiGateway"]["listAliases"][number];

export type AliasDialogControllerProps = {
  organizationId: string;
  connections: RouterOutputs["aiGateway"]["listModelConnections"];
  /** Called after a successful save. */
  onSaved: () => void | Promise<void>;
  children: (control: {
    openDialog: (alias: GatewayAlias | null) => void;
  }) => React.ReactNode;
};

type TargetDraft = {
  key: number;
  connectionId: string;
  providerModel: string;
};

type ConnectionForPicker =
  RouterOutputs["aiGateway"]["listModelConnections"][number];

/** Combobox over the connection's catalog, or free text when it is empty. A
 * typed model outside the catalog is added to the options so the trigger
 * shows it. */
function TargetModelPicker({
  target,
  index,
  connections,
  onProviderModelChange,
}: {
  target: TargetDraft;
  index: number;
  connections: ConnectionForPicker[];
  onProviderModelChange: (value: string) => void;
}) {
  const connectionModels =
    connections.find((connection) => connection.id === target.connectionId)
      ?.models ?? [];
  if (connectionModels.length === 0) {
    return (
      <Input
        aria-label={`Target ${index + 1} model`}
        placeholder="Upstream model, e.g. gpt-4.1"
        value={target.providerModel}
        onChange={(event) => onProviderModelChange(event.target.value)}
      />
    );
  }
  return (
    <Combobox
      aria-label={`Target ${index + 1} model`}
      placeholder="Upstream model, e.g. gpt-4.1"
      value={target.providerModel}
      options={
        target.providerModel && !connectionModels.includes(target.providerModel)
          ? [
              { value: target.providerModel, label: target.providerModel },
              ...connectionModels.map((model) => ({
                value: model,
                label: model,
              })),
            ]
          : connectionModels.map((model) => ({
              value: model,
              label: model,
            }))
      }
      onValueChange={onProviderModelChange}
      footer={({ search, close }) =>
        customModelButton(search, close, () => {
          onProviderModelChange(search);
          close();
        })
      }
    />
  );
}

function customModelButton(
  search: string,
  close: () => void,
  onUse: () => void,
) {
  if (!search) {
    return null;
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      text={`Use "${search}"`}
      onClick={onUse}
    />
  );
}

const ALIAS_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const MAX_TARGETS = 10;

function newTarget(key: number): TargetDraft {
  return { key, connectionId: "", providerModel: "" };
}

const CONNECTION_STATUS_LABELS: Record<
  GatewayAlias["targets"][number]["connectionStatus"],
  string
> = {
  ENABLED: "enabled",
  DISABLED: "disabled",
  ERROR: "error",
};

/** The picker lists enabled connections only; a target on a disabled or
 * errored one gets its own option, labelled with the status. */
function buildConnectionOptions(
  connections: ConnectionForPicker[],
  alias: GatewayAlias | null,
) {
  const options = connections.map((connection) => ({
    value: connection.id,
    label: connection.name,
  }));
  for (const target of alias?.targets ?? []) {
    if (!options.some((option) => option.value === target.connectionId)) {
      options.push({
        value: target.connectionId,
        label: `${target.connectionName} (${CONNECTION_STATUS_LABELS[target.connectionStatus]})`,
      });
    }
  }
  return options;
}

/** Trying the same upstream twice adds no fallback. */
function describeDuplicateTarget(targets: TargetDraft[]): string | null {
  for (const [index, target] of targets.entries()) {
    const earlierIndex = targets
      .slice(0, index)
      .findIndex(
        (earlier) =>
          earlier.connectionId !== "" &&
          earlier.connectionId === target.connectionId &&
          earlier.providerModel.trim() !== "" &&
          earlier.providerModel.trim() === target.providerModel.trim(),
      );
    if (earlierIndex !== -1) {
      return `Target ${index + 1} repeats target ${earlierIndex + 1}. Each target needs a different connection or model.`;
    }
  }
  return null;
}

/** Create/edit dialog for a model alias. Target order is the fallback order. */
export function AliasDialogController({
  organizationId,
  connections,
  onSaved,
  children,
}: AliasDialogControllerProps) {
  const upsert = api.aiGateway.upsertAlias.useMutation();
  const [saveError, setSaveError] = useState<string | null>(null);

  return (
    <DialogController<GatewayAlias | null>
      onBeforeClose={() => !upsert.isPending}
      renderDialog={({ state, closeDialog }) => (
        <AliasDialog
          alias={state}
          connections={connections}
          isSaving={upsert.isPending}
          saveError={saveError}
          onSave={(values) => {
            setSaveError(null);
            return upsert
              .mutateAsync({
                orgId: organizationId,
                ...(state?.id ? { id: state.id } : {}),
                name: values.name,
                status: values.status,
                targets: values.targets,
              })
              .then(async () => {
                await onSaved();
                closeDialog();
              })
              .catch((error: unknown) => {
                reportNonTrpcError(error, "ai-gateway-aliases");
                setSaveError(
                  error instanceof Error
                    ? error.message
                    : "Alias could not be saved.",
                );
              });
          }}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          openDialog: (alias) => {
            setSaveError(null);
            openDialog(alias);
          },
        })
      }
    </DialogController>
  );
}

type AliasDialogValues = {
  name: string;
  status: "ENABLED" | "DISABLED";
  targets: { connectionId: string; providerModel: string }[];
};

function AliasDialog({
  alias,
  connections,
  isSaving,
  saveError,
  onSave,
}: {
  alias: GatewayAlias | null;
  connections: RouterOutputs["aiGateway"]["listModelConnections"];
  isSaving: boolean;
  saveError: string | null;
  onSave: (values: AliasDialogValues) => Promise<void>;
}) {
  const [name, setName] = useState(alias?.name ?? "");
  const [targets, setTargets] = useState<TargetDraft[]>(() =>
    alias
      ? alias.targets.map((target, index) => ({
          key: index,
          connectionId: target.connectionId,
          providerModel: target.providerModel,
        }))
      : [newTarget(0)],
  );
  const [nextTargetKey, setNextTargetKey] = useState(
    alias?.targets.length ?? 1,
  );

  const nameError = name.trim() !== "" && !ALIAS_NAME_PATTERN.test(name.trim());
  const targetsValid =
    targets.length > 0 &&
    targets.every(
      (target) =>
        target.connectionId !== "" && target.providerModel.trim().length > 0,
    );
  const duplicateTargetMessage = describeDuplicateTarget(targets);
  const canSave =
    !nameError &&
    name.trim().length > 0 &&
    targetsValid &&
    !duplicateTargetMessage;

  const connectionOptions = buildConnectionOptions(connections, alias);

  const updateTarget = (index: number, patch: Partial<TargetDraft>) => {
    setTargets((previous) =>
      previous.map((target, targetIndex) =>
        targetIndex === index ? { ...target, ...patch } : target,
      ),
    );
  };

  const handleSave = async () => {
    await onSave({
      name: name.trim(),
      // Status belongs to the table's toggle; an edit keeps it.
      status: alias?.status ?? "ENABLED",
      targets: targets.map((target) => ({
        connectionId: target.connectionId,
        providerModel: target.providerModel.trim(),
      })),
    });
  };

  return (
    <Dialog
      title={alias ? "Edit model alias" : "New model alias"}
      requireExplicitClose={isSaving}
      actions={[
        {
          label: "Save alias",
          loading: isSaving,
          disabled: !canSave || isSaving,
          onClick: handleSave,
        },
      ]}
    >
      <Dialog.Body>
        <div className="flex flex-col gap-2">
          <label htmlFor="alias-name" className="text-sm font-bold">
            Name
          </label>
          <Input
            id="alias-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. gpt-fast"
            maxLength={128}
            error={nameError}
            aria-invalid={nameError}
          />
          <p className="text-muted-foreground text-xs">
            Letters, digits, dots, underscores and hyphens. Clients use this
            name as the model name.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Targets</span>
            <Button
              variant="secondary"
              size="sm"
              text="Add target"
              icon={Plus}
              onClick={() => {
                setTargets((previous) => [
                  ...previous,
                  newTarget(nextTargetKey),
                ]);
                setNextTargetKey((key) => key + 1);
              }}
              disabled={targets.length >= MAX_TARGETS}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Tried in order; the first available target serves the request.
          </p>
          <SortableList
            items={targets}
            getId={(target) => String(target.key)}
            getLabel={(target) => target.providerModel || "target"}
            disabled={isSaving}
            onReorder={(fromIndex, toIndex) => {
              setTargets((previous) => {
                const next = [...previous];
                const [moved] = next.splice(fromIndex, 1);
                next.splice(toIndex, 0, moved!);
                return next;
              });
            }}
            aria-label="Alias targets"
            renderItem={(target, index) => (
              <div className="flex items-start gap-2">
                <div className="w-56 shrink-0">
                  <SelectInput
                    aria-label={`Target ${index + 1} connection`}
                    placeholder="Select connection"
                    value={target.connectionId}
                    options={connectionOptions}
                    onValueChange={(value) => {
                      if (value === target.connectionId) {
                        return;
                      }
                      const connectionModels =
                        connections.find(
                          (connection) => connection.id === value,
                        )?.models ?? [];
                      updateTarget(index, {
                        connectionId: value,
                        // A new connection clears the model, or fills it
                        // when its catalog has exactly one.
                        providerModel:
                          connectionModels.length === 1
                            ? connectionModels[0]
                            : "",
                      });
                    }}
                    search={{ placeholder: "Search connections" }}
                  />
                </div>
                <TargetModelPicker
                  target={target}
                  index={index}
                  connections={connections}
                  onProviderModelChange={(value) =>
                    updateTarget(index, { providerModel: value })
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  text="Remove"
                  aria-label={`Remove target ${index + 1}`}
                  onClick={() =>
                    setTargets((previous) =>
                      previous.filter((_, i) => i !== index),
                    )
                  }
                  disabled={targets.length <= 1}
                />
              </div>
            )}
          />
        </div>
        {duplicateTargetMessage ? (
          <p className="text-destructive text-xs">{duplicateTargetMessage}</p>
        ) : null}
        {saveError ? (
          <Alert variant="destructive">
            <Alert.Title>Alias could not be saved</Alert.Title>
            <Alert.Description>{saveError}</Alert.Description>
          </Alert>
        ) : null}
      </Dialog.Body>
    </Dialog>
  );
}
