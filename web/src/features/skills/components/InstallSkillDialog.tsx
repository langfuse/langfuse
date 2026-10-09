import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { Button } from "@/src/components/design-system/Button/Button";
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
    <Dialog title="Install with CLI" size="lg" closeOnInteractionOutside>
      <Dialog.Body>
        <p>
          Run these commands in your local project directory. Requires Node.js
          20 or later. The Langfuse CLI is in beta.
        </p>
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">1. Install the CLI</h3>
          <Codeblock
            language="bash"
            value="npm install -g @langfuse/cli@1.3.0-beta.0"
          />
        </div>
        <div className="flex flex-col items-start gap-3">
          <h3 className="font-bold">
            2. Configure local environment variables
          </h3>
          <p className="text-muted-foreground">
            Replace the placeholders with this project’s public and secret keys.
            These exports configure the CLI in your current terminal session. If
            you already set <code>LANGFUSE_BASE_URL</code>, update it to the
            same host.
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
            />
          </div>
        </div>
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
      </Dialog.Body>
    </Dialog>
  );
}
