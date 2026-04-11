import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutLine,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import { useRef, useSyncExternalStore, type RefCallback } from "react";

const PROMPT_PREVIEW_ELLIPSIS = "...";
const PROMPT_PREVIEW_WIDTH_BUFFER_PX = 6;
const promptPreviewStart = {
  graphemeIndex: 0,
  segmentIndex: 0,
};
const emptyPromptPreviewMetrics = {
  font: "",
  width: 0,
};
const preparedPreviewCache = new Map<string, PreparedTextWithSegments>();

type SpielwiesePromptPreviewMetrics = typeof emptyPromptPreviewMetrics;

function getPreviewCacheKey(text: string, font: string) {
  return `${font}\u0000${text}`;
}

function getPreparedPreviewText(text: string, font: string) {
  const cacheKey = getPreviewCacheKey(text, font);
  const cachedPreview = preparedPreviewCache.get(cacheKey);

  if (cachedPreview) {
    return cachedPreview;
  }

  const preparedPreview = prepareWithSegments(text, font);
  preparedPreviewCache.set(cacheKey, preparedPreview);
  return preparedPreview;
}

function supportsPretextMeasurement() {
  if (typeof OffscreenCanvas !== "undefined") {
    return true;
  }

  if (
    typeof document === "undefined" ||
    (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom"))
  ) {
    return false;
  }

  try {
    return document.createElement("canvas").getContext("2d") !== null;
  } catch {
    return false;
  }
}

function getPreviewWidth(width: number) {
  return Math.max(Math.floor(width) - PROMPT_PREVIEW_WIDTH_BUFFER_PX, 0);
}

function getPromptPreviewFont(node: HTMLElement) {
  const computedStyle = window.getComputedStyle(node);

  return (
    computedStyle.font ||
    `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`
  ).trim();
}

function getOverflowPreviewLine(
  preparedValue: PreparedTextWithSegments,
  previewWidth: number,
  font: string,
) {
  const preparedEllipsis = getPreparedPreviewText(
    PROMPT_PREVIEW_ELLIPSIS,
    font,
  );
  const ellipsisLine = layoutNextLine(
    preparedEllipsis,
    promptPreviewStart,
    previewWidth,
  );

  return layoutNextLine(
    preparedValue,
    promptPreviewStart,
    Math.max(previewWidth - (ellipsisLine?.width ?? 0), 0),
  );
}

function formatOverflowPreviewLine(truncatedLine: LayoutLine | null) {
  const truncatedValue = truncatedLine?.text.trimEnd() ?? "";

  return truncatedValue
    ? `${truncatedValue}${PROMPT_PREVIEW_ELLIPSIS}`
    : PROMPT_PREVIEW_ELLIPSIS;
}

function createPromptPreviewMetricStore() {
  const listeners = new Set<() => void>();
  let node: HTMLSpanElement | null = null;
  let observer: ResizeObserver | null = null;
  let snapshot = emptyPromptPreviewMetrics;

  const emitChange = () => listeners.forEach((listener) => listener());
  const disconnect = () => observer?.disconnect();
  const updateSnapshot = () => {
    if (!node) {
      snapshot = emptyPromptPreviewMetrics;
      emitChange();
      return;
    }

    const nextSnapshot = {
      font: getPromptPreviewFont(node),
      width: node.getBoundingClientRect().width,
    };

    if (
      snapshot.font === nextSnapshot.font &&
      snapshot.width === nextSnapshot.width
    ) {
      return;
    }

    snapshot = nextSnapshot;
    emitChange();
  };

  return {
    getSnapshot: () => snapshot,
    setNode: (nextNode: HTMLSpanElement | null) => {
      if (node === nextNode) {
        return;
      }

      disconnect();
      observer = null;
      node = nextNode;
      updateSnapshot();

      if (!node || typeof ResizeObserver === "undefined") {
        return;
      }

      observer = new ResizeObserver(() => updateSnapshot());
      observer.observe(node);
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function getCollapsedPreviewLine(
  normalizedValue: string,
  metrics: SpielwiesePromptPreviewMetrics,
) {
  if (!supportsPretextMeasurement() || !metrics.font) {
    return normalizedValue;
  }

  const previewWidth = getPreviewWidth(metrics.width);

  if (previewWidth <= 0) {
    return normalizedValue;
  }

  const preparedValue = getPreparedPreviewText(normalizedValue, metrics.font);
  const fittedLine = layoutNextLine(
    preparedValue,
    promptPreviewStart,
    previewWidth,
  );

  if (!fittedLine || fittedLine.text === normalizedValue) {
    return fittedLine?.text ?? normalizedValue;
  }

  return formatOverflowPreviewLine(
    getOverflowPreviewLine(preparedValue, previewWidth, metrics.font),
  );
}

export function normalizeSpielwiesePromptPreviewText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function getSpielwiesePromptPreviewText(
  value: string,
  metrics: SpielwiesePromptPreviewMetrics,
) {
  const normalizedValue = normalizeSpielwiesePromptPreviewText(value);

  if (!normalizedValue) {
    return "";
  }

  try {
    return getCollapsedPreviewLine(normalizedValue, metrics);
  } catch {
    return normalizedValue;
  }
}

export function useSpielwiesePromptPreviewMetrics(): {
  metrics: SpielwiesePromptPreviewMetrics;
  setNode: RefCallback<HTMLSpanElement>;
} {
  const metricStoreRef = useRef<ReturnType<
    typeof createPromptPreviewMetricStore
  > | null>(null);

  if (!metricStoreRef.current) {
    metricStoreRef.current = createPromptPreviewMetricStore();
  }

  const metrics = useSyncExternalStore(
    metricStoreRef.current.subscribe,
    metricStoreRef.current.getSnapshot,
    () => emptyPromptPreviewMetrics,
  );

  return {
    metrics,
    setNode: metricStoreRef.current.setNode,
  };
}
