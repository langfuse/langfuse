import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  LocateFixed,
  Maximize2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { useElementSize } from "@/src/hooks/useElementSize";
import { usePanZoomGestures } from "@/src/hooks/usePanZoomGestures";
import { cn } from "@/src/utils/tailwind";
import { TopicMapCanvas } from "./TopicMapCanvas";
import { createTopicMapStore, type TopicMapStore } from "./topic-map-store";
import {
  fitCamera,
  displayedWorldPoint,
  fitMapPoints,
  hitPoint,
  hitZone,
  panCamera,
  prepareMapLabels,
  prepareTopicMap,
  readingLayoutBlend,
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
};

export function TopicMapExplorer({
  data,
  topics,
  selectedTopic,
  onSelectTopic,
  headerStats,
  onSelectTrace,
  selectedTraceId,
  onOpenTrace,
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
  const setCamera = (camera: Camera | null, scope = selectedTopic) =>
    store.setState({ camera, scope });
  const cancelFlight = () => cancelAnimationFrame(animationRef.current);
  const flyTo = (target: Camera, scope: string | null, fit = false) => {
    cancelFlight();
    const start = getCamera();
    if (store.getState().reducedMotion) {
      setCamera(fit ? null : target, scope);
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 320);
      const t = 1 - (1 - progress) ** 3;
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
    const zone = model.zones.find((item) => item.id === id);
    flyTo(
      fitCamera(zone?.bounds ?? model.bounds, model.bounds, size),
      id,
      true,
    );
    onSelectTopic(id);
  };
  const fitSelection = () =>
    flyTo(
      fitCamera(selectedZone?.bounds ?? model.bounds, model.bounds, size),
      selectedTopic,
      true,
    );
  const zoom = (levels: number, anchor = { x: 0.5, y: 0.5 }) =>
    setCamera(zoomCamera(getCamera(), levels, anchor, model.bounds, size));
  const focusTrace = (id: string) => {
    const point = model.pointById.get(id);
    if (!point) return;
    onSelectTrace(id);
    const targetZoom = Math.max(4, getCamera().zoom);
    const position = displayedWorldPoint(
      point,
      targetZoom,
      model.bounds,
      size,
      selectedTopic,
    );
    flyTo({ ...position, zoom: targetZoom }, selectedTopic);
  };
  const gestures = usePanZoomGestures({
    target: stageRef,
    onPan: (dx, dy) =>
      setCamera(panCamera(getCamera(), dx, dy, model.bounds, size)),
    onZoom: zoom,
    onInteractionStart: () => {
      cancelFlight();
      store.setState({ hoveredId: null, hoveredZoneId: null });
    },
  });
  // Browser fullscreen and OS motion preferences are external subscriptions.
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () =>
      store.setState({
        reducedMotion: motion.matches,
        ...(motion.matches && {
          pointer: { x: 0, y: 0 },
          hoveredId: null,
          hoveredZoneId: null,
        }),
      });
    const updateFullscreen = () =>
      store.setState({
        isFullscreen: document.fullscreenElement === sectionRef.current,
      });
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
        fullscreen && "h-dvh rounded-none border-0",
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h4 className="text-sm font-bold">Topics explorer</h4>
            {headerStats}
          </div>
          <p className="text-muted-foreground text-xs">
            Explore a topic cloud. Zoom closer to read the traces behind it.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            text="All topics"
            variant={selectedTopic === null ? "secondary" : "ghost"}
            size="sm"
            onClick={() => chooseZone(null)}
          />
          <IconButton
            icon={LocateFixed}
            label="Fit map (0)"
            onClick={fitSelection}
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
      </header>
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
          "bg-muted/10 focus-visible:ring-ring relative min-h-[340px] w-full overflow-hidden overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset",
          fullscreen ? "min-h-0 flex-1" : "h-[clamp(380px,64vh,820px)]",
          gestures.isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ touchAction: "none" }}
        {...gestures.pointerHandlers}
        onPointerMove={(event) => {
          gestures.pointerHandlers.onPointerMove(event);
          if (gestures.isDragging || event.pointerType !== "mouse") return;
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
          const hovered = hitPoint(
            model,
            getCamera(),
            size,
            pointer,
            at,
            selectedTopic,
          );
          const label =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>("[data-topic-zone]")
              : null;
          const traceLabel =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>("[data-topic-trace]")
              : null;
          store.setState({
            pointer,
            hoveredId:
              traceLabel?.dataset.topicTrace ??
              (label ? null : (hovered?.traceId ?? null)),
            hoveredZoneId:
              label?.dataset.topicZone ??
              hovered?.groupId ??
              hitZone(model, getCamera(), size, at)?.id ??
              null,
          });
        }}
        onPointerLeave={() =>
          store.setState({
            pointer: { x: 0, y: 0 },
            hoveredId: null,
            hoveredZoneId: null,
          })
        }
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const point = hitPoint(
            model,
            getCamera(),
            size,
            store.getState().pointer,
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
            selectedTopic,
          );
          onSelectTrace(point?.traceId ?? null);
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
            else if (event.key === "0" || event.key === "Home") fitSelection();
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
          initialCamera={initialCamera}
          selectedTopic={selectedTopic}
          selectedTraceId={selectedTraceId}
          onSelectZone={chooseZone}
          onSelectTrace={onSelectTrace}
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
          <span>Drag / scroll to pan · Pinch / Ctrl or ⌘ + scroll to zoom</span>
        </div>
      </div>
      <MapInspector
        model={model}
        store={store}
        selectedTopic={selectedTopic}
        selectedTraceId={selectedTraceId}
        onSelectZone={chooseZone}
        onSelectTrace={focusTrace}
        onClearTrace={() => onSelectTrace(null)}
        onOpenTrace={(id) => {
          openTrace(id);
        }}
      />
      {(data.unpositionedCount > 0 || data.missingSummaryCount > 0) && (
        <p className="text-muted-foreground shrink-0 border-t px-4 py-2 text-xs">
          {data.unpositionedCount > 0 &&
            `${data.unpositionedCount.toLocaleString()} current summaries have no saved coordinates; they remain in the list below. `}
          {data.missingSummaryCount > 0 &&
            `${data.missingSummaryCount.toLocaleString()} original summaries are no longer available.`}
        </p>
      )}
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
      {readingLayoutBlend(current.zoom) > 0
        ? "Reading layout"
        : "Saved 2D projection"}
    </span>
  );
}

