"use client";

import { lazy, Suspense, type ReactNode } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { cn } from "@/src/utils/tailwind";
import { integrationOf } from "../../../../integrations/catalog";
import { logoOf } from "../../../../integrations/logos";
import { FEATURED_SLUGS } from "../../../../integrations/search";
import motion from "../../motion.module.css";
import type {
  PanelView,
  SetupProject,
  TraceSetupActions,
  TraceSetupModel,
  TraceSetupState,
  WayOffer,
} from "../../types";
import { useIntegrationsPanel } from "../../useIntegrationsPanel";
import { panelPlaceOf } from "../../useTraceSetup";
import { AgentsCard } from "../AgentsCard/AgentsCard";
import { AppCard } from "../AppCard/AppCard";
import { DemoChat } from "../DemoChat/DemoChat";
import { SetupCard } from "../SetupCard/SetupCard";

/** The panel is closed on first paint, so its browser, search and setups load when it first opens. */
const IntegrationsPanel = lazy(() =>
  import("../IntegrationsPanel/IntegrationsPanel").then((module) => ({
    default: module.IntegrationsPanel,
  })),
);

/** The row's columns at `lg`: two equal ways in, the setup wide on the side its way was, or one card alone. */
const COLUMNS = {
  even: "lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
  wideLeft: "lg:grid-cols-[minmax(0,2fr)_auto_minmax(0,1fr)]",
  wideRight: "lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,2fr)]",
  alone: "grid-cols-[minmax(0,1fr)]",
} as const;

/** Where a cell goes when the row stacks below `lg`, so the setup comes first. */
const STACKED_ORDER = {
  first: "order-1 lg:order-none",
  second: "order-2 lg:order-none",
  third: "order-3 lg:order-none",
} as const;

const FEATURED_LOGOS = FEATURED_SLUGS.flatMap((slug) => {
  const integration = integrationOf(slug);
  return integration ? [{ name: integration.name, ...logoOf(slug) }] : [];
});

type GetStartedRowProps = {
  model: TraceSetupModel;
  project: SetupProject;
  actions: TraceSetupActions;
};

type RowParts = GetStartedRowProps & {
  panel: ReturnType<typeof useIntegrationsPanel>;
};

/** "OR" on a dashed line between the two ways in: vertical beside them, horizontal when they stack. */
function OrDivider() {
  return (
    <div
      aria-hidden="true"
      className="text-muted-foreground flex items-center gap-3 lg:h-full lg:flex-col lg:py-7"
    >
      <span className="border-muted-foreground/45 flex-1 border-t border-dashed lg:border-t-0 lg:border-l" />
      <span className="bg-background grid size-8.5 shrink-0 place-items-center rounded-full border text-xs font-bold tracking-wider">
        OR
      </span>
      <span className="border-muted-foreground/45 flex-1 border-t border-dashed lg:border-t-0 lg:border-l" />
    </div>
  );
}

/** Under the two ways in: a demo chat for whoever wants to see a trace before touching their code. */
function TryTheDemo({ onStart }: { onStart: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-dashed px-6 py-4 text-sm lg:mt-6">
      <p className="text-muted-foreground">
        <span className="text-foreground font-bold">No code yet?</span> Chat
        with a demo app and watch its trace appear.
      </p>
      <Button
        text="Try the demo chat"
        variant="secondary"
        size="sm"
        onClick={onStart}
      />
    </div>
  );
}

/**
 * Keeps what the panel stands in for mounted but out of sight and reach, so its cards keep their state and the
 * control that opened the panel its focus; it slides back in when the panel closes.
 */
function KeptMounted({
  isHidden,
  isReturning,
  children,
}: {
  isHidden: boolean;
  isReturning: boolean;
  children: ReactNode;
}) {
  return (
    <div
      inert={isHidden}
      className={cn(
        isHidden
          ? "invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
          : "h-full",
        !isHidden && isReturning && motion.viewBack,
      )}
    >
      {children}
    </div>
  );
}

function Grid({
  columns,
  children,
}: {
  columns: keyof typeof COLUMNS;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-3 lg:gap-6", COLUMNS[columns])}>
      {children}
    </div>
  );
}

function Cell({
  stackedAt,
  children,
}: {
  stackedAt: keyof typeof STACKED_ORDER | null;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("relative min-w-0", stackedAt && STACKED_ORDER[stackedAt])}
    >
      {children}
    </div>
  );
}

/** Holds the panel's place while its code loads, so the page doesn't jump. */
function PanelPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="bg-muted/60 h-full min-h-96 w-full max-w-3xl rounded-2xl"
    />
  );
}

function Panel({
  view,
  model,
  project,
  actions,
  panel,
}: RowParts & { view: PanelView }) {
  return (
    <Suspense fallback={<PanelPlaceholder />}>
      <IntegrationsPanel
        view={view}
        onViewChange={actions.changePanel}
        onClose={() => panel.close(null)}
        onPick={panel.close}
        keys={model.keys}
        baseUrl={project.baseUrl}
        manageKeysPath={`/project/${project.id}/settings/api-keys`}
        onCreateKeys={actions.createKeys}
        newProject={model.newProject}
        canCreateProject={project.canCreateProject}
        onCreateProject={actions.createProject}
        onCopy={actions.copy}
      />
    </Suspense>
  );
}

