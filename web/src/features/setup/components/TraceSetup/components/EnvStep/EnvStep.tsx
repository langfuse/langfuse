"use client";

import { useId, useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { CopyButton } from "@/src/components/design-system/CopyButton/CopyButton";
import { CopyList } from "@/src/components/design-system/CopyList/CopyList";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Skeleton } from "@/src/components/ui/skeleton";
import { getLangfuseEnvCode } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { cn } from "@/src/utils/tailwind";
import motion from "../../motion.module.css";
import type { ApiKeys, ProjectKeys } from "../../types";

/** The row that only Langfuse shows once; copying it is what puts the keys in `.env`. */
const SECRET_LABEL = "LANGFUSE_SECRET_KEY";

/** Whose keys these are: an app's or a coding agent's in this project, or a new project's, named under them. */
type EnvTarget =
  | { kind: "app" }
  | { kind: "agent" }
  | { kind: "newProject"; name: string; href: string };

type EnvStepProps = {
  target: EnvTarget;
  keys: ProjectKeys;
  baseUrl: string;
  /** Where the keys' project manages them. */
  manageKeysPath: string;
  /** Creates the keys when picking a way didn't, e.g. after a failed first try. */
  onCreateKeys: () => void;
  /** Runs after the .env, or the secret key alone, was copied. */
  onCopyEnv: () => void;
  /** Keys that land in front of you fade into the rows that waited for them. */
  shouldAnimate: boolean;
};

function Title({ target, id }: { target: EnvTarget; id: string }) {
  switch (target.kind) {
    case "app":
      return (
        <h3 id={id} className="text-sm font-bold">
          Put your keys in <code className="font-mono">.env</code>
        </h3>
      );
    case "agent":
      return (
        <h3 id={id} className="text-sm font-bold">
          Your keys, for the plugin
        </h3>
      );
    case "newProject":
      return (
        <h3 id={id} className="text-sm font-bold">
          Put the new project&apos;s keys in{" "}
          <code className="font-mono">.env</code>
        </h3>
      );
  }
}

/** Beside the title: show and copy once the keys exist, their progress while they're made, or the way to make them. */
function KeysActions({
  keys,
  baseUrl,
  isSecretShown,
  onToggleSecret,
  onCreateKeys,
  onCopyEnv,
}: Pick<EnvStepProps, "baseUrl" | "onCreateKeys" | "onCopyEnv"> & {
  keys: Exclude<ProjectKeys, { status: "noAccess" }>;
  isSecretShown: boolean;
  onToggleSecret: () => void;
}) {
  switch (keys.status) {
    case "ready":
      return (
        <div className="flex items-center gap-1">
          <Button
            text={isSecretShown ? "Hide secret" : "Show secret"}
            variant="ghost"
            size="sm"
            onClick={onToggleSecret}
          />
          <CopyButton
            text="Copy .env"
            variant="secondary"
            size="sm"
            value={getLangfuseEnvCode(baseUrl, keys.keys)}
            onCopy={onCopyEnv}
          />
        </div>
      );
    case "creating":
      return (
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Spinner size="xs" variant="muted" />
          Creating your keys
        </span>
      );
    case "none":
      return (
        <Button
          text="Create API keys"
          variant="secondary"
          size="sm"
          onClick={onCreateKeys}
        />
      );
  }
}

/**
 * The rows before there are keys, laid out like the list that replaces them: the base URL is known, the keys wait
 * as bars while they're made, or show their prefixes for keys you bring.
 */
function PendingRows({
  baseUrl,
  isWaiting,
}: {
  baseUrl: string;
  isWaiting: boolean;
}) {
  const rows = [
    {
      label: SECRET_LABEL,
      value: isWaiting ? null : "sk-lf-…",
      isKnown: false,
    },
    {
      label: "LANGFUSE_PUBLIC_KEY",
      value: isWaiting ? null : "pk-lf-…",
      isKnown: false,
    },
    { label: "LANGFUSE_BASE_URL", value: baseUrl, isKnown: true },
  ];
  return (
    <div
      aria-hidden="true"
      className="bg-surface-section @container grid gap-px rounded-md p-1 font-mono text-xs"
    >
      {rows.map(({ label, value, isKnown }) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-sm py-0.5 pr-0.5 pl-2 @md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
        >
          <span
            className="text-foreground-secondary col-span-full truncate @md:col-span-1"
            title={label}
          >
            {label}
          </span>
          {value === null ? (
            <Skeleton
              variant="contrast"
              className="h-3 w-full max-w-72 motion-reduce:animate-none"
            />
          ) : (
            <span
              className={cn(
                "truncate",
                isKnown ? "text-foreground" : "text-foreground-secondary",
              )}
              title={value}
            >
              {value}
            </span>
          )}
          <span className="size-6" />
        </div>
      ))}
    </div>
  );
}

