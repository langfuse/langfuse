import { Button } from "@/src/components/design-system/Button/Button";
import { FeatureReleaseStatus } from "@/src/components/design-system/FeatureReleaseStatus/FeatureReleaseStatus";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";

type TopicsDangerZoneProps = {
  rules: { id: string; name: string }[];
  onDeleteRule: (ruleId: string) => Promise<void>;
  onReset: () => Promise<void>;
  deletingRule?: boolean;
  resetting?: boolean;
  error?: string;
};

/** Internal-only block at the bottom of Topics Settings. */
export function TopicsDangerZone({
  rules,
  onDeleteRule,
  onReset,
  deletingRule = false,
  resetting = false,
  error,
}: TopicsDangerZoneProps) {
  return (
    <section className="border-destructive/40 flex min-w-0 flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3 className="text-destructive text-sm font-bold">Danger zone</h3>
          <FeatureReleaseStatus status="internal" />
        </div>
        <p className="text-muted-foreground text-sm">
          Deletes cannot be undone.
        </p>
      </div>
      <ConfirmationDialogController<{ id: string; name: string }>
        title={(rule) => `Delete scan "${rule.name}"?`}
        text="Deletes the scan, its clustering runs and its topics. Summaries stay, as other scans share them."
        confirmLabel="Delete scan"
        variant="destructive"
        loading={deletingRule}
        error={error}
        onConfirm={(rule) => onDeleteRule(rule.id)}
      >
        {({ openDialog }) => (
          <ul className="flex flex-col divide-y rounded-md border">
            {rules.length === 0 ? (
              <li className="text-muted-foreground px-3 py-2 text-sm">
                No scans.
              </li>
            ) : null}
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm" title={rule.name}>
                  {rule.name}
                </span>
                <Button
                  text="Delete"
                  size="sm"
                  variant="outline"
                  onClick={() => openDialog(rule)}
                />
              </li>
            ))}
          </ul>
        )}
      </ConfirmationDialogController>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">Delete all Topics data</p>
          <p className="text-muted-foreground text-sm">
            Deletes every scan, analysis, clustering run, topic and summary.
            Models and facets stay.
          </p>
        </div>
        <ConfirmationDialogController
          title="Delete all Topics data?"
          text="Every scan, analysis, clustering run, topic and summary of this project is deleted. Summaries disappear within a few seconds."
          confirmationText="delete topics"
          confirmLabel="Delete all"
          variant="destructive"
          loading={resetting}
          error={error}
          onConfirm={onReset}
        >
          {({ openDialog }) => (
            <Button
              text="Delete all"
              size="sm"
              variant="destructive"
              onClick={openDialog}
            />
          )}
        </ConfirmationDialogController>
      </div>
    </section>
  );
}
