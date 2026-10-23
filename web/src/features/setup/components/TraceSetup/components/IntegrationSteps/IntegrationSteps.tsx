"use client";

import { useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { CopyButton } from "@/src/components/design-system/CopyButton/CopyButton";
import { Input } from "@/src/components/design-system/Input/Input";
import type { Integration } from "../../../../integrations/types";
import { buildAgentPrompt } from "../../agentPrompt";
import { agentInstallOf } from "../../codingAgents";
import type { CopyChecks, ProjectKeys, SetupTarget } from "../../types";
import { EnvStep } from "../EnvStep/EnvStep";
import { NumberedStep } from "../NumberedStep/NumberedStep";

/** The copy button's text, by what an install block holds. */
const COPY_TEXT = { command: "Copy command", config: "Copy config" } as const;

/** The name a new project starts with, by what it's for. */
const NEW_PROJECT_NAME = {
  agent: "Coding agents",
  app: "My app",
} as const;

type IntegrationStepsProps = {
  integration: Integration;
  target: SetupTarget;
  /** This project's keys. */
  keys: ProjectKeys;
  baseUrl: string;
  /** Where this project manages its keys. */
  manageKeysPath: string;
  onCreateKeys: () => void;
  /** The steps checked off so far. */
  copied: CopyChecks;
  /** Runs after the .env (`env`), or the prompt or an install command (`setup`), was copied. */
  onCopy: (part: keyof CopyChecks) => void;
  /** Keys that land in front of you fade in. */
  shouldAnimate: boolean;
};

/** Names the new project and creates it with its keys. */
function NewProjectStep({
  defaultName,
  isCreating,
  canCreateProject,
  onCreateProject,
}: {
  defaultName: string;
  isCreating: boolean;
  canCreateProject: boolean;
  onCreateProject: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  return (
    <>
      <h3 className="text-sm font-bold">Create a project for it</h3>
      <p className="text-muted-foreground text-sm">
        Its traces stay apart from this project&apos;s, with keys of their own.
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() !== "") onCreateProject(name.trim());
        }}
      >
        <div className="min-w-0 flex-[1_1_12rem]">
          <Input
            aria-label="Project name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canCreateProject || isCreating}
            required
          />
        </div>
        <Button
          type="submit"
          text="Create project and keys"
          size="sm"
          disabled={!canCreateProject}
          loading={isCreating}
        />
      </form>
      {canCreateProject ? null : (
        <p className="text-muted-foreground text-xs">
          Creating projects needs an organization owner or admin.
        </p>
      )}
    </>
  );
}

/** Step 1: this project's keys, or a new project to create, then its keys. */
function KeysStep({
  integration,
  target,
  keys,
  baseUrl,
  manageKeysPath,
  onCreateKeys,
  onCopyEnv,
  shouldAnimate,
}: Pick<
  IntegrationStepsProps,
  | "integration"
  | "target"
  | "keys"
  | "baseUrl"
  | "manageKeysPath"
  | "onCreateKeys"
  | "shouldAnimate"
> & { onCopyEnv: () => void }) {
  const isAgent = integration.category === "developer-tools";
  if (target.project === "new" && target.newProject.status === "ready")
    return (
      <EnvStep
        target={{
          kind: "newProject",
          name: target.newProject.name,
          href: target.newProject.href,
        }}
        keys={{ status: "ready", keys: target.newProject.keys }}
        baseUrl={baseUrl}
        manageKeysPath={`${target.newProject.href}/settings/api-keys`}
        onCreateKeys={onCreateKeys}
        onCopyEnv={onCopyEnv}
        shouldAnimate={shouldAnimate}
      />
    );
  if (target.project === "new")
    return (
      <NewProjectStep
        defaultName={NEW_PROJECT_NAME[isAgent ? "agent" : "app"]}
        isCreating={target.newProject.status === "creating"}
        canCreateProject={target.canCreateProject}
        onCreateProject={target.onCreateProject}
      />
    );
  return (
    <EnvStep
      target={{ kind: isAgent ? "agent" : "app" }}
      keys={keys}
      baseUrl={baseUrl}
      manageKeysPath={manageKeysPath}
      onCreateKeys={onCreateKeys}
      onCopyEnv={onCopyEnv}
      shouldAnimate={shouldAnimate}
    />
  );
}

function landsInText(target: SetupTarget) {
  if (target.project === "this") return null;
  if (target.newProject.status === "ready")
    return ` Its traces land in ${target.newProject.name}.`;
  return " Its traces land in the new project.";
}

/** Step 2 for a coding agent: its plugin's setup, block by block, and its guide; without a hand-written setup, the guide alone. */
function AgentInstallStep({
  integration,
  onCopy,
}: {
  integration: Integration;
  onCopy: () => void;
}) {
  const install = agentInstallOf(integration.slug);
  const guide = (
    <Button
      text={`${integration.name} guide`}
      variant="text"
      size="sm"
      href={integration.href}
    />
  );
  if (install === null)
    return (
      <>
        <h3 className="text-sm font-bold">Install the plugin</h3>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
          Its guide has the install and where the keys go:
          {guide}
        </p>
      </>
    );
  return (
    <>
      {install.blocks.map((block, index) => (
        <CodeSection
          key={block.title}
          title={block.title}
          content={block.code}
          copyButton={{
            text: COPY_TEXT[block.kind],
            variant: index === 0 ? "primary" : "secondary",
          }}
          onCopy={onCopy}
        />
      ))}
      {install.note === null ? null : (
        <p className="text-muted-foreground text-xs">{install.note}</p>
      )}
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
        Its guide has every step and where the keys go:
        {guide}
      </p>
    </>
  );
}

/** Step 2 for an app: the one prompt, pointed at this integration's guide, with the guide beside it. */
function AppPromptStep({
  integration,
  target,
  baseUrl,
  onCopy,
}: {
  integration: Integration;
  target: SetupTarget;
  baseUrl: string;
  onCopy: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Hand it to your coding agent</h3>
        <div className="flex items-center gap-1">
          <Button
            text={`${integration.name} guide`}
            variant="ghost"
            size="sm"
            href={integration.href}
          />
          <CopyButton
            text="Copy prompt"
            variant="primary"
            size="sm"
            value={buildAgentPrompt({ baseUrl, integration })}
            onCopy={onCopy}
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        The prompt has your agent follow the {integration.name} guide.
        {landsInText(target)}
      </p>
    </>
  );
}

/**
 * One integration's setup in two steps: the keys, then the one prompt for a coding agent with the integration's guide
 * beside it. A coding agent's own setup is its plugin's install instead; for a new project, step 1 creates it first.
 * Each step checks off once it's copied.
 */
export function IntegrationSteps({
  integration,
  target,
  copied,
  onCopy,
  ...keys
}: IntegrationStepsProps) {
  const copySetup = () => onCopy("setup");
  return (
    <ol className="flex flex-col">
      <NumberedStep number={1} isDone={copied.env}>
        <KeysStep
          integration={integration}
          target={target}
          {...keys}
          onCopyEnv={() => onCopy("env")}
        />
      </NumberedStep>
      <NumberedStep number={2} isDone={copied.setup}>
        {integration.category === "developer-tools" ? (
          <AgentInstallStep integration={integration} onCopy={copySetup} />
        ) : (
          <AppPromptStep
            integration={integration}
            target={target}
            baseUrl={keys.baseUrl}
            onCopy={copySetup}
          />
        )}
      </NumberedStep>
    </ol>
  );
}
