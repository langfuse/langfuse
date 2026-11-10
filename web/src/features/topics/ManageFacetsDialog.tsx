import { useState } from "react";
import { ArrowLeft, Plus } from "@langfuse/icons";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";

export type ManagedFacet = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  version: number;
  isBuiltIn: boolean;
  enabled: boolean;
};

export type FacetDraft = {
  facetId?: string;
  name: string;
  description: string;
  prompt: string;
};

type ManageFacetsDialogProps = {
  facets: ManagedFacet[];
  canWrite: boolean;
  /** Null while the project has no Topics rule to turn facets on for. */
  maxEnabled: number | null;
  onEnabledChange: (facetId: string, enabled: boolean) => Promise<void>;
  onSave: (draft: FacetDraft) => Promise<void>;
};

type View =
  | { kind: "list" }
  | { kind: "edit"; facet: ManagedFacet }
  | { kind: "create"; draft: FacetDraft };

const BLANK_SOURCE = "blank";
const BLANK_PROMPT = `Describe <what this facet captures> for this run.

Format: one sentence, or "<Label>: <detail>" when you define labels below.

- <What to include, and what to leave out.>

Status: not_applicable when <the run has nothing to describe>. insufficient_input when <too much is missing to decide>.

Examples:
- <An example answer.>`;

/** Dialog content; render it from a `DialogController`. */
export function ManageFacetsDialog(props: ManageFacetsDialogProps) {
  const [view, setView] = useState<View>({ kind: "list" });
  const back = () => setView({ kind: "list" });
  const duplicate = (facet: ManagedFacet) =>
    setView({ kind: "create", draft: copyOf(facet, props.facets) });

  if (view.kind === "list")
    return (
      <FacetList
        {...props}
        onOpen={(facet) => setView({ kind: "edit", facet })}
        onCreate={() =>
          setView({
            kind: "create",
            draft: { name: "", description: "", prompt: BLANK_PROMPT },
          })
        }
      />
    );
  return (
    <FacetEditor
      key={view.kind === "edit" ? view.facet.id : "create"}
      facets={props.facets}
      canWrite={props.canWrite}
      facet={view.kind === "edit" ? view.facet : null}
      initial={view.kind === "edit" ? view.facet : view.draft}
      onBack={back}
      onDuplicate={duplicate}
      onSave={async (draft) => {
        await props.onSave(draft);
        back();
      }}
    />
  );
}

