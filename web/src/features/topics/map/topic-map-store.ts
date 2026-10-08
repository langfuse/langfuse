import { createStore } from "zustand/vanilla";
import type { Camera, TopicMapNodeFrame } from "./prepare-topic-map";

type PointerPosition = { x: number; y: number };
type HoverLabel = {
  kind: "trace" | "zone";
  id: string;
  token: number;
  active: boolean;
  frame: TopicMapNodeFrame | null;
};

export function createTopicMapStore() {
  return createStore(() => ({
    camera: null as Camera | null,
    scope: null as string | null,
    pointer: { x: 0, y: 0 },
    // Client coordinates distinguish physical movement from layout-driven events.
    pointerAt: null as PointerPosition | null,
    frame: null as TopicMapNodeFrame | null,
    isMoving: false,
    hoverFrame: null as TopicMapNodeFrame | null,
    hoveredId: null as string | null,
    hoveredZoneId: null as string | null,
    hoverLabels: [] as HoverLabel[],
    hoverToken: 0,
    isFullscreen: false,
    reducedMotion: true,
    fullscreenError: false,
  }));
}
export type TopicMapStore = ReturnType<typeof createTopicMapStore>;

export function publishTopicMapFrame(
  store: TopicMapStore,
  frame: TopicMapNodeFrame,
  isMoving = false,
) {
  store.setState((state) => {
    const invalid =
      isMoving ||
      (state.hoverFrame !== null && !sameFrameContext(state.hoverFrame, frame));
    return {
      frame,
      isMoving,
      ...(invalid && {
        hoveredId: null,
        hoveredZoneId: null,
        hoverFrame: null,
        hoverLabels: state.hoverLabels.map((label) =>
          label.active ? { ...label, active: false } : label,
        ),
      }),
    };
  });
}

export function setTopicMapHover(
  store: TopicMapStore,
  hoveredId: string | null,
  hoveredZoneId: string | null,
  pointer?: PointerPosition,
  pointerAt?: PointerPosition | null,
) {
  store.setState((state) => {
    let label: Pick<HoverLabel, "kind" | "id"> | null = null;
    if (hoveredId) label = { kind: "trace", id: hoveredId };
    else if (hoveredZoneId) label = { kind: "zone", id: hoveredZoneId };
    const active = state.hoverLabels.find((item) => item.active);
    const changed = active?.kind !== label?.kind || active?.id !== label?.id;
    let hoverLabels = state.hoverLabels;
    let hoverToken = state.hoverToken;
    if (changed) {
      hoverLabels = hoverLabels
        .filter((item) => item.kind !== label?.kind || item.id !== label?.id)
        .map((item) => ({ ...item, active: false }));
      if (label)
        hoverLabels.push({
          ...label,
          token: ++hoverToken,
          active: true,
          frame: state.frame,
        });
      hoverLabels = hoverLabels.slice(-4);
    }
    if (
      !changed &&
      state.hoveredId === hoveredId &&
      state.hoveredZoneId === hoveredZoneId &&
      pointer === undefined &&
      pointerAt === undefined
    )
      return state;
    return {
      hoveredId,
      hoveredZoneId,
      hoverLabels,
      hoverToken,
      hoverFrame: label ? state.frame : null,
      ...(pointer !== undefined && { pointer }),
      ...(pointerAt !== undefined && { pointerAt }),
    };
  });
}

export function clearTopicMapHover(store: TopicMapStore) {
  setTopicMapHover(store, null, null);
}

export function finishTopicMapHover(store: TopicMapStore, token: number) {
  store.setState((state) => {
    if (!state.hoverLabels.some((item) => item.token === token)) return state;
    return {
      hoverLabels: state.hoverLabels.filter((item) => item.token !== token),
    };
  });
}

export function getTopicMapHover(
  state: ReturnType<TopicMapStore["getState"]>,
  frame: TopicMapNodeFrame | null,
) {
  const valid = !state.isMoving && sameFrameContext(state.hoverFrame, frame);
  return {
    hoveredId: valid ? state.hoveredId : null,
    hoveredZoneId: valid ? state.hoveredZoneId : null,
  };
}

function sameFrameContext(
  captured: TopicMapNodeFrame | null,
  frame: TopicMapNodeFrame | null,
) {
  return (
    captured !== null &&
    frame !== null &&
    captured.model === frame.model &&
    captured.camera.x === frame.camera.x &&
    captured.camera.y === frame.camera.y &&
    captured.camera.zoom === frame.camera.zoom &&
    captured.size.width === frame.size.width &&
    captured.size.height === frame.size.height &&
    captured.readingTopic === frame.readingTopic
  );
}
