import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { Button } from "@/src/components/design-system/Button/Button";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import {
  SkillInstallationOptions,
  type SkillInstallationOptionsProps,
} from "./SkillInstallationOptions";
import { useLangfuseBaseUrl } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { useSkillInstallOptions } from "../hooks/useSkillInstallOptions";
import { shellQuote } from "../utils/shellQuote";

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

  return (
    <Dialog title="Install in your project" size="lg" closeOnInteractionOutside>
      <Dialog.Body>
        <p className="text-muted-foreground">
          Choose what to install, then let your coding agent handle setup or run
          the command yourself.
        </p>
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
              onClick={() => skillOptions.refetch()}
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
          <Accordion.Item value="setup">
            <Accordion.Trigger size="sm">
              First-time CLI setup
            </Accordion.Trigger>
            <Accordion.Content>
              <div className="flex flex-col items-start gap-3 py-3">
                <p className="text-muted-foreground">
                  Requires Node.js 20+. Run in your project directory.
                </p>
                <Codeblock
                  language="bash"
                  value="npm install -g @langfuse/cli@beta"
                  variant="read-only"
                />
                <p className="text-muted-foreground">
                  Replace the placeholders with your project’s API keys. These
                  settings apply to your current terminal session.
                </p>
                <Button
                  text="Get project API keys"
                  href={`/project/${projectId}/settings/api-keys`}
                  variant="secondary"
                  size="sm"
                />
                <div className="ph-no-capture w-full">
                  <Codeblock
                    language="bash"
                    value={`export LANGFUSE_PUBLIC_KEY='pk-lf-...'\nexport LANGFUSE_SECRET_KEY='sk-lf-...'\nexport LANGFUSE_HOST=${shellQuote(host)}`}
                    variant="read-only"
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  If LANGFUSE_BASE_URL is already set, use the same host. The
                  CLI is in beta.
                </p>
              </div>
            </Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="updates">
            <Accordion.Trigger size="sm">Updating later</Accordion.Trigger>
            <Accordion.Content>
              <div className="flex flex-col gap-3 py-3">
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