function MapLabels({
  model,
  size,
  store,
  initialCamera,
  selectedTopic,
  selectedTraceId,
  onSelectZone,
  onSelectTrace,
}: {
  model: TopicMapModel;
  size: Size;
  store: TopicMapStore;
  initialCamera: Camera;
  selectedTopic: string | null;
  selectedTraceId: string | null;
  onSelectZone: (id: string) => void;
  onSelectTrace: (id: string) => void;
}) {
  const camera = useStore(store, (s) => s.camera);
  const scope = useStore(store, (s) => s.scope);
  const pointer = useStore(store, (s) => s.pointer);
  const hoveredZoneId = useStore(store, (s) => s.hoveredZoneId);
  const hoveredId = useStore(store, (s) => s.hoveredId);
  const currentCamera =
    scope === selectedTopic && camera ? camera : initialCamera;
  const labels = prepareMapLabels(
    model,
    currentCamera,
    size,
    pointer,
    selectedTraceId,
    hoveredZoneId,
    hoveredId,
    selectedTopic,
  );
  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        {labels.zones.map((zone) => (
          <line
            key={zone.id}
            x1={zone.position.x}
            y1={zone.position.y}
            x2={zone.label.x + zone.label.width / 2}
            y2={zone.label.y + zone.label.height / 2}
            stroke={zone.color}
            strokeOpacity={0.25}
            strokeWidth={1}
          />
        ))}
      </svg>
      {labels.zones.map((zone) => (
        <button
          key={zone.id}
          type="button"
          data-topic-zone={zone.id}
          data-testid="topic-map-zone-card"
          onClick={() => onSelectZone(zone.id)}
          className={cn(
            "bg-background/85 hover:bg-background focus-visible:outline-ring pointer-events-auto absolute flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md px-2.5 py-1.5 text-center shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-2",
            selectedTopic === zone.id && "ring-1 ring-current",
          )}
          style={{
            left: zone.label.x,
            top: zone.label.y,
            width: zone.label.width,
            height: zone.label.height,
            color: zone.color,
          }}
          aria-pressed={selectedTopic === zone.id}
          aria-label={`Explore ${zone.name}, ${zone.countLabel}`}
        >
          <span className="line-clamp-2 shrink-0 text-xs font-bold">
            {zone.name}
          </span>
          <span className="text-muted-foreground shrink-0 text-[10px] whitespace-nowrap">
            {zone.countLabel} · {zone.shareLabel}
          </span>
          {zone.detail && (
            <span className="text-foreground line-clamp-2 shrink-0 text-left text-[11px] leading-relaxed">
              {zone.detail}
            </span>
          )}
        </button>
      ))}
      {labels.traces.map(({ point, card, excerpt, reading }) => (
        <button
          key={point.traceId}
          type="button"
          data-topic-trace={point.traceId}
          data-trace-id={point.traceId}
          data-testid="topic-map-trace-card"
          data-hovered={point.traceId === hoveredId}
          aria-pressed={point.traceId === selectedTraceId}
          onClick={() => onSelectTrace(point.traceId)}
          className={cn(
            "bg-background/90 hover:bg-background focus-visible:outline-ring pointer-events-auto absolute w-48 cursor-pointer rounded-md border px-2.5 py-2 text-left leading-relaxed shadow-sm backdrop-blur-sm focus-visible:outline-2",
            reading ? "text-xs" : "text-[11px]",
            (point.traceId === selectedTraceId ||
              point.traceId === hoveredId) &&
              "border-primary ring-primary ring-1",
          )}
          style={{
            left: card.x,
            top: card.y,
            width: card.width,
            height: card.height,
            borderLeftColor: point.color,
            borderLeftWidth: 2,
          }}
          aria-label={`Select trace: ${point.summary}`}
        >
          <span
            className={card.height >= 110 ? "line-clamp-6" : "line-clamp-3"}
          >
            {excerpt}
          </span>
        </button>
      ))}
    </div>
  );
}

