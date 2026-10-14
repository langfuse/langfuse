"use client";

import {
  Component,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/core";
import { Button } from "@/src/components/design-system/Button/Button";
import { customUiComputedFunctions } from "./bindings";
import { customUiRegistry } from "./catalogRenderer";
import {
  buildCustomUiStageSpec,
  compileCustomUiRenderPlan,
  type CustomUiRenderPlan,
  type CustomUiRuntimeDiagnostics,
} from "./compileRenderPlan";
import type { CustomUiRenderInput, CustomUiSpec } from "./spec";
import {
  recordCustomUiPerformance,
  reportCustomUiRootFailure,
  reportInvalidCustomUi,
} from "./telemetry";

const subscribeToClient = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const RENDER_BUDGET_MS = 50;
let renderInstanceCounter = 0;
type QueuedMount = {
  cancelled: boolean;
  queuedAt: number;
  run: (waitMs: number) => void;
};
const mountQueue: QueuedMount[] = [];
let mountQueueScheduled = false;

const scheduleNextMount = () => {
  if (mountQueueScheduled) return;
  const task = mountQueue.find((candidate) => !candidate.cancelled);
  if (!task) {
    mountQueue.length = 0;
    return;
  }
  mountQueueScheduled = true;

  const mount = () => {
    const next = mountQueue.shift();
    if (next && !next.cancelled) {
      next.run(performance.now() - next.queuedAt);
    }
    window.requestAnimationFrame(() => {
      mountQueueScheduled = false;
      scheduleNextMount();
    });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(mount, { timeout: 100 });
  } else {
    window.setTimeout(mount, 0);
  }
};

const enqueueMount = (run: QueuedMount["run"]) => {
  const task: QueuedMount = {
    cancelled: false,
    queuedAt: performance.now(),
    run,
  };
  mountQueue.push(task);
  scheduleNextMount();
  return () => {
    task.cancelled = true;
  };
};

type CustomUiRendererProps = {
  spec: CustomUiSpec;
  input: CustomUiRenderInput;
  fallback?: ReactNode;
  showDiagnostics?: boolean;
  deferUntilVisible?: boolean;
};

class CustomUiRootErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    reportCustomUiRootFailure();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Diagnostics({
  diagnostics,
}: {
  diagnostics: CustomUiRuntimeDiagnostics;
}) {
  return (
    <details className="text-muted-foreground border-t pt-2 text-xs">
      <summary className="cursor-pointer">Runtime diagnostics</summary>
      <dl className="mt-2 grid grid-cols-[max-content_auto] gap-x-4 gap-y-1 font-mono">
        <dt>nodes</dt>
        <dd>{diagnostics.nodeCount}</dd>
        <dt>max depth</dt>
        <dd>{diagnostics.maxDepth}</dd>
        <dt>deferred</dt>
        <dd>{diagnostics.deferredCount}</dd>
        <dt>repeat regions</dt>
        <dd>{diagnostics.repeatRegionCount}</dd>
        <dt>bounded repeat items</dt>
        <dd>{diagnostics.boundedRepeatItemCount}</dd>
        <dt>truncated repeat items</dt>
        <dd>{diagnostics.truncatedRepeatItemCount}</dd>
        <dt>validate</dt>
        <dd>{diagnostics.validateDurationMs.toFixed(2)} ms</dd>
        <dt>compile</dt>
        <dd>{diagnostics.compileDurationMs.toFixed(2)} ms</dd>
      </dl>
    </details>
  );
}

function InvalidCustomUi({
  code,
  fallback,
}: {
  code: Parameters<typeof reportInvalidCustomUi>[0];
  fallback: ReactNode;
}) {
  useEffect(() => {
    reportInvalidCustomUi(code);
  }, [code]);
  return fallback;
}

function useProgressiveStage(plan: CustomUiRenderPlan) {
  const [activeStage, setActiveStage] = useState<0 | 1 | 2>(0);
  const [automaticRendering, setAutomaticRendering] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const stageStartedAtRef = useRef<number | null>(null);
  const automaticRenderingRef = useRef(true);
  const maxStage = (plan.stageCount - 1) as 0 | 1 | 2;
  const visibleStage = Math.min(activeStage, maxStage) as 0 | 1 | 2;

  useEffect(() => {
    const startedAt = stageStartedAtRef.current;
    if (startedAt === null || visibleStage === 0) return;
    stageStartedAtRef.current = null;
    const duration = performance.now() - startedAt;
    recordCustomUiPerformance("deferred_render", duration, plan.diagnostics);
    setIsPending(false);
    if (duration > RENDER_BUDGET_MS) {
      automaticRenderingRef.current = false;
      setAutomaticRendering(false);
    }
  }, [plan.diagnostics, visibleStage]);

  useEffect(() => {
    if (
      !automaticRendering ||
      !automaticRenderingRef.current ||
      visibleStage >= maxStage
    ) {
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    let cancelled = false;
    let idleHandle: number | undefined;
    const revealNext = () => {
      if (cancelled) return;
      idleHandle = window.setTimeout(() => {
        if (cancelled) return;
        stageStartedAtRef.current = performance.now();
        setIsPending(true);
        startTransition(() => {
          setActiveStage((stage) => Math.min(maxStage, stage + 1) as 0 | 1 | 2);
        });
      }, 0);
    };

    if (typeof IntersectionObserver === "undefined") {
      revealNext();
      return () => {
        cancelled = true;
        if (idleHandle !== undefined) window.clearTimeout(idleHandle);
      };
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        revealNext();
      }
    });
    observer.observe(sentinel);
    return () => {
      cancelled = true;
      observer.disconnect();
      if (idleHandle !== undefined) window.clearTimeout(idleHandle);
    };
  }, [automaticRendering, maxStage, visibleStage]);

  const showNextStage = () => {
    stageStartedAtRef.current = performance.now();
    setIsPending(true);
    startTransition(() => {
      setActiveStage((stage) => Math.min(maxStage, stage + 1) as 0 | 1 | 2);
    });
  };

  return {
    activeStage: visibleStage,
    hasDeferredContent: visibleStage < maxStage,
    isPending,
    sentinelRef,
    showNextStage,
  };
}