const maskSecret = (secret: string) =>
  `${secret.slice(0, 10)}••••••••${secret.slice(-4)}`;

/** The keys once they exist: a copy on each row, the secret masked until asked for. */
function ReadyKeys({
  keys,
  baseUrl,
  manageKeysPath,
  titleId,
  isSecretShown,
  onCopyEnv,
  shouldAnimate,
}: Pick<
  EnvStepProps,
  "baseUrl" | "manageKeysPath" | "onCopyEnv" | "shouldAnimate"
> & {
  keys: ApiKeys;
  titleId: string;
  isSecretShown: boolean;
}) {
  return (
    <>
      <div className={cn(shouldAnimate && motion.fadeIn)}>
        <CopyList
          labelledBy={titleId}
          onCopy={(label) => {
            if (label === SECRET_LABEL) onCopyEnv();
          }}
          items={[
            {
              label: SECRET_LABEL,
              value: keys.secretKey,
              displayValue: isSecretShown
                ? undefined
                : maskSecret(keys.secretKey),
            },
            { label: "LANGFUSE_PUBLIC_KEY", value: keys.publicKey },
            { label: "LANGFUSE_BASE_URL", value: baseUrl },
          ]}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Langfuse shows the secret key only now, so copy it before you leave. You
        can make new keys any time in{" "}
        <TextLink path={manageKeysPath} value="Manage keys" />.
      </p>
    </>
  );
}

/** Under the title: the keys, or their rows waiting in place, and who can make them when you can't. */
function KeysBody({
  keys,
  ...props
}: Pick<
  EnvStepProps,
  "keys" | "baseUrl" | "manageKeysPath" | "onCopyEnv" | "shouldAnimate"
> & { titleId: string; isSecretShown: boolean }) {
  switch (keys.status) {
    case "ready":
      return <ReadyKeys keys={keys.keys} {...props} />;
    case "creating":
    case "none":
      return <PendingRows baseUrl={props.baseUrl} isWaiting />;
    case "noAccess":
      return (
        <>
          <PendingRows baseUrl={props.baseUrl} isWaiting={false} />
          <p className="text-muted-foreground text-xs">
            Creating keys needs a role that manages API keys. Ask a project
            owner or admin, or use keys you already have from{" "}
            <TextLink path={props.manageKeysPath} value="Manage keys" />.
          </p>
        </>
      );
  }
}

/**
 * The first step of every setup: the keys and base URL for `.env`, a copy on each row and one for the whole file.
 * Until the keys exist their rows wait in place, so nothing moves when they land; without the role to make them, it
 * says who can.
 */
export function EnvStep(props: EnvStepProps) {
  const { target, keys } = props;
  const [isSecretShown, setIsSecretShown] = useState(false);
  const titleId = useId();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Title target={target} id={titleId} />
        {keys.status === "noAccess" ? null : (
          <KeysActions
            {...props}
            keys={keys}
            isSecretShown={isSecretShown}
            onToggleSecret={() => setIsSecretShown((shown) => !shown)}
          />
        )}
      </div>
      <p role="status" className="sr-only">
        {keys.status === "creating" ? "Creating your API keys" : ""}
      </p>
      <KeysBody {...props} titleId={titleId} isSecretShown={isSecretShown} />
      {target.kind === "newProject" ? (
        <p className="text-muted-foreground text-xs">
          Its traces stay apart from this project&apos;s.{" "}
          <TextLink path={target.href} value={`Open ${target.name}`} />
        </p>
      ) : null}
    </>
  );
}
