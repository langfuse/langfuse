/* eslint-disable no-nested-ternary */
/* eslint-disable @repo/no-abstracted-overlay-trigger */
"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUp10,
  BadgeCheck,
  HardDriveDownload,
  Info,
  Map,
  Newspaper,
} from "@langfuse/icons";
import { SiGithub } from "@langfuse/icons/si";
import { planLabels, type Plan } from "@langfuse/shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

type SelfHostedPlan = Extract<Plan, "oss" | `self-hosted:${string}`>;

export type SidebarVersionState =
  | { deployment: "cloud" }
  | {
      deployment: "self-hosted";
      plan: SelfHostedPlan;
      release:
        | { status: "current" }
        | {
            status: "update-available";
            updateType: "major" | "minor" | "patch";
            latestRelease: string;
          };
      migration: { status: "idle" } | { status: "in-progress"; phase: string };
    };

const selfHostedPlanLabels = {
  oss: { short: "OSS", long: "Open source" },
  "self-hosted:pro": {
    short: "Pro",
    long: planLabels["self-hosted:pro"],
  },
  "self-hosted:enterprise": {
    short: "EE",
    long: planLabels["self-hosted:enterprise"],
  },
  "self-hosted:gov": {
    short: "Gov",
    long: planLabels["self-hosted:gov"],
  },
} satisfies Record<SelfHostedPlan, { short: string; long: string }>;

const attentionDotTones = {
  major: "bg-dark-red",
  minor: "bg-category-amber",
  patch: "bg-muted-foreground",
  migration: "bg-dark-blue",
} as const;

const AttentionDot = ({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof attentionDotTones;
}) => (
  <span
    role="img"
    aria-label={label}
    title={label}
    className={cn("size-1.5 shrink-0 rounded-full", attentionDotTones[tone])}
  />
);

export const VersionLabel = ({
  state,
  version,
}: {
  state: SidebarVersionState;
  version: string;
}) => {
  const selfHostedPlanLabel =
    state.deployment === "self-hosted"
      ? selfHostedPlanLabels[state.plan]
      : null;
  const backgroundMigrationStatus =
    state.deployment === "self-hosted" &&
    state.migration.status === "in-progress"
      ? state.migration.phase
      : null;
  const update =
    state.deployment === "self-hosted" &&
    state.release.status === "update-available"
      ? state.release
      : null;
  const versionText = `${version}${
    selfHostedPlanLabel ? ` ${selfHostedPlanLabel.short}` : ""
  }`;

  // Radix returns focus to the trigger when the menu closes, and the browser
  // treats that programmatic focus as `:focus-visible`, so the Button's
  // `focus-visible:ring-2` ring is left showing on the badge after a
  // mouse-driven open/close. Keyboard users must keep that ring, so the focus
  // restore is suppressed only for an interaction that never used the keyboard.
  //
  // `pointerOnly` therefore has to be cleared by a key press anywhere in the
  // interaction, not only on the trigger: the menu is portalled, so once it is
  // open every key event lands on the content instead. A mouse-opened menu
  // closed with Escape or Enter is a keyboard interaction and must get focus
  // back on the trigger.
  const pointerOnly = React.useRef(false);
  const noteKeyboardUse = () => {
    pointerOnly.current = false;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground h-5 translate-y-px gap-1 py-0 text-[0.625rem] leading-none"
          onPointerDown={() => {
            pointerOnly.current = true;
          }}
          onKeyDown={noteKeyboardUse}
        >
          <span className="whitespace-nowrap">{versionText}</span>
          {update && !backgroundMigrationStatus && (
            <AttentionDot
              label={`New ${update.updateType} version available`}
              tone={update.updateType}
            />
          )}
          {backgroundMigrationStatus && (
            <AttentionDot
              label="Background migration running"
              tone="migration"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onClick={(e) => e.stopPropagation()}
        // Both hooks are needed: Radix's DismissableLayer handles Escape before
        // it reaches the content's own onKeyDown, while onKeyDown covers the
        // arrow/Enter/typeahead keys used to pick an item.
        onKeyDown={noteKeyboardUse}
        onEscapeKeyDown={noteKeyboardUse}
        onCloseAutoFocus={(event) => {
          if (!pointerOnly.current) return;
          pointerOnly.current = false;
          event.preventDefault();
        }}
      >
        {update ? (
          <>
            <DropdownMenuLabel>
              New {update.updateType} version: {update.latestRelease}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : state.deployment === "self-hosted" ? (
          <>
            <DropdownMenuLabel>This is the latest release</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {selfHostedPlanLabel && (
          <>
            <DropdownMenuLabel className="flex items-center font-normal">
              <BadgeCheck size="base" __rawClassName="mr-2" />
              {selfHostedPlanLabel.long}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link
            href="https://github.com/langfuse/langfuse/releases"
            target="_blank"
          >
            <SiGithub size="base" color="default" __rawClassName="mr-2" />
            Releases
          </Link>
        </DropdownMenuItem>
        {state.deployment === "self-hosted" && (
          <DropdownMenuItem asChild>
            <Link href="/background-migrations">
              <ArrowUp10 size="base" color="default" __rawClassName="mr-2" />
              Background migrations
              {backgroundMigrationStatus && (
                <span className="ml-2 inline-flex">
                  <AttentionDot
                    label="Background migration running"
                    tone="migration"
                  />
                </span>
              )}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="https://langfuse.com/changelog" target="_blank">
            <Newspaper size="base" color="default" __rawClassName="mr-2" />
            Changelog
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="https://langfuse.com/roadmap" target="_blank">
            <Map size="base" color="default" __rawClassName="mr-2" />
            Roadmap
          </Link>
        </DropdownMenuItem>
        {state.deployment === "self-hosted" && (
          <DropdownMenuItem asChild>
            <Link href="https://langfuse.com/pricing-self-host" target="_blank">
              <Info size="base" color="default" __rawClassName="mr-2" />
              Compare versions
            </Link>
          </DropdownMenuItem>
        )}
        {update && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="https://langfuse.com/docs/deployment/self-host#update"
                target="_blank"
              >
                <HardDriveDownload
                  size="base"
                  color="default"
                  __rawClassName="mr-2"
                />
                Update
                {!backgroundMigrationStatus && (
                  <span className="ml-2 inline-flex">
                    <AttentionDot
                      label="Update available"
                      tone={update.updateType}
                    />
                  </span>
                )}
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
