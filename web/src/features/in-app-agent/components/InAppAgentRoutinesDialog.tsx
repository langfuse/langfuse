"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
import { InternalFeatureBadge } from "@/src/features/feature-flags";
import { showErrorToast } from "@/src/features/notifications";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useQueryProject } from "@/src/features/projects";
import { api } from "@/src/utils/api";
import {
  buildInAppAgentRoutineCron,
  InAppAgentRoutinePreset,
  InAppAgentRoutineSkipReason,
} from "@langfuse/shared/in-app-agent";
import { useInAppAiAgent } from "./InAppAiAgentProvider";

const PRESET_OPTIONS = [
  { value: InAppAgentRoutinePreset.DAILY, label: "Daily" },
  { value: InAppAgentRoutinePreset.EVERY_X_HOURS, label: "Every X hours" },
  { value: InAppAgentRoutinePreset.DAILY_HOURS, label: "Every day at hours" },
  { value: InAppAgentRoutinePreset.WEEKDAYS, label: "Weekdays" },
  { value: InAppAgentRoutinePreset.WEEKLY, label: "Weekly" },
  { value: InAppAgentRoutinePreset.MONTHLY, label: "Monthly" },
] as const;

const WEEKDAY_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

type RoutineFormValues = {
  name: string;
  prompt: string;
  preset: (typeof InAppAgentRoutinePreset)[keyof typeof InAppAgentRoutinePreset];
  hour: string;
  minute: string;
  everyHours: string;
  hours: string;
  weekday: string;
  dayOfMonth: string;
  cron: string;
  timezone: string;
  enabled: boolean;
};

type RoutineListItem = {
  id: string;
  name: string;
  prompt: string;
  status: "ACTIVE" | "PAUSED";
  cron: string;
  timezone: string;
  nextRunAt: Date;
  lastSkipReason: string | null;
  lastConversation: {
    id: string;
    title: string | null;
    latestRun: { status: string } | null;
  } | null;
};

function defaultFormValues(): RoutineFormValues {
  return {
    name: "",
    prompt: "",
    preset: InAppAgentRoutinePreset.DAILY,
    hour: "9",
    minute: "0",
    everyHours: "6",
    hours: "9,13,18",
    weekday: "1",
    dayOfMonth: "1",
    cron: "0 9 * * *",
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
    enabled: false,
  };
}

function cronFromPreset(values: RoutineFormValues): string {
  const minute = Number(values.minute);
  const hour = Number(values.hour);

  switch (values.preset) {
    case InAppAgentRoutinePreset.EVERY_X_HOURS:
      return buildInAppAgentRoutineCron({
        minute,
        everyHours: Number(values.everyHours),
      });
    case InAppAgentRoutinePreset.DAILY_HOURS:
      return buildInAppAgentRoutineCron({
        minute,
        hours: values.hours
          .split(",")
          .map((part) => Number(part.trim()))
          .filter((value) => Number.isInteger(value)),
      });
    case InAppAgentRoutinePreset.WEEKDAYS:
      return buildInAppAgentRoutineCron({ hour, minute, weekdays: true });
    case InAppAgentRoutinePreset.WEEKLY:
      return buildInAppAgentRoutineCron({
        hour,
        minute,
        weekday: Number(values.weekday),
      });
    case InAppAgentRoutinePreset.MONTHLY:
      return buildInAppAgentRoutineCron({
        hour,
        minute,
        dayOfMonth: Number(values.dayOfMonth),
      });
    default:
      return buildInAppAgentRoutineCron({ hour, minute });
  }
}

function formatSkipReason(reason: string | null) {
  switch (reason) {
    case InAppAgentRoutineSkipReason.MEMBERSHIP_LOST:
      return "Skipped: no project access";
    case InAppAgentRoutineSkipReason.MODEL_UNCONFIGURED:
      return "Skipped: assistant model unset";
    case InAppAgentRoutineSkipReason.CAPACITY:
      return "Skipped: assistant is at capacity";
    default:
      return null;
  }
}

export function InAppAgentRoutinesControl() {
  const { project } = useQueryProject();
  const projectId = project?.id;

  if (!projectId) {
    return null;
  }

  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <Dialog size="default" title="Routines" closeOnInteractionOutside>
          <Dialog.Body>
            <RoutinesDialogBody projectId={projectId} onClose={closeDialog} />
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => (
        <Tooltip delayDuration={100} disableHoverableContent>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={() => openDialog()}
              aria-label="Routines"
            >
              <CalendarClock className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Routines</TooltipContent>
        </Tooltip>
      )}
    </DialogController>
  );
}

