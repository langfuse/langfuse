import { type ComponentProps } from "react";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { Button } from "@/src/components/design-system/Button/Button";
import { SkillInstallationOptions } from "./SkillInstallationOptions";
import { api } from "@/src/utils/api";

// Single quotes keep shell metacharacters in host names literal.
function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function InstallSkillDialog({
  projectId,
  host,
  ...options
}: Pick<
  ComponentProps<typeof SkillInstallationOptions>,
  "initialValues" | "labels" | "tags"
> & {
  projectId: string;
  host: string;
}) {
  const skillOptions = api.skills.filterOptions.useQuery({ projectId });
  const names = [
    ...new Set([
      ...(skillOptions.data?.names ?? []),
      ...(options.initialValues.name ? [options.initialValues.name] : []),
    ]),
  ].sort((a, b) => a.localeCompare(b));

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
          <p className="text-muted-foreground">Loading skill names…</p>
        )}
        {!skillOptions.isPending && skillOptions.isError && (
          <div className="flex flex-col items-start gap-2">
            <p role="alert">Could not load skill names.</p>
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
            initialValues={{
              ...options.initialValues,
              name: options.initialValues.name || names[0] || "",
            }}
          />
        )}
      </Dialog.Body>
    </Dialog>
  );
}
