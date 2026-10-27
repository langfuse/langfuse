import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { Button } from "@/src/components/design-system/Button/Button";
import { CliSetupAccordion } from "./CliSetupAccordion";
import {
  SkillInstallationOptions,
  type SkillInstallationOptionsProps,
} from "./SkillInstallationOptions";
import { useLangfuseBaseUrl } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { useSkillInstallOptions } from "../hooks/useSkillInstallOptions";

type InstallSkillDialogProps = Pick<
  SkillInstallationOptionsProps,
  "initialValues" | "labels" | "tags"
> & {
  projectId: string;
};

export function InstallSkillDialog({
  projectId,
  labels,
  initialValues,
  ...options
}: InstallSkillDialogProps) {
  const host = useLangfuseBaseUrl();
  const { query: skillOptions, names } = useSkillInstallOptions(
    projectId,
    initialValues.name,
  );

  const handleRetry = () => skillOptions.refetch();

  return (
    <Dialog title="Install in your project" size="lg" closeOnInteractionOutside>
      <Dialog.Body>
        <p className="text-muted-foreground">
          Choose what to install, then let your coding agent handle setup or run
          the command yourself.
        </p>
        <CliSetupAccordion projectId={projectId} host={host} />
        {skillOptions.isPending && (
          <p className="text-muted-foreground">Loading installation options…</p>
        )}
        {!skillOptions.isPending && skillOptions.isError && (
          <div className="flex flex-col items-start gap-2">
            <p role="alert">Could not load installation options.</p>
            <Button
              text="Try again"
              variant="secondary"
              size="sm"
              onClick={handleRetry}
            />
          </div>
        )}
        {!skillOptions.isPending && !skillOptions.isError && (
          <SkillInstallationOptions
            {...options}
            host={host}
            names={names}
            labels={[
              ...new Set([...labels, ...(skillOptions.data?.labels ?? [])]),
            ].sort((a, b) => a.localeCompare(b))}
            initialValues={{
              ...initialValues,
              name: initialValues.name || names[0] || "",
            }}
          />
        )}

        <Accordion type="single" collapsible>
          <Accordion.Item value="updates">
            <Accordion.Trigger size="sm">Updating later</Accordion.Trigger>
            <Accordion.Content>
              <div className="flex min-w-0 flex-col gap-3 py-3">
                <p className="text-muted-foreground">
                  Commit <code>langfuse-skills-lock.json</code> to share your
                  selection. Updates follow labels; pinned versions stay fixed.
                </p>
                <Codeblock
                  language="bash"
                  value="langfuse skills update"
                  variant="read-only"
                />
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
      </Dialog.Body>
    </Dialog>
  );
}
