import { createStore } from "zustand/vanilla";
import type { Camera } from "./prepare-topic-map";

export function createTopicMapStore() {
  return createStore(() => ({
    camera: null as Camera | null,
    scope: null as string | null,
    pointer: { x: 0, y: 0 },
    hoveredId: null as string | null,
    hoveredZoneId: null as string | null,
    isFullscreen: false,
    reducedMotion: true,
    fullscreenError: false,
  }));
}
export type TopicMapStore = ReturnType<typeof createTopicMapStore>;