function PreparedCustomUi({
  plan,
  fallback,
  showDiagnostics,
  preparationStartedAt,
  queueWaitMs,
}: {
  plan: CustomUiRenderPlan;
  fallback: ReactNode;
  showDiagnostics: boolean;
  preparationStartedAt: number;
  queueWaitMs: number;
}) {
  const progressive = useProgressiveStage(plan);
  const stageSpec = buildCustomUiStageSpec(
    plan,
    progressive.activeStage,
  ) as Spec;

  useEffect(() => {
    const firstRenderDuration = performance.now() - preparationStartedAt;
    if (queueWaitMs > 0) {
      recordCustomUiPerformance("queue_wait", queueWaitMs, plan.diagnostics);
    }
    recordCustomUiPerformance(
      "prepare",
      plan.diagnostics.validateDurationMs + plan.diagnostics.compileDurationMs,
      plan.diagnostics,
    );
    recordCustomUiPerformance(
      "first_render",
      firstRenderDuration,
      plan.diagnostics,
    );
  }, [plan.diagnostics, preparationStartedAt, queueWaitMs]);

  return (
    <CustomUiRootErrorBoundary fallback={fallback}>
      <section
        className="ph-no-capture flex min-w-0 flex-col gap-3"
        data-custom-ui-root
      >
        <JSONUIProvider
          registry={customUiRegistry}
          initialState={plan.input}
          functions={customUiComputedFunctions}
        >
          <Renderer
            spec={stageSpec}
            registry={customUiRegistry}
            loading={progressive.hasDeferredContent}
          />
        </JSONUIProvider>
        <div ref={progressive.sentinelRef} aria-hidden className="h-px" />
        {progressive.hasDeferredContent && !progressive.isPending && (
          <div>
            <Button
              text="Show remaining sections"
              variant="secondary"
              size="sm"
              onClick={progressive.showNextStage}
            />
          </div>
        )}
        {showDiagnostics && <Diagnostics diagnostics={plan.diagnostics} />}
      </section>
    </CustomUiRootErrorBoundary>
  );
}

/**
 * Browser-only renderer for a validated json-render spec. Server output is the
 * normal Langfuse fallback; compilation, binding, scheduling, and rendering
 * begin only after hydration.
 */
export function CustomUiRenderer({
  spec,
  input,
  fallback = null,
  showDiagnostics = false,
  deferUntilVisible = false,
}: CustomUiRendererProps) {
  const isClient = useSyncExternalStore(
    subscribeToClient,
    clientSnapshot,
    serverSnapshot,
  );

  if (!isClient) return fallback;
  return (
    <VisibleClientCustomUiRenderer
      spec={spec}
      input={input}
      fallback={fallback}
      showDiagnostics={showDiagnostics}
      deferUntilVisible={deferUntilVisible}
    />
  );
}

function VisibleClientCustomUiRenderer({
  deferUntilVisible,
  ...props
}: Required<CustomUiRendererProps>) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [mountState, setMountState] = useState({
    ready: !deferUntilVisible,
    queueWaitMs: 0,
  });
  const ready = !deferUntilVisible || mountState.ready;

  useEffect(() => {
    if (ready) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    let cancelQueuedMount: (() => void) | undefined;
    const queueMount = () => {
      cancelQueuedMount = enqueueMount((queueWaitMs) => {
        setMountState({ ready: true, queueWaitMs });
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      queueMount();
      return () => cancelQueuedMount?.();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        queueMount();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      cancelQueuedMount?.();
    };
  }, [ready]);

  if (!ready) {
    return (
      <div
        ref={sentinelRef}
        className="min-h-px"
        data-custom-ui-pending
        aria-hidden
      />
    );
  }
  return (
    <ClientCustomUiRenderer {...props} queueWaitMs={mountState.queueWaitMs} />
  );
}

function ClientCustomUiRenderer({
  spec,
  input,
  fallback,
  showDiagnostics,
  queueWaitMs,
}: Omit<Required<CustomUiRendererProps>, "deferUntilVisible"> & {
  queueWaitMs: number;
}) {
  const prepared = useMemo(() => {
    const startedAt = globalThis.performance?.now() ?? Date.now();
    return {
      result: compileCustomUiRenderPlan(spec, input),
      startedAt,
      renderKey: ++renderInstanceCounter,
    };
  }, [input, spec]);

  if (!prepared.result.success) {
    return <InvalidCustomUi code={prepared.result.code} fallback={fallback} />;
  }
  return (
    <PreparedCustomUi
      key={prepared.renderKey}
      plan={prepared.result.plan}
      fallback={fallback}
      showDiagnostics={showDiagnostics}
      preparationStartedAt={prepared.startedAt}
      queueWaitMs={queueWaitMs}
    />
  );
}