function FacetList({
  canWrite,
  facets,
  maxEnabled,
  onCreate,
  onEnabledChange,
  onOpen,
}: ManageFacetsDialogProps & {
  onCreate: () => void;
  onOpen: (facet: ManagedFacet) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enabledCount = facets.filter((facet) => facet.enabled).length;
  const atCap = maxEnabled !== null && enabledCount >= maxEnabled;
  return (
    <Dialog title="Manage facets" size="lg" closeLabel="Close">
      <Dialog.Body>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              A facet is one question Topics answers for every trace. Answers to
              the same facet are clustered into topics.
              {maxEnabled !== null
                ? ` ${enabledCount} of ${maxEnabled} on.`
                : null}
            </p>
            <Button
              text="New facet"
              icon={Plus}
              variant="secondary"
              size="sm"
              disabled={!canWrite}
              onClick={onCreate}
            />
          </div>
          <ul className="divide-y rounded-md border">
            {facets.map((facet) => (
              <li key={facet.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold">
                      {facet.name}
                    </span>
                    {facet.isBuiltIn ? (
                      <Badge text="Built-in" color="filled" size="sm" />
                    ) : (
                      <Badge
                        text={`v${facet.version}`}
                        color="filled"
                        size="sm"
                      />
                    )}
                  </div>
                  {facet.description ? (
                    <p className="text-muted-foreground truncate text-xs">
                      {facet.description}
                    </p>
                  ) : null}
                </div>
                {maxEnabled !== null ? (
                  <Switch
                    aria-label={`Turn ${facet.name} on`}
                    checked={facet.enabled}
                    disabled={
                      !canWrite ||
                      pendingId !== null ||
                      (atCap && !facet.enabled) ||
                      (facet.enabled && enabledCount === 1)
                    }
                    onCheckedChange={(checked) => {
                      setPendingId(facet.id);
                      setError(null);
                      onEnabledChange(facet.id, checked)
                        .catch((cause: unknown) =>
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Could not update the facet.",
                          ),
                        )
                        .finally(() => setPendingId(null));
                    }}
                  />
                ) : null}
                <Button
                  text={facet.isBuiltIn || !canWrite ? "View" : "Edit"}
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpen(facet)}
                />
              </li>
            ))}
          </ul>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

function FacetEditor({
  canWrite,
  facet,
  facets,
  initial,
  onBack,
  onDuplicate,
  onSave,
}: {
  canWrite: boolean;
  /** The facet being edited or viewed; null when creating. */
  facet: ManagedFacet | null;
  facets: ManagedFacet[];
  initial: FacetDraft;
  onBack: () => void;
  onDuplicate: (facet: ManagedFacet) => void;
  onSave: (draft: FacetDraft) => Promise<void>;
}) {
  const [source, setSource] = useState(BLANK_SOURCE);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = !canWrite || Boolean(facet?.isBuiltIn);
  const promptChanged = facet !== null && prompt.trim() !== facet.prompt.trim();
  const nameTaken = isNameTaken(name, facets, facet?.id);
  const changed =
    facet === null ||
    promptChanged ||
    name.trim() !== facet.name ||
    description.trim() !== facet.description;
  const valid = name.trim() !== "" && prompt.trim().length >= 10 && !nameTaken;

  const save = () => {
    setSaving(true);
    setError(null);
    onSave({ facetId: facet?.id, name, description, prompt })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Could not save the facet.",
        ),
      )
      .finally(() => setSaving(false));
  };

  const title = facet ? facet.name : "New facet";
  const actions = readOnly
    ? facet && canWrite
      ? [{ label: "Duplicate", onClick: () => onDuplicate(facet) }]
      : []
    : [
        {
          label: !facet
            ? "Create facet"
            : promptChanged
              ? `Save as v${facet.version + 1}`
              : "Save",
          loading: saving,
          disabled: !valid || !changed || saving,
          onClick: save,
        },
      ];

  return (
    <Dialog
      title={title}
      size="lg"
      closeLabel={readOnly ? "Close" : "Cancel"}
      actions={actions}
    >
      <Dialog.Body>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Button
              text="All facets"
              icon={ArrowLeft}
              variant="text"
              size="sm"
              onClick={onBack}
            />
            {facet ? (
              <Badge
                text={facet.isBuiltIn ? "Built-in" : `v${facet.version}`}
                size="sm"
              />
            ) : null}
          </div>
          {!facet ? (
            <FormField label="Start from">
              {({ id }) => (
                <SelectInput
                  id={id}
                  placeholder="Blank"
                  value={source}
                  options={[
                    { value: BLANK_SOURCE, label: "Blank" },
                    ...facets.map((option) => ({
                      value: option.id,
                      label: option.name,
                    })),
                  ]}
                  onValueChange={(value) => {
                    setSource(value);
                    const from = facets.find((option) => option.id === value);
                    const draft = from
                      ? copyOf(from, facets)
                      : { name: "", description: "", prompt: BLANK_PROMPT };
                    setName(draft.name);
                    setDescription(draft.description);
                    setPrompt(draft.prompt);
                  }}
                />
              )}
            </FormField>
          ) : null}
          <FormField label="Name">
            {({ id }) => (
              <div className="flex flex-col gap-1">
                <Input
                  id={id}
                  value={name}
                  maxLength={100}
                  disabled={readOnly}
                  error={nameTaken}
                  aria-invalid={nameTaken}
                  onChange={(event) => setName(event.target.value)}
                />
                {nameTaken ? (
                  <p className="text-destructive text-xs">
                    A facet with this name already exists.
                  </p>
                ) : null}
              </div>
            )}
          </FormField>
          <FormField
            label="Description"
            description="Shown next to the facet's topics. Changing it does not create a new version."
          >
            {({ id, inputDescribedById }) => (
              <Input
                id={id}
                aria-describedby={inputDescribedById}
                value={description}
                maxLength={500}
                disabled={readOnly}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </FormField>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold">Prompt</p>
            <CodeMirrorEditor
              mode="text"
              value={prompt}
              editable={!readOnly}
              lineNumbers={false}
              minHeight={240}
              maxHeight={360}
              onChange={setPrompt}
            />
          </div>
          {promptChanged ? (
            <Alert variant="warning">
              <Alert.Title>
                Saving creates version {facet.version + 1}
              </Alert.Title>
              <Alert.Description>
                New traces are summarized with the new prompt and this facet's
                topics are rebuilt from them. Topics from version{" "}
                {facet.version} are not carried over.
              </Alert.Description>
            </Alert>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

function isNameTaken(name: string, facets: ManagedFacet[], exceptId?: string) {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return false;
  return (
    facets.some(
      (facet) => facet.id !== exceptId && facet.name.toLowerCase() === wanted,
    ) ||
    DEFAULT_TOPIC_FACETS.some((preset) => preset.name.toLowerCase() === wanted)
  );
}

function copyOf(facet: ManagedFacet, facets: ManagedFacet[]): FacetDraft {
  let name = `${facet.name} (copy)`;
  for (let n = 2; isNameTaken(name, facets); n++)
    name = `${facet.name} (copy ${n})`;
  return { name, description: facet.description, prompt: facet.prompt };
}
