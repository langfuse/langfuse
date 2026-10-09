import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { LocateFixed, Maximize2, Minus, Plus, X } from "lucide-react";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { useElementSize } from "@/src/hooks/useElementSize";
import { usePanZoomGestures } from "@/src/hooks/usePanZoomGestures";
import { cn } from "@/src/utils/tailwind";
import { TopicMapCanvas } from "./TopicMapCanvas";
import styles from "./topic-map.module.css";
import {
  clearTopicMapHover,
  createTopicMapStore,
  finishTopicMapHover,
  getTopicMapHover,
  setTopicMapHover,
  type TopicMapStore,
} from "./topic-map-store";
import {
  fitCamera,
  fitMapPoints,
  hitMapNode,
  panCamera,
  prepareMapHover,
  prepareMapTextLabels,
  prepareTopicMap,
  nodeDetailBlend,
  zoomCamera,
  type Camera,
  type MapData,
  type MapTopic,
  type Size,
  type TopicMapModel,
} from "./prepare-topic-map";

export type TopicMapExplorerProps = {
  projectId: string;
  data: MapData;
  topics: MapTopic[];
  selectedTopic: string | null;
  onSelectTopic: (id: string | null) => void;
  headerStats?: ReactNode;
  onSelectTrace: (traceId: string | null) => void;
  selectedTraceId: string | null;
  onOpenTrace: (traceId: string) => void;
  fillContainer?: boolean;
};

