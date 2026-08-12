// CIP fork feature (see FORK.md): the three-panel elicitation builder —
// left: pages, center: live canvas, right: per-question settings. Draft edits
// autosave (debounced) through `updateDraft` with optimistic-concurrency
// version checks; Publish snapshots the draft for the public form.
import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { AlertTriangle, Eye, Inbox, Lock, Pencil, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { BuilderCanvas } from "../components/builder/BuilderCanvas";
import { BuilderLeftPanel } from "../components/builder/BuilderLeftPanel";
import { BuilderRightPanel } from "../components/builder/BuilderRightPanel";
import {
  builderReducer,
  type BuilderState,
} from "../components/builder/builder-state";
import { PreviewDialog } from "../components/builder/PreviewDialog";
import { ShareButton } from "../components/builder/ShareButton";
import { ElicitationStatusBadge } from "../components/ElicitationStatusBadge";

const AUTOSAVE_DEBOUNCE_MS = 800;

const INITIAL_STATE: BuilderState = {
  fields: [],
  settings: {},
  selectedId: null,
  version: 0,
  revision: 0,
  saveState: "saved",
};

function SaveIndicator({
  saveState,
}: {
  saveState: BuilderState["saveState"];
}) {
  if (saveState === "conflict") {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />
        Edited elsewhere — reload
      </span>
    );
  }
  if (saveState === "error") {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />
        Save failed — retrying
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {saveState === "saved" ? "Saved" : "Saving…"}
    </span>
  );
}