function RoutinesDialogBody({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const capture = usePostHogClientCapture();
  const { selectConversation } = useInAppAiAgent();
  const utils = api.useUtils();
  const [view, setView] = useState<
    { kind: "list" } | { kind: "form"; routineId?: string }
  >({ kind: "list" });
  const routinesQuery = api.inAppAgent.listRoutines.useQuery({ projectId });
  const createRoutine = api.inAppAgent.createRoutine.useMutation({
    onSuccess: async () => {
      await utils.inAppAgent.listRoutines.invalidate();
    },
  });
  const updateRoutine = api.inAppAgent.updateRoutine.useMutation({
    onSuccess: async () => {
      await utils.inAppAgent.listRoutines.invalidate();
    },
  });
  const deleteRoutine = api.inAppAgent.deleteRoutine.useMutation({
    onSuccess: async () => {
      await utils.inAppAgent.listRoutines.invalidate();
    },
  });
  const runRoutineNow = api.inAppAgent.runRoutineNow.useMutation();
  const routines = (routinesQuery.data ?? []) as RoutineListItem[];

  return (
    <div className="flex flex-col gap-3">
      <InternalFeatureBadge />
      {view.kind === "form" ? (
        <RoutineForm
          key={view.routineId ?? "new"}
          initialValue={
            view.routineId
              ? (routines.find((routine) => routine.id === view.routineId) ??
                null)
              : null
          }
          isSaving={createRoutine.isPending || updateRoutine.isPending}
          onBack={() => setView({ kind: "list" })}
          onSave={async (values) => {
            try {
              if (view.routineId) {
                await updateRoutine.mutateAsync({
                  projectId,
                  routineId: view.routineId,
                  name: values.name,
                  prompt: values.prompt,
                  cron: values.cron,
                  timezone: values.timezone,
                  status: values.enabled ? "ACTIVE" : "PAUSED",
                });
              } else {
                await createRoutine.mutateAsync({
                  projectId,
                  name: values.name,
                  prompt: values.prompt,
                  cron: values.cron,
                  timezone: values.timezone,
                  enabled: values.enabled,
                });
                capture("in_app_agent:routine_created", {
                  preset: values.preset,
                });
              }
              setView({ kind: "list" });
            } catch (error) {
              showErrorToast(
                "Couldn't save routine",
                error instanceof Error ? error.message : undefined,
              );
            }
          }}
        />
      ) : (
        <RoutineList
          routines={routines}
          isLoading={routinesQuery.isLoading}
          onCreate={() => setView({ kind: "form" })}
          onEdit={(routineId) => setView({ kind: "form", routineId })}
          onPause={async (routineId, status) => {
            try {
              await updateRoutine.mutateAsync({
                projectId,
                routineId,
                status,
              });
            } catch (error) {
              showErrorToast(
                "Couldn't update routine",
                error instanceof Error ? error.message : undefined,
              );
            }
          }}
          onDelete={async (routineId) => {
            try {
              await deleteRoutine.mutateAsync({ projectId, routineId });
            } catch (error) {
              showErrorToast(
                "Couldn't delete routine",
                error instanceof Error ? error.message : undefined,
              );
            }
          }}
          onRunNow={async (routineId) => {
            try {
              const result = await runRoutineNow.mutateAsync({
                projectId,
                routineId,
              });
              capture("in_app_agent:routine_run_now", {
                skipped: result.status === "skipped",
              });
              if (result.status === "fired") {
                onClose();
                selectConversation(result.conversationId);
                return;
              }
              showErrorToast(
                "Routine did not start",
                formatSkipReason(result.reason) ?? result.reason,
              );
              await utils.inAppAgent.listRoutines.invalidate();
            } catch (error) {
              showErrorToast(
                "Couldn't run routine",
                error instanceof Error ? error.message : undefined,
              );
            }
          }}
          onOpenLatest={(conversationId) => {
            onClose();
            selectConversation(conversationId);
          }}
        />
      )}
    </div>
  );
}

function RoutineList({
  routines,
  isLoading,
  onCreate,
  onEdit,
  onPause,
  onDelete,
  onRunNow,
  onOpenLatest,
}: {
  routines: RoutineListItem[];
  isLoading: boolean;
  onCreate: () => void;
  onEdit: (routineId: string) => void;
  onPause: (routineId: string, status: "ACTIVE" | "PAUSED") => Promise<void>;
  onDelete: (routineId: string) => Promise<void>;
  onRunNow: (routineId: string) => Promise<void>;
  onOpenLatest: (conversationId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Scheduled assistant runs in this project.
        </p>
        <Button type="button" size="sm" onClick={onCreate}>
          New routine
        </Button>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading routines…</p>
      ) : routines.length === 0 ? (
        <p className="text-muted-foreground text-sm">No routines yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {routines.map((routine) => {
            const skip = formatSkipReason(routine.lastSkipReason);
            const outcome =
              skip ??
              (routine.lastConversation?.latestRun
                ? routine.lastConversation.latestRun.status.toLowerCase()
                : "Not run yet");

            return (
              <li
                key={routine.id}
                className="flex flex-col gap-2 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{routine.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {routine.cron} · {routine.timezone}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Next {new Date(routine.nextRunAt).toLocaleString()} ·{" "}
                    {routine.status === "PAUSED" ? "Disabled" : outcome}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onRunNow(routine.id)}
                  >
                    Run now
                  </Button>
                  {routine.lastConversation ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpenLatest(routine.lastConversation!.id)}
                    >
                      Open latest
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onEdit(routine.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onPause(
                        routine.id,
                        routine.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                      )
                    }
                  >
                    {routine.status === "ACTIVE" ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(routine.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RoutineForm({
  initialValue,
  isSaving,
  onBack,
  onSave,
}: {
  initialValue: Pick<
    RoutineListItem,
    "name" | "prompt" | "cron" | "timezone" | "status"
  > | null;
  isSaving: boolean;
  onBack: () => void;
  onSave: (values: RoutineFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<RoutineFormValues>(() => {
    if (!initialValue) {
      return defaultFormValues();
    }

    return {
      ...defaultFormValues(),
      name: initialValue.name,
      prompt: initialValue.prompt,
      cron: initialValue.cron,
      timezone: initialValue.timezone,
      enabled: initialValue.status === "ACTIVE",
    };
  });

  const update = (patch: Partial<RoutineFormValues>) => {
    setValues((current) => {
      const next = { ...current, ...patch };
      if (
        patch.preset ||
        patch.hour ||
        patch.minute ||
        patch.everyHours ||
        patch.hours ||
        patch.weekday ||
        patch.dayOfMonth
      ) {
        next.cron = cronFromPreset(next);
      }
      return next;
    });
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSave(values);
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Name
        <Input
          value={values.name}
          onChange={(event) => update({ name: event.target.value })}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Prompt
        <Textarea
          value={values.prompt}
          onChange={(event) => update({ prompt: event.target.value })}
          required
          rows={5}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Preset
        <SelectInput
          value={values.preset}
          options={[...PRESET_OPTIONS]}
          placeholder="Choose a schedule"
          onValueChange={(preset) => update({ preset })}
        />
      </label>
      {values.preset === InAppAgentRoutinePreset.EVERY_X_HOURS ? (
        <label className="flex flex-col gap-1 text-sm">
          Every hours
          <Input
            type="number"
            min={1}
            max={24}
            value={values.everyHours}
            onChange={(event) => update({ everyHours: event.target.value })}
          />
        </label>
      ) : values.preset === InAppAgentRoutinePreset.DAILY_HOURS ? (
        <label className="flex flex-col gap-1 text-sm">
          Hours
          <Input
            value={values.hours}
            onChange={(event) => update({ hours: event.target.value })}
          />
        </label>
      ) : values.preset === InAppAgentRoutinePreset.WEEKLY ? (
        <label className="flex flex-col gap-1 text-sm">
          Weekday
          <SelectInput
            value={values.weekday}
            options={WEEKDAY_OPTIONS}
            placeholder="Weekday"
            onValueChange={(weekday) => update({ weekday })}
          />
        </label>
      ) : values.preset === InAppAgentRoutinePreset.MONTHLY ? (
        <label className="flex flex-col gap-1 text-sm">
          Day of month
          <Input
            type="number"
            min={1}
            max={28}
            value={values.dayOfMonth}
            onChange={(event) => update({ dayOfMonth: event.target.value })}
          />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Hour
            <Input
              type="number"
              min={0}
              max={23}
              value={values.hour}
              onChange={(event) => update({ hour: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Minute
            <Input
              type="number"
              min={0}
              max={59}
              value={values.minute}
              onChange={(event) => update({ minute: event.target.value })}
            />
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1 text-sm">
        Cron
        <Input
          value={values.cron}
          onChange={(event) => update({ cron: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Timezone
        <Input
          value={values.timezone}
          onChange={(event) => update({ timezone: event.target.value })}
        />
      </label>
      <SwitchInput
        id="routine-enabled"
        description="Enabled"
        checked={values.enabled}
        onCheckedChange={(enabled) => update({ enabled: enabled === true })}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
