import { useRef, useState, type ReactNode } from "react";
import {
  COMMIT_MESSAGE_MAX_LENGTH,
  SKILL_LATEST_LABEL,
} from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/design-system/Input/Input";
import { showSuccessToast } from "@/src/features/notifications";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, getTrpcErrorCode, type RouterOutputs } from "@/src/utils/api";

import { LocalSkillImportSource } from "./LocalSkillImportSource";
import type { ComparedSkill, SkillImportDiscovery } from "./skillImportTypes";
import { compareImportedSkills } from "../utils/compare-imported-skills";

type ImportResult =
  | { status: "success"; version: number }
  | { status: "error"; message: string };

export function ImportSkillsDialog({
  projectId,
  children,
}: {
  projectId: string;
  children: (openDialog: () => void) => ReactNode;
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [discovery, setDiscovery] = useState<
    Pick<SkillImportDiscovery, "source" | "commitMessage"> & {
      skills: ComparedSkill[];
    }
  >();
  const [scanError, setScanError] = useState<string>();
  const [isScanning, setIsScanning] = useState(false);
  const createVersion = api.skills.createVersion.useMutation();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, ImportResult>>({});
  const [isImporting, setIsImporting] = useState(false);
  const inFlight = useRef(false);
  const busy = isScanning || isImporting;
  const skills = discovery?.skills ?? [];
  const searchTerm = search.trim().toLowerCase();
  const visibleSkills = skills.filter((skill) =>
    [skill.name, skill.description, skill.path].some((value) =>
      value.toLowerCase().includes(searchTerm),
    ),
  );
  const selectable = skills.filter(
    (skill) =>
      !skill.error &&
      (!skill.exists || skill.hasChanges) &&
      results[skill.path]?.status !== "success",
  );
  const selectedSkills = selectable.filter((skill) => selected.has(skill.path));
  const visiblePaths = new Set(visibleSkills.map((skill) => skill.path));
  const visibleSelectable = selectable.filter((skill) =>
    visiblePaths.has(skill.path),
  );
  const allVisibleSelected =
    visibleSelectable.length > 0 &&
    visibleSelectable.every((skill) => selected.has(skill.path));

  const reset = () => {
    setDiscovery(undefined);
    setScanError(undefined);
    createVersion.reset();
    setSelected(new Set());
    setResults({});
    setSearch("");
  };

  const scan = async (load: () => Promise<SkillImportDiscovery>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    reset();
    setIsScanning(true);
    try {
      const discovered = await load();
      const names = [
        ...new Set(
          discovered.skills
            .filter((skill) => !skill.error)
            .map((skill) => skill.name),
        ),
      ];
      const existing: RouterOutputs["skills"]["byName"][] = [];
      for (let offset = 0; offset < names.length; offset += 4) {
        const versions = await Promise.all(
          names.slice(offset, offset + 4).map(async (name) => {
            try {
              return await utils.client.skills.byName.query({
                projectId,
                name,
                label: SKILL_LATEST_LABEL,
              });
            } catch (error) {
              if (getTrpcErrorCode(error) === "NOT_FOUND") return undefined;
              throw error;
            }
          }),
        );
        for (const version of versions) {
          if (version) existing.push(version);
        }
      }
      const data = {
        ...discovered,
        skills: await compareImportedSkills(discovered.skills, existing),
      };
      setDiscovery(data);
      setSelected(
        new Set(
          data.skills
            .filter((skill) => !skill.error && !skill.exists)
            .map((skill) => skill.path),
        ),
      );
    } catch (error) {
      setScanError(
        error instanceof Error
          ? error.message
          : "Could not scan this source. Please try again.",
      );
    } finally {
      inFlight.current = false;
      setIsScanning(false);
    }
  };

  const importSelected = async (closeDialog: () => void) => {
    if (inFlight.current || !discovery || !selectedSkills.length) return;
    inFlight.current = true;
    setIsImporting(true);
    const source = discovery;
    let importedCount = 0;
    try {
      for (const skill of selectedSkills) {
        try {
          const version = await createVersion.mutateAsync({
            projectId,
            files: skill.files,
            commitMessage: `${source.commitMessage} (${skill.path})`.slice(
              0,
              COMMIT_MESSAGE_MAX_LENGTH,
            ),
          });
          importedCount += 1;
          setResults((current) => ({
            ...current,
            [skill.path]: { status: "success", version: version.version },
          }));
          setSelected((current) => {
            const next = new Set(current);
            next.delete(skill.path);
            return next;
          });
        } catch (error) {
          // Preserve successful imports so retrying only submits remaining skills.
          setResults((current) => ({
            ...current,
            [skill.path]: {
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Import failed. Please try again.",
            },
          }));
        }
      }
      if (importedCount > 0) {
        capture("skills:import", {
          skillCount: importedCount,
          source: source.source,
        });
        utils.skills.invalidate();
        showSuccessToast({
          title: `Imported ${importedCount} ${importedCount === 1 ? "skill" : "skills"}`,
          description: "The imported copies are available in your skills list.",
        });
      }
    } finally {
      inFlight.current = false;
      setIsImporting(false);
    }
    if (importedCount === selectedSkills.length) closeDialog();
  };

  return (
    <DialogController
      onBeforeClose={() => !inFlight.current}
      renderDialog={({ closeDialog }) => (
        <Dialog
          title="Import skills"
          actions={
            discovery
              ? [
                  {
                    label: `Import ${selectedSkills.length} ${selectedSkills.length === 1 ? "skill" : "skills"}`,
                    loading: isImporting,
                    disabled: busy || selectedSkills.length === 0,
                    onClick: () => importSelected(closeDialog),
                  },
                ]
              : undefined
          }
        >
          <Dialog.Body>
            <LocalSkillImportSource busy={busy} onScan={scan} onReset={reset} />
            {scanError ? (
              <p role="alert" className="ph-no-capture text-destructive">
                {scanError}
              </p>
            ) : null}
            {discovery && skills.length === 0 ? (
              <p role="status" className="text-muted-foreground">
                No SKILL.md files found in this source.
              </p>
            ) : null}
            {discovery && skills.length > 0 ? (
              <>
                <div className="ph-no-capture">
                  <Input
                    aria-label="Search skills"
                    placeholder="Search skills by name, description, or path"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p role="status">
                    {searchTerm ? `${visibleSkills.length} of ` : ""}
                    {skills.length} {skills.length === 1 ? "skill" : "skills"}{" "}
                    {searchTerm ? "shown" : "found"}
                    {" · "}
                    {selectedSkills.length} selected
                  </p>
                  <Button
                    text={`${allVisibleSelected ? "Deselect all" : "Select all"}${searchTerm ? " shown" : ""}`}
                    variant="ghost"
                    size="sm"
                    disabled={busy || visibleSelectable.length === 0}
                    onClick={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        for (const skill of visibleSelectable) {
                          if (allVisibleSelected) next.delete(skill.path);
                          else next.add(skill.path);
                        }
                        return next;
                      })
                    }
                  />
                </div>
                {visibleSkills.length === 0 ? (
                  <p role="status" className="text-muted-foreground">
                    No skills match your search.
                  </p>
                ) : null}
                <ul className="ph-no-capture flex flex-col divide-y rounded-md border">
                  {visibleSkills.map((skill, index) => {
                    const result = results[skill.path];
                    const error =
                      skill.error ||
                      (result?.status === "error" ? result.message : null);
                    const imported = result?.status === "success";
                    const existingStatus = skill.hasChanges
                      ? "New version"
                      : "Already up to date";
                    return (
                      <li
                        key={skill.path}
                        className="flex items-start gap-3 p-3"
                      >
                        <div className="pt-0.5">
                          <Checkbox
                            id={`import-skill-${index}`}
                            checked={selected.has(skill.path)}
                            disabled={
                              busy ||
                              Boolean(skill.error) ||
                              imported ||
                              (skill.exists && !skill.hasChanges)
                            }
                            onCheckedChange={(checked) =>
                              setSelected((current) => {
                                const next = new Set(current);
                                if (checked === true) next.add(skill.path);
                                else next.delete(skill.path);
                                return next;
                              })
                            }
                          />
                        </div>
                        <label
                          htmlFor={`import-skill-${index}`}
                          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-bold break-words">
                              {skill.name}
                            </span>
                            {!skill.error ? (
                              <Badge
                                text={skill.exists ? existingStatus : "Import"}
                                color={
                                  skill.exists && !skill.hasChanges
                                    ? "yellow"
                                    : "blue"
                                }
                                size="sm"
                              />
                            ) : null}
                            {!skill.error ? (
                              <Badge
                                text={`${skill.files.length} ${skill.files.length === 1 ? "file" : "files"}`}
                                color="primary"
                                size="sm"
                              />
                            ) : null}
                          </span>
                          {skill.exists && !skill.error ? (
                            <span className="text-muted-foreground text-xs">
                              {skill.hasChanges
                                ? "Files differ from the latest saved version. Import to create a new version."
                                : "Files match the latest saved version."}
                            </span>
                          ) : null}
                          <span className="text-muted-foreground text-xs break-all">
                            {skill.path}
                          </span>
                          {skill.description ? (
                            <span className="text-muted-foreground text-sm break-words">
                              {skill.description}
                            </span>
                          ) : null}
                          {error ? (
                            <span
                              className="text-destructive text-sm"
                              role="alert"
                            >
                              {error}
                            </span>
                          ) : null}
                          {result?.status === "success" ? (
                            <span className="text-sm" role="status">
                              Imported as v{result.version}
                            </span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-muted-foreground text-xs">
                  Skills with an existing name will get a new version.
                  Production labels stay unchanged.
                </p>
              </>
            ) : null}
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) =>
        children(() => {
          reset();
          capture("skills:import_open");
          openDialog();
        })
      }
    </DialogController>
  );
}