function MapInspector({
  model,
  store,
  selectedTopic,
  selectedTraceId,
  onSelectZone,
  onSelectTrace,
  onClearTrace,
  onOpenTrace,
}: {
  model: TopicMapModel;
  store: TopicMapStore;
  selectedTopic: string | null;
  selectedTraceId: string | null;
  onSelectZone: (id: string) => void;
  onSelectTrace: (id: string) => void;
  onClearTrace: () => void;
  onOpenTrace: (id: string) => void;
}) {
  const hoveredId = useStore(store, (s) => s.hoveredId);
  const hoveredZoneId = useStore(store, (s) => s.hoveredZoneId);
  const activeId = selectedTraceId ?? hoveredId;
  const active = activeId ? model.pointById.get(activeId) : undefined;
  const zone = model.zones.find(
    (z) => z.id === (active?.groupId ?? selectedTopic ?? hoveredZoneId),
  );
  const browsePoints = selectedTopic
    ? (model.zones.find((item) => item.id === selectedTopic)?.points ?? [])
    : model.points;
  const traceIndex = browsePoints.findIndex(
    (point) => point.traceId === activeId,
  );
  const browse = (direction: number) => {
    const nextIndex =
      traceIndex < 0
        ? 0
        : (traceIndex + direction + browsePoints.length) % browsePoints.length;
    const point = browsePoints[nextIndex];
    if (point) onSelectTrace(point.traceId);
  };
  return (
    <div
      className="bg-background flex max-h-60 min-h-28 shrink-0 flex-col gap-2 overflow-y-auto border-t px-4 py-3"
      aria-label="Map details"
    >
      {(() => {
        if (active)
          return (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="cursor-pointer text-xs font-bold hover:underline"
                  style={{ color: zone?.color }}
                  onClick={() => zone && onSelectZone(zone.id)}
                >
                  {zone?.name ?? "Trace summary"}
                </button>
                <div className="flex items-center gap-1">
                  <Button
                    text="Open trace"
                    icon={Expand}
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenTrace(active.traceId)}
                  />
                  {selectedTraceId && (
                    <IconButton
                      icon={X}
                      label="Clear selected trace"
                      size="sm"
                      onClick={onClearTrace}
                    />
                  )}
                </div>
              </div>
              <p className="max-w-5xl text-sm whitespace-pre-wrap">
                {active.summary}
              </p>
              <p
                className="text-muted-foreground truncate text-[10px]"
                title={active.traceId}
              >
                {active.traceId}
              </p>
            </>
          );
        if (zone)
          return (
            <>
              <div className="flex flex-wrap items-baseline gap-2">
                <h5 className="text-sm font-bold" style={{ color: zone.color }}>
                  {zone.name}
                </h5>
                <span className="text-muted-foreground text-xs">
                  {zone.countLabel} · {zone.shareLabel}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                {zone.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {zone.points.slice(0, 3).map((point) => (
                  <button
                    key={point.traceId}
                    type="button"
                    onClick={() => onSelectTrace(point.traceId)}
                    className="bg-muted/20 hover:bg-muted/50 max-w-80 flex-1 cursor-pointer rounded-md border p-2 text-left text-xs"
                  >
                    <span className="line-clamp-2">{point.summary}</span>
                  </button>
                ))}
              </div>
            </>
          );
        return (
          <>
            <p className="text-muted-foreground text-xs">
              Choose a topic to enter its cloud, or a dot to inspect a trace.
              More summaries appear as you zoom.
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {model.zones.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectZone(item.id)}
                  aria-label={`Explore ${item.name}, ${item.countLabel}`}
                  className="flex cursor-pointer items-center gap-1.5 py-1 text-xs hover:underline"
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {item.points.length}
                  </span>
                </button>
              ))}
            </div>
          </>
        );
      })()}
      {browsePoints.length > 0 && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t pt-2">
          <span className="text-muted-foreground text-xs tabular-nums">
            {traceIndex < 0
              ? `${browsePoints.length.toLocaleString()} traces to explore`
              : `Trace ${(traceIndex + 1).toLocaleString()} of ${browsePoints.length.toLocaleString()}`}
          </span>
          <IconButton
            icon={ChevronLeft}
            label="Previous trace"
            size="sm"
            onClick={() => browse(-1)}
          />
          <IconButton
            icon={ChevronRight}
            label="Next trace"
            size="sm"
            onClick={() => browse(1)}
          />
        </div>
      )}
    </div>
  );
}

export const __test = { fitMapPoints };