/** The app's way in: the choice, the other way while an agent is set up, or a new project once a trace is in. */
function AppWay({
  offer,
  actions,
  panel,
}: Pick<RowParts, "actions" | "panel"> & { offer: WayOffer }) {
  return (
    <AppCard
      offer={offer}
      logos={FEATURED_LOGOS}
      onTraceApp={
        offer === "newProject"
          ? () =>
              panel.open({
                kind: "browse",
                category: null,
                isReturn: false,
                project: "new",
              })
          : () => actions.pickWay({ kind: "app", integration: null })
      }
    />
  );
}

/** The coding agents' way in, offered the same three ways as the app's. */
function AgentsWay({
  offer,
  actions,
  panel,
}: Pick<RowParts, "actions" | "panel"> & { offer: WayOffer }) {
  return (
    <AgentsCard
      offer={offer}
      onPick={(slug) =>
        offer === "newProject"
          ? panel.open({ kind: "setup", slug })
          : actions.pickWay({ kind: "agent", slug })
      }
      onBrowseMore={() =>
        panel.open({
          kind: "browse",
          category: "developer-tools",
          isReturn: false,
          project: offer === "newProject" ? "new" : "this",
        })
      }
    />
  );
}

/** The setup card, with the panel standing in for it while it's open. */
function SetupCell({
  setup,
  ...parts
}: RowParts & {
  setup: Extract<TraceSetupState, { step: "setup" | "traceIn" }>;
}) {
  const { model, project, actions, panel } = parts;
  return (
    <>
      {model.panel ? <Panel {...parts} view={model.panel} /> : null}
      <KeptMounted
        isHidden={model.panel !== null}
        isReturning={model.returnedTo === "card"}
      >
        <SetupCard
          setup={setup}
          keys={model.keys}
          project={project}
          shouldAnimate={model.shouldAnimate}
          actions={actions}
          onBrowse={(category) =>
            panel.open({
              kind: "browse",
              category,
              isReturn: false,
              project: "this",
            })
          }
        />
      </KeptMounted>
    </>
  );
}

/**
 * The row's cells by where the project is. They keep their keys from step to step, so the way not picked stays
 * mounted where it was while the picked one becomes its setup. The demo chat and the first trace have the row to
 * themselves; once the trace is opened, the other way in returns, in a new project.
 */
function Cells(parts: RowParts) {
  const { setup } = parts.model;
  switch (setup.step) {
    case "demo":
      return (
        <Grid columns="alone">
          <Cell key="left" stackedAt={null}>
            <DemoChat
              turns={setup.turns}
              onSend={parts.actions.sendDemoMessage}
              onSetUpApp={() =>
                parts.actions.pickWay({ kind: "app", integration: null })
              }
              onLeave={parts.actions.leaveDemo}
            />
          </Cell>
        </Grid>
      );
    case "wayIn":
      return (
        <Grid columns="even">
          <Cell key="left" stackedAt={null}>
            <AppWay {...parts} offer="choice" />
          </Cell>
          <Cell key="or" stackedAt={null}>
            <OrDivider />
          </Cell>
          <Cell key="right" stackedAt={null}>
            <AgentsWay {...parts} offer="choice" />
          </Cell>
        </Grid>
      );
    case "setup":
      if (setup.way.kind === "agent")
        return (
          <Grid columns="wideRight">
            <Cell key="left" stackedAt="third">
              <AppWay {...parts} offer="alternative" />
            </Cell>
            <Cell key="or" stackedAt="second">
              <OrDivider />
            </Cell>
            <Cell key="right" stackedAt="first">
              <SetupCell {...parts} setup={setup} />
            </Cell>
          </Grid>
        );
      return (
        <Grid columns="wideLeft">
          <Cell key="left" stackedAt={null}>
            <SetupCell {...parts} setup={setup} />
          </Cell>
          <Cell key="or" stackedAt={null}>
            <OrDivider />
          </Cell>
          <Cell key="right" stackedAt={null}>
            <AgentsWay {...parts} offer="alternative" />
          </Cell>
        </Grid>
      );
    case "traceIn":
      if (!setup.hasOpenedTrace)
        return (
          <Grid columns="alone">
            <Cell key="left" stackedAt={null}>
              <SetupCell {...parts} setup={setup} />
            </Cell>
          </Grid>
        );
      return (
        <Grid columns="wideLeft">
          <Cell key="left" stackedAt={null}>
            <SetupCell {...parts} setup={setup} />
          </Cell>
          <Cell key="or" stackedAt={null}>
            <OrDivider />
          </Cell>
          <Cell key="right" stackedAt={null}>
            {setup.trace.source.kind === "agent" ? (
              <AppWay {...parts} offer="newProject" />
            ) : (
              <AgentsWay {...parts} offer="newProject" />
            )}
          </Cell>
        </Grid>
      );
  }
}

/**
 * The top of the page: the two ways in, the demo chat, or the setup card with the other way beside it. Every
 * integration opens in a panel in place of the setup card (before a way is picked, of the whole row), and closing it
 * brings back what it stood in for, focus where it was.
 */
export function GetStartedRow(props: GetStartedRowProps) {
  const panel = useIntegrationsPanel(props.actions);
  const { model } = props;
  const place = panelPlaceOf(model.setup);
  return (
    <section aria-label="Get started" className="relative flex flex-col gap-4">
      {place === "row" && model.panel ? (
        <Panel {...props} panel={panel} view={model.panel} />
      ) : null}
      <KeptMounted
        isHidden={model.panel !== null && place === "row"}
        isReturning={model.returnedTo === "row"}
      >
        <Cells {...props} panel={panel} />
        {model.setup.step === "wayIn" ? (
          <TryTheDemo onStart={props.actions.startDemo} />
        ) : null}
      </KeptMounted>
    </section>
  );
}