function RenameControl({
  projectId,
  elicitationId,
  name,
}: {
  projectId: string;
  elicitationId: string;
  name: string;
}) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const rename = api.elicitations.updateName.useMutation({
    onSuccess: () => utils.elicitations.invalidate(),
  });

  const submit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      rename.mutate({ projectId, elicitationId, name: trimmed });
    }
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(name);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Pencil className="h-3.5 w-3.5" />
          <span className="sr-only">Rename elicitation</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="h-8"
          />
          <Button type="submit" size="sm" disabled={rename.isPending}>
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export default function ElicitationBuilder() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const elicitationId = router.query.elicitationId as string;

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "elicitations:read",
  });
  const hasCudAccess = useHasProjectAccess({
    projectId,
    scope: "elicitations:CUD",
  });

  const utils = api.useUtils();
  const elicitation = api.elicitations.byId.useQuery(
    { projectId, elicitationId },
    { enabled: !!projectId && !!elicitationId && hasReadAccess },
  );

  const [state, dispatch] = useReducer(builderReducer, INITIAL_STATE);
  const [previewOpen, setPreviewOpen] = useState(false);
  const initializedFor = useRef<string | null>(null);

  // Initialize the reducer once per elicitation load (not on refetches, which
  // would clobber unsaved local edits).
  useEffect(() => {
    if (elicitation.data && initializedFor.current !== elicitation.data.id) {
      initializedFor.current = elicitation.data.id;
      dispatch({
        type: "init",
        fields: elicitation.data.draftFields,
        settings: elicitation.data.settings,
        version: elicitation.data.version,
      });
    }
  }, [elicitation.data]);

  const updateDraft = api.elicitations.updateDraft.useMutation({
    onSuccess: ({ version }) => dispatch({ type: "saveSucceeded", version }),
    onError: (error) =>
      dispatch({
        type: "saveFailed",
        conflict: error.data?.code === "CONFLICT",
      }),
  });

  // Debounced autosave. Runs while there are unsaved edits ("dirty") or a
  // transient failure to retry ("error"); a successful save bumps `version`,
  // which re-runs the effect and flushes any edits made while in flight.
  const latest = useRef({ state, updateDraft });
  latest.current = { state, updateDraft };
  useEffect(() => {
    if (state.saveState !== "dirty" && state.saveState !== "error") return;
    const delay = state.saveState === "error" ? 5000 : AUTOSAVE_DEBOUNCE_MS;
    const timeout = setTimeout(() => {
      const { state: s, updateDraft: mutation } = latest.current;
      if (mutation.isPending) return; // version bump on settle re-arms us
      dispatch({ type: "saveStarted" });
      mutation.mutate({
        projectId,
        elicitationId,
        draftFields: s.fields,
        settings: s.settings,
        version: s.version,
      });
    }, delay);
    return () => clearTimeout(timeout);
  }, [
    state.revision,
    state.saveState,
    state.version,
    projectId,
    elicitationId,
  ]);

  const publish = api.elicitations.publish.useMutation({
    onSuccess: () => utils.elicitations.invalidate(),
  });
  const close = api.elicitations.close.useMutation({
    onSuccess: () => utils.elicitations.invalidate(),
  });
  const reopen = api.elicitations.reopen.useMutation({
    onSuccess: () => utils.elicitations.invalidate(),
  });

  const selectedField = useMemo(
    () => state.fields.find((f) => f.id === state.selectedId),
    [state.fields, state.selectedId],
  );

  if (!hasReadAccess) return <SupportOrUpgradePage />;
  if (elicitation.isError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {elicitation.error.message}
      </div>
    );
  }

  const status = elicitation.data?.status ?? "draft";

  return (
    <Page
      headerProps={{
        title: elicitation.data?.name ?? "…",
        breadcrumb: [
          {
            name: "Elicitations",
            href: `/project/${projectId}/elicitations`,
          },
        ],
        titleBadges: (
          <span className="flex items-center gap-2">
            <ElicitationStatusBadge status={status} />
            {hasCudAccess && elicitation.data && (
              <RenameControl
                projectId={projectId}
                elicitationId={elicitationId}
                name={elicitation.data.name}
              />
            )}
          </span>
        ),
        actionButtonsRight: (
          <div className="flex items-center gap-2">
            <SaveIndicator saveState={state.saveState} />
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/project/${projectId}/elicitations/${elicitationId}/submissions`}
              >
                <Inbox className="mr-1 h-4 w-4" />
                Submissions
                {elicitation.data
                  ? ` (${elicitation.data.submissionCount})`
                  : ""}
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="mr-1 h-4 w-4" />
              Preview
            </Button>
            <ShareButton
              elicitationId={elicitationId}
              status={status}
              onPublish={() => publish.mutate({ projectId, elicitationId })}
              publishPending={publish.isPending}
            />
            {hasCudAccess && status === "open" && (
              <Button
                variant="outline"
                size="sm"
                disabled={close.isPending}
                onClick={() => close.mutate({ projectId, elicitationId })}
              >
                <Lock className="mr-1 h-4 w-4" />
                Close
              </Button>
            )}
            {hasCudAccess && status === "closed" && (
              <Button
                variant="outline"
                size="sm"
                disabled={reopen.isPending}
                onClick={() => reopen.mutate({ projectId, elicitationId })}
              >
                <Play className="mr-1 h-4 w-4" />
                Reopen
              </Button>
            )}
            {hasCudAccess && (
              <Button
                size="sm"
                disabled={
                  publish.isPending ||
                  (status !== "draft" &&
                    !elicitation.data?.hasUnpublishedChanges &&
                    state.saveState === "saved")
                }
                onClick={() => publish.mutate({ projectId, elicitationId })}
              >
                {status === "draft" ? "Publish" : "Publish changes"}
              </Button>
            )}
          </div>
        ),
      }}
    >
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={20} minSize={14} maxSize={30}>
          <BuilderLeftPanel
            fields={state.fields}
            selectedId={state.selectedId}
            dispatch={dispatch}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={55} minSize={35}>
          <BuilderCanvas field={selectedField} dispatch={dispatch} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={25} minSize={18} maxSize={35}>
          <BuilderRightPanel field={selectedField} dispatch={dispatch} />
        </ResizablePanel>
      </ResizablePanelGroup>
      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        fields={state.fields}
        settings={state.settings}
      />
    </Page>
  );
}