export function TopicMapExplorer({
  data,
  topics,
  selectedTopic,
  onSelectTopic,
  onSelectTrace,
  selectedTraceId,
  onOpenTrace,
  fillContainer = false,
}: TopicMapExplorerProps) {
  // Projection preparation is independent of the high-frequency camera store.
  const model = useMemo(() => prepareTopicMap(data, topics), [data, topics]);
  const [store] = useState(createTopicMapStore);
  const [stageRef, stageSize] = useElementSize<HTMLDivElement>();
  const sectionRef = useRef<HTMLElement>(null);
  const animationRef = useRef(0);
  const size = {
    width: stageSize?.width || 960,
    height: stageSize?.height || 560,
  };
  const selectedZone = model.zones.find((zone) => zone.id === selectedTopic);
  const initialCamera = fitCamera(
    selectedZone?.bounds ?? model.bounds,
    model.bounds,
    size,
  );
  const fullscreen = useStore(store, (s) => s.isFullscreen);
  const fullscreenError = useStore(store, (s) => s.fullscreenError);
  const getCamera = () => {
    const state = store.getState();
    return state.scope === selectedTopic && state.camera
      ? state.camera
      : initialCamera;
  };
  const setCamera = (camera: Camera | null, scope = selectedTopic) => {
    clearTopicMapHover(store);
    store.setState({ camera, scope });
  };
  const cancelFlight = () => {
    const manualFlight = animationRef.current !== 0;
    cancelAnimationFrame(animationRef.current);
    animationRef.current = 0;
    const state = store.getState();
    const frame = state.frame;
    if (
      state.isMoving &&
      (manualFlight ||
        state.scope !== selectedTopic ||
        state.camera === null) &&
      frame?.model === model &&
      frame.readingTopic === selectedTopic &&
      frame.size.width === size.width &&
      frame.size.height === size.height
    )
      setCamera(frame.camera);
  };
  const flyTo = (target: Camera, scope: string | null, fit = false) => {
    cancelFlight();
    clearTopicMapHover(store);
    const start = getCamera();
    if (store.getState().reducedMotion) {
      setCamera(fit ? null : target, scope);
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      animationRef.current = 0;
      const progress = Math.min(1, (now - started) / 1050);
      const t = progress ** 3 * (progress * (progress * 6 - 15) + 10);
      setCamera(
        {
          x: start.x + (target.x - start.x) * t,
          y: start.y + (target.y - start.y) * t,
          zoom: Math.exp(
            Math.log(start.zoom) + Math.log(target.zoom / start.zoom) * t,
          ),
        },
        scope,
      );
      if (progress < 1) animationRef.current = requestAnimationFrame(step);
      else if (fit) setCamera(null, scope);
    };
    setCamera(start, scope);
    animationRef.current = requestAnimationFrame(step);
  };
  const chooseZone = (id: string | null) => {
    if (id === selectedTopic) {
      const zone = model.zones.find((item) => item.id === id);
      flyTo(
        fitCamera(zone?.bounds ?? model.bounds, model.bounds, size),
        id,
        true,
      );
    } else {
      cancelFlight();
      setCamera(null, id);
    }
    onSelectTopic(id);
  };
  const zoom = (levels: number, anchor = { x: 0.5, y: 0.5 }) => {
    const before = getCamera();
    const next = zoomCamera(before, levels, anchor, model.bounds, size);
    setCamera(next);
  };
  const gestures = usePanZoomGestures({
    target: stageRef,
    onPan: (dx, dy) =>
      setCamera(panCamera(getCamera(), dx, dy, model.bounds, size)),
    onZoom: zoom,
    onInteractionStart: () => {
      cancelFlight();
      clearTopicMapHover(store);
    },
  });
  // Browser fullscreen and OS motion preferences are external subscriptions.
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => {
      if (motion.matches) setTopicMapHover(store, null, null, { x: 0, y: 0 });
      store.setState({
        reducedMotion: motion.matches,
      });
    };
    const updateFullscreen = () => {
      clearTopicMapHover(store);
      store.setState({
        isFullscreen: document.fullscreenElement === sectionRef.current,
      });
    };
    updateMotion();
    motion.addEventListener("change", updateMotion);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => {
      motion.removeEventListener("change", updateMotion);
      document.removeEventListener("fullscreenchange", updateFullscreen);
      cancelAnimationFrame(animationRef.current);
    };
  }, [store]);
  const toggleFullscreen = async () => {
    cancelFlight();
    clearTopicMapHover(store);
    store.setState({ fullscreenError: false });
    try {
      if (document.fullscreenElement === sectionRef.current)
        await document.exitFullscreen();
      else await sectionRef.current?.requestFullscreen();
    } catch {
      store.setState({ fullscreenError: true });
    }
  };
  const openTrace = async (id: string) => {
    clearTopicMapHover(store);
    try {
      if (document.fullscreenElement === sectionRef.current)
        await document.exitFullscreen();
      onOpenTrace(id);
    } catch {
      store.setState({ fullscreenError: true });
    }
  };
  return (
    <section
      ref={sectionRef}
      aria-label="Embedding map"
      className={cn(
        "ph-no-capture bg-background flex min-w-0 flex-col overflow-hidden rounded-lg border",
        fillContainer && "h-full min-h-0",
        fullscreen && "h-dvh rounded-none border-0",
      )}
    >
      {fullscreenError && (
        <p role="status" className="text-muted-foreground px-4 py-2 text-xs">
          Fullscreen is unavailable in this browser. You can still pan and zoom
          here.
        </p>
      )}
      <div
        ref={stageRef}
        tabIndex={0}
        role="group"
        aria-label="Interactive topic map. Drag or scroll to pan, pinch or control scroll to zoom. Arrow keys pan, plus and minus zoom, zero fits the map."
        className={cn(
          "bg-muted/10 focus-visible:ring-ring relative w-full overflow-hidden overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset",
          fullscreen || fillContainer
            ? "min-h-0 flex-1"
            : "h-[clamp(380px,64vh,820px)] min-h-[340px]",
          gestures.isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ touchAction: "none" }}
        {...gestures.pointerHandlers}
        onPointerMove={(event) => {
          gestures.pointerHandlers.onPointerMove(event);
          if (event.pointerType !== "mouse") return;
          const pointerAt = { x: event.clientX, y: event.clientY };
          if (event.buttons !== 0) {
            clearTopicMapHover(store);
            store.setState({ pointerAt });
            return;
          }
          const previous = store.getState().pointerAt;
          if (
            previous &&
            Math.hypot(pointerAt.x - previous.x, pointerAt.y - previous.y) <=
              0.5
          )
            return;
          if (gestures.isDragging) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const at = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          };
          const pointer = store.getState().reducedMotion
            ? { x: 0, y: 0 }
            : {
                x: (at.x / size.width - 0.5) * 2,
                y: (at.y / size.height - 0.5) * 2,
              };
          const frame = store.getState().frame;
          const intended = getCamera();
          if (
            store.getState().isMoving ||
            !frame ||
            frame.model !== model ||
            frame.readingTopic !== selectedTopic ||
            frame.size.width !== size.width ||
            frame.size.height !== size.height ||
            frame.camera.zoom !== intended.zoom ||
            frame.camera.x !== intended.x ||
            frame.camera.y !== intended.y
          ) {
            setTopicMapHover(store, null, null, pointer, pointerAt);
            return;
          }
          const hovered = hitMapNode(frame, at);
          const traceLabel =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>(
                  '[data-topic-trace]:not([data-active="false"])',
                )
              : null;
          setTopicMapHover(
            store,
            traceLabel?.dataset.topicTrace ?? hovered?.traceId ?? null,
            null,
            pointer,
            pointerAt,
          );
        }}
        onPointerLeave={() =>
          setTopicMapHover(store, null, null, { x: 0, y: 0 })
        }
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const frame = store.getState().frame;
          const point =
            frame &&
            frame.model === model &&
            frame.readingTopic === selectedTopic
              ? hitMapNode(frame, {
                  x: event.clientX - rect.left,
                  y: event.clientY - rect.top,
                })
              : null;
          onSelectTrace(point?.traceId ?? null);
          if (point) openTrace(point.traceId);
        }}
        onDoubleClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          cancelFlight();
          zoom(1, {
            x: (event.clientX - rect.left) / size.width,
            y: (event.clientY - rect.top) / size.height,
          });
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (
            [
              "+",
              "=",
              "-",
              "0",
              "Home",
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Escape",
            ].includes(event.key)
          ) {
            event.preventDefault();
            cancelFlight();
            if (event.key === "+" || event.key === "=") zoom(0.5);
            else if (event.key === "-") zoom(-0.5);
            else if (event.key === "0" || event.key === "Home")
              chooseZone(null);
            else if (event.key === "Escape") {
              if (document.fullscreenElement === sectionRef.current)
                toggleFullscreen();
              else if (selectedTraceId) onSelectTrace(null);
              else chooseZone(null);
            } else
              setCamera(
                panCamera(
                  getCamera(),
                  (
                    { ArrowLeft: 80, ArrowRight: -80 } as Record<string, number>
                  )[event.key] ?? 0,
                  ({ ArrowUp: 80, ArrowDown: -80 } as Record<string, number>)[
                    event.key
                  ] ?? 0,
                  model.bounds,
                  size,
                ),
              );
          }
        }}
      >
        <div
          role="toolbar"
          aria-label="Map controls"
          className="bg-background/85 absolute top-2 right-2 z-20 flex items-center gap-0.5 rounded-md border p-0.5 shadow-sm backdrop-blur-sm"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerEnter={() => clearTopicMapHover(store)}
        >
          <IconButton
            icon={LocateFixed}
            label="Fit map (0)"
            onClick={() => chooseZone(null)}
          />
          <IconButton
            icon={Minus}
            label="Zoom out (-)"
            onClick={() => {
              cancelFlight();
              zoom(-0.5);
            }}
          />
          <ZoomReadout
            store={store}
            initialCamera={initialCamera}
            scope={selectedTopic}
          />
          <IconButton
            icon={Plus}
            label="Zoom in (+)"
            onClick={() => {
              cancelFlight();
              zoom(0.5);
            }}
          />
          <IconButton
            icon={fullscreen ? X : Maximize2}
            label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={() => {
              toggleFullscreen();
            }}
          />
        </div>
        <MapBackgroundLabels store={store} />
        <TopicMapCanvas
          model={model}
          size={size}
          camera={initialCamera}
          store={store}
          selectedTopic={selectedTopic}
          selectedTraceId={selectedTraceId}
        />
        <MapLabels
          model={model}
          size={size}
          store={store}
          selectedTopic={selectedTopic}
          selectedTraceId={selectedTraceId}
          onSelectTrace={(id) => {
            onSelectTrace(id);
            openTrace(id);
          }}
        />
        {model.points.length === 0 && (
          <div className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm">
            No plotted summaries in this selection. Try a wider time range.
          </div>
        )}
        <div className="text-muted-foreground pointer-events-none absolute right-4 bottom-3 left-4 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <LayoutReadout
            store={store}
            initialCamera={initialCamera}
            scope={selectedTopic}
            population={model.populationLabel}
          />
          {!fillContainer && (
            <span>
              Drag / scroll to pan · Pinch / Ctrl or ⌘ + scroll to zoom
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function ZoomReadout({
  store,
  initialCamera,
  scope,
}: {
  store: TopicMapStore;
  initialCamera: Camera;
  scope: string | null;
}) {
  const camera = useStore(store, (s) => s.camera);
  const cameraScope = useStore(store, (s) => s.scope);
  return (
    <span
      className="text-muted-foreground w-12 text-center text-xs tabular-nums"
      aria-label="Zoom level"
    >
      {Math.round(
        (cameraScope === scope && camera ? camera.zoom : initialCamera.zoom) *
          100,
      )}
      %
    </span>
  );
}

function LayoutReadout({
  store,
  initialCamera,
  scope,
  population,
}: {
  store: TopicMapStore;
  initialCamera: Camera;
  scope: string | null;
  population: string;
}) {
  const camera = useStore(store, (s) => s.camera);
  const cameraScope = useStore(store, (s) => s.scope);
  const current = cameraScope === scope && camera ? camera : initialCamera;
  return (
    <span>
      {population} ·{" "}
      {nodeDetailBlend(current.zoom) > 0
        ? "Adaptive detail"
        : "Saved 2D projection"}
    </span>
  );
}

function MapLabels({
  model,
  size,
  store,
  selectedTopic,
  selectedTraceId,
  onSelectTrace,
}: {
  model: TopicMapModel;
  size: Size;
  store: TopicMapStore;
  selectedTopic: string | null;
  selectedTraceId: string | null;
  onSelectTrace: (id: string) => void;
}) {
  const state = useStore(store);
  const frame = state.frame;
  const hover = getTopicMapHover(state, frame);
  const current =
    frame !== null &&
    frame.model === model &&
    frame.size.width === size.width &&
    frame.size.height === size.height &&
    frame.readingTopic === selectedTopic;
  return (
    <div className="pointer-events-none absolute inset-0">
      {current &&
        frame!.nodes
          .filter((node) => node.textOpacity > 0.001)
          .map((node) => (
            <button
              key={node.point.traceId}
              type="button"
              data-topic-node=""
              data-topic-trace={node.point.traceId}
              data-trace-id={node.point.traceId}
              data-testid="topic-map-trace-card"
              data-hovered={node.point.traceId === hover.hoveredId}
              data-text-opacity={node.textOpacity}
              tabIndex={node.textOpacity >= 0.9 ? 0 : -1}
              aria-pressed={node.point.traceId === selectedTraceId}
              aria-label={`Select trace: ${node.point.summary}`}
              onClick={() => onSelectTrace(node.point.traceId)}
              className="text-foreground focus-visible:outline-ring pointer-events-auto absolute cursor-pointer overflow-hidden rounded-lg px-2 py-1.5 text-left leading-relaxed focus-visible:outline-2"
              style={{
                left: node.rect.x,
                top: node.rect.y,
                width: node.rect.width,
                height: node.rect.height,
                opacity: node.textOpacity,
                fontSize: node.fontSize,
              }}
            >
              <span className="block">{node.excerpt}</span>
            </button>
          ))}
      {state.hoverLabels.map((label) => {
        if (!frame || frame.model !== model) return null;
        const active =
          current &&
          label.active &&
          (label.kind === "trace"
            ? hover.hoveredId === label.id
            : hover.hoveredZoneId === label.id) &&
          (label.kind !== "trace" ||
            (frame.nodeById.get(label.id)?.textOpacity ?? 1) < 0.65);
        const source = active ? frame : label.frame;
        if (!source) return null;
        const hints = prepareMapHover(
          source,
          label.kind === "trace" ? label.id : null,
          label.kind === "zone" ? label.id : null,
        );
        const trace = hints.traces[0];
        const zone = hints.zones[0];
        if (!trace && !zone) return null;
        const rect = trace?.card ?? zone!.label;
        return (
          <div
            key={label.token}
            role="tooltip"
            data-testid="topic-map-hover-card"
            data-topic-trace={trace?.point.traceId}
            data-topic-zone={zone?.id}
            data-trace-id={trace?.point.traceId}
            data-active={active}
            data-hovered={active && label.kind === "trace"}
            aria-hidden={!active}
            aria-label={
              trace
                ? `Trace summary: ${trace.point.summary}`
                : `${zone!.name}, ${zone!.countLabel}`
            }
            onTransitionEnd={(event) => {
              if (!active && event.propertyName === "opacity")
                finishTopicMapHover(store, label.token);
            }}
            className={cn(
              "bg-background/85 text-foreground pointer-events-none absolute overflow-hidden rounded-lg border px-3 py-2.5 text-left text-xs leading-relaxed shadow-md backdrop-blur-sm",
              styles.hoverCard,
              active ? styles.enter : styles.exit,
            )}
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              borderLeftColor: trace?.point.color ?? zone!.color,
              borderLeftWidth: 2,
            }}
          >
            {trace ? (
              <span className="line-clamp-6">{trace.excerpt}</span>
            ) : (
              <>
                <span
                  className="block text-xs font-bold"
                  style={{ color: zone!.color }}
                >
                  {zone!.name}
                </span>
                <span className="text-muted-foreground mb-1 block text-[10px]">
                  {zone!.countLabel} · {zone!.shareLabel}
                </span>
                <span className="line-clamp-3 text-[11px]">{zone!.detail}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MapBackgroundLabels({ store }: { store: TopicMapStore }) {
  const frame = useStore(store, (state) => state.frame);
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {frame &&
        prepareMapTextLabels(frame).map((label) => (
          <div
            key={label.id}
            data-topic-background-label={label.id}
            data-label-kind={label.kind}
            className={cn(
              "text-muted-foreground pointer-events-none absolute overflow-hidden text-center",
              styles.backgroundLabel,
            )}
            style={{
              left: label.rect.x,
              top: label.rect.y,
              width: label.rect.width,
              height: label.rect.height,
              opacity: label.opacity,
            }}
          >
            <span
              className={cn(
                "line-clamp-2 block leading-[1.2]",
                label.kind === "zone" && "font-bold",
              )}
              style={{
                fontSize: label.fontSize,
                color: `color-mix(in srgb, ${label.color} 35%, hsl(var(--muted-foreground)))`,
              }}
            >
              {label.title}
            </span>
            {label.description && (
              <span
                className="mt-1 line-clamp-2 block text-[11px] leading-relaxed"
                style={{ opacity: label.detailOpacity }}
              >
                {label.description}
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

export const __test = { fitMapPoints };
