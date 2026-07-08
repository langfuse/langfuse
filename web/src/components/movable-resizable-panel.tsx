"use client";
import {
  type CSSProperties,
  type ForwardedRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type MovableResizablePanelPosition = {
  left: number;
  top: number;
};

export type MovableResizablePanelSize = {
  width: number;
  height: number;
};

export type MovableResizablePanelGeometry = {
  position: MovableResizablePanelPosition;
  size: MovableResizablePanelSize;
};

type ResizeDirection =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

type Interaction =
  | {
      type: "move";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startPosition: MovableResizablePanelPosition;
      startSize: MovableResizablePanelSize;
    }
  | {
      type: "resize";
      direction: ResizeDirection;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startPosition: MovableResizablePanelPosition;
      startSize: MovableResizablePanelSize;
    };

export type MovableResizablePanelSizeConstraints = {
  maxHeight: number;
  maxWidth: number;
  minHeight: number;
  minWidth: number;
};

export type MovableResizablePanelViewportBounds = {
  minLeft: number;
  minTop: number;
  maxRight: number;
  maxBottom: number;
};

export type MovableResizablePanelResizeContext = {
  bounds: MovableResizablePanelViewportBounds;
  constraints: MovableResizablePanelSizeConstraints;
};

export type MovableResizablePanelHandle = {
  clampGeometry: (
    geometry: MovableResizablePanelGeometry,
  ) => MovableResizablePanelGeometry;
  geometry: MovableResizablePanelGeometry | null;
  getResizeContext: () => MovableResizablePanelResizeContext;
  getGeometry: () => MovableResizablePanelGeometry;
  keepGeometryWithinBounds: () => void;
  initializeGeometry: () => void;
  resetGeometry: () => void;
  clearGeometry: () => void;
  setGeometry: (geometry: MovableResizablePanelGeometry) => void;
};

type MovableResizablePanelProps = {
  children: ReactNode;
  className?: string;
  handle: MovableResizablePanelHandle;
  dragHandleSelector: string;
  ignoreOutsideInteraction?: boolean;
  style?: CSSProperties;
};

const DEFAULT_BOUNDS_PADDING = 8;

export function useMovableResizablePanelControl({
  boundsPadding = DEFAULT_BOUNDS_PADDING,
  getInitialGeometry,
  maxSize,
  minSize,
}: {
  boundsPadding?: number;
  getInitialGeometry: () => MovableResizablePanelGeometry;
  maxSize?: MovableResizablePanelSize;
  minSize: MovableResizablePanelSize;
}) {
  const [geometry, setGeometry] =
    useState<MovableResizablePanelGeometry | null>(null);

  const clampGeometry = useCallback(
    (geometry: MovableResizablePanelGeometry) =>
      clampPanelBounds({
        boundsPadding,
        maxSize,
        minSize,
        position: geometry.position,
        size: geometry.size,
      }),
    [boundsPadding, maxSize, minSize],
  );

  const getResizeContext = useCallback(
    () => ({
      bounds: getViewportBounds(boundsPadding),
      constraints: getPanelSizeConstraints({
        boundsPadding,
        maxSize,
        minSize,
      }),
    }),
    [boundsPadding, maxSize, minSize],
  );

  const getGeometry = useCallback(
    () => clampGeometry(geometry ?? getInitialGeometry()),
    [clampGeometry, geometry, getInitialGeometry],
  );

  const keepGeometryWithinBounds = useCallback(() => {
    const currentGeometry = geometry ?? getInitialGeometry();
    const nextGeometry = clampGeometry(currentGeometry);

    if (arePanelsEqual(currentGeometry, nextGeometry)) {
      return;
    }

    setGeometry(nextGeometry);
  }, [clampGeometry, geometry, getInitialGeometry]);

  const initializeGeometry = useCallback(() => {
    if (geometry) {
      return;
    }

    const nextGeometry = clampGeometry(getInitialGeometry());

    setGeometry(nextGeometry);
  }, [clampGeometry, geometry, getInitialGeometry]);

  const resetGeometry = useCallback(() => {
    const nextGeometry = clampGeometry(getInitialGeometry());

    setGeometry(nextGeometry);
  }, [clampGeometry, getInitialGeometry]);

  const clearGeometry = useCallback(() => {
    setGeometry(null);
  }, []);

  const setGeometryValue = useCallback(
    (geometry: MovableResizablePanelGeometry) => {
      const nextGeometry = clampGeometry(geometry);

      setGeometry(nextGeometry);
    },
    [clampGeometry],
  );

  return useMemo<MovableResizablePanelHandle>(
    () => ({
      clampGeometry,
      geometry,
      getResizeContext,
      getGeometry,
      keepGeometryWithinBounds,
      initializeGeometry,
      resetGeometry,
      clearGeometry,
      setGeometry: setGeometryValue,
    }),
    [
      clampGeometry,
      clearGeometry,
      geometry,
      getGeometry,
      getResizeContext,
      initializeGeometry,
      keepGeometryWithinBounds,
      resetGeometry,
      setGeometryValue,
    ],
  );
}

const RESIZE_HANDLE_SIZE_PX = 10;
const IGNORE_DRAG_TARGET_SELECTOR =
  "[data-movable-resizable-panel-ignore-drag='true']";

const resizeDirections: ResizeDirection[] = [
  "top",
  "right",
  "bottom",
  "left",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function getViewportBounds(
  boundsPadding: number,
): MovableResizablePanelViewportBounds {
  if (typeof window === "undefined") {
    return {
      minLeft: boundsPadding,
      minTop: boundsPadding,
      maxRight: Number.POSITIVE_INFINITY,
      maxBottom: Number.POSITIVE_INFINITY,
    };
  }

  return {
    minLeft: boundsPadding,
    minTop: boundsPadding,
    maxRight: window.innerWidth - boundsPadding,
    maxBottom: window.innerHeight - boundsPadding,
  };
}

function getPanelSizeConstraints({
  boundsPadding,
  maxSize,
  minSize,
}: {
  boundsPadding: number;
  maxSize?: MovableResizablePanelSize;
  minSize: MovableResizablePanelSize;
}): MovableResizablePanelSizeConstraints {
  const bounds = getViewportBounds(boundsPadding);
  const viewportMaxWidth = bounds.maxRight - bounds.minLeft;
  const viewportMaxHeight = bounds.maxBottom - bounds.minTop;

  return {
    maxHeight: Math.max(
      minSize.height,
      Math.min(maxSize?.height ?? viewportMaxHeight, viewportMaxHeight),
    ),
    maxWidth: Math.max(
      minSize.width,
      Math.min(maxSize?.width ?? viewportMaxWidth, viewportMaxWidth),
    ),
    minHeight: minSize.height,
    minWidth: minSize.width,
  };
}

function clampPanelBounds({
  boundsPadding,
  maxSize,
  minSize,
  position,
  size,
}: {
  boundsPadding: number;
  maxSize?: MovableResizablePanelSize;
  minSize: MovableResizablePanelSize;
  position: MovableResizablePanelPosition;
  size: MovableResizablePanelSize;
}) {
  const bounds = getViewportBounds(boundsPadding);
  const constraints = getPanelSizeConstraints({
    boundsPadding,
    maxSize,
    minSize,
  });
  const width = clamp(size.width, constraints.minWidth, constraints.maxWidth);
  const height = clamp(
    size.height,
    constraints.minHeight,
    constraints.maxHeight,
  );
  const left = clamp(position.left, bounds.minLeft, bounds.maxRight - width);
  const top = clamp(position.top, bounds.minTop, bounds.maxBottom - height);

  return {
    position: { left, top },
    size: { width, height },
  };
}

function arePositionsEqual(
  first: MovableResizablePanelPosition,
  second: MovableResizablePanelPosition,
) {
  return first.left === second.left && first.top === second.top;
}

function areSizesEqual(
  first: MovableResizablePanelSize,
  second: MovableResizablePanelSize,
) {
  return first.width === second.width && first.height === second.height;
}

function arePanelsEqual(
  first: MovableResizablePanelGeometry,
  second: MovableResizablePanelGeometry,
) {
  return (
    arePositionsEqual(first.position, second.position) &&
    areSizesEqual(first.size, second.size)
  );
}

function getMovedPanel(
  interaction: Extract<Interaction, { type: "move" }>,
  clientX: number,
  clientY: number,
) {
  return {
    position: {
      left: interaction.startPosition.left + clientX - interaction.startClientX,
      top: interaction.startPosition.top + clientY - interaction.startClientY,
    },
    size: interaction.startSize,
  };
}

function getPointerCoordinates(event: ReactPointerEvent<HTMLDivElement>) {
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
    return null;
  }

  return { clientX: event.clientX, clientY: event.clientY };
}

function isIgnoredDragTarget(target: EventTarget | null) {
  return (
    target instanceof Element && target.closest(IGNORE_DRAG_TARGET_SELECTOR)
  );
}

function getResizedPanel(
  interaction: Extract<Interaction, { type: "resize" }>,
  clientX: number,
  clientY: number,
  constraints: MovableResizablePanelSizeConstraints,
  bounds: MovableResizablePanelViewportBounds,
) {
  const deltaX = clientX - interaction.startClientX;
  const deltaY = clientY - interaction.startClientY;
  const nextPosition = { ...interaction.startPosition };
  const nextSize = { ...interaction.startSize };
  const maxWidth = interaction.direction.includes("left")
    ? Math.min(
        constraints.maxWidth,
        interaction.startPosition.left +
          interaction.startSize.width -
          bounds.minLeft,
      )
    : interaction.direction.includes("right")
      ? Math.min(
          constraints.maxWidth,
          bounds.maxRight - interaction.startPosition.left,
        )
      : constraints.maxWidth;
  const maxHeight = interaction.direction.includes("top")
    ? Math.min(
        constraints.maxHeight,
        interaction.startPosition.top +
          interaction.startSize.height -
          bounds.minTop,
      )
    : interaction.direction.includes("bottom")
      ? Math.min(
          constraints.maxHeight,
          bounds.maxBottom - interaction.startPosition.top,
        )
      : constraints.maxHeight;

  if (interaction.direction.includes("right")) {
    nextSize.width = clamp(
      interaction.startSize.width + deltaX,
      constraints.minWidth,
      maxWidth,
    );
  }

  if (interaction.direction.includes("left")) {
    nextSize.width = clamp(
      interaction.startSize.width - deltaX,
      constraints.minWidth,
      maxWidth,
    );
    nextPosition.left =
      interaction.startPosition.left +
      interaction.startSize.width -
      nextSize.width;
  }

  if (interaction.direction.includes("bottom")) {
    nextSize.height = clamp(
      interaction.startSize.height + deltaY,
      constraints.minHeight,
      maxHeight,
    );
  }

  if (interaction.direction.includes("top")) {
    nextSize.height = clamp(
      interaction.startSize.height - deltaY,
      constraints.minHeight,
      maxHeight,
    );
    nextPosition.top =
      interaction.startPosition.top +
      interaction.startSize.height -
      nextSize.height;
  }

  return {
    position: nextPosition,
    size: nextSize,
  };
}

function getResizeHandleStyle(direction: ResizeDirection): CSSProperties {
  const style: CSSProperties = {
    position: "absolute",
    touchAction: "none",
  };

  if (direction.includes("top")) {
    style.top = -RESIZE_HANDLE_SIZE_PX / 2;
    style.height = RESIZE_HANDLE_SIZE_PX;
  }

  if (direction.includes("bottom")) {
    style.bottom = -RESIZE_HANDLE_SIZE_PX / 2;
    style.height = RESIZE_HANDLE_SIZE_PX;
  }

  if (direction.includes("left")) {
    style.left = -RESIZE_HANDLE_SIZE_PX / 2;
    style.width = RESIZE_HANDLE_SIZE_PX;
  }

  if (direction.includes("right")) {
    style.right = -RESIZE_HANDLE_SIZE_PX / 2;
    style.width = RESIZE_HANDLE_SIZE_PX;
  }

  if (direction === "top" || direction === "bottom") {
    style.left = RESIZE_HANDLE_SIZE_PX / 2;
    style.right = RESIZE_HANDLE_SIZE_PX / 2;
    style.cursor = "ns-resize";
  }

  if (direction === "left" || direction === "right") {
    style.top = RESIZE_HANDLE_SIZE_PX / 2;
    style.bottom = RESIZE_HANDLE_SIZE_PX / 2;
    style.cursor = "ew-resize";
  }

  if (direction === "top-left" || direction === "bottom-right") {
    style.cursor = "nwse-resize";
  }

  if (direction === "top-right" || direction === "bottom-left") {
    style.cursor = "nesw-resize";
  }

  return style;
}

function assignForwardedRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

export const MovableResizablePanel = forwardRef<
  HTMLDivElement,
  MovableResizablePanelProps
>(function MovableResizablePanel(
  {
    children,
    className,
    dragHandleSelector,
    handle,
    ignoreOutsideInteraction = false,
    style,
  },
  forwardedRef,
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [draftPanel, setDraftPanel] =
    useState<MovableResizablePanelGeometry | null>(null);
  const renderedPanel = draftPanel ?? handle.getGeometry();
  const renderedPanelRef = useRef(renderedPanel);
  const draftPanelRef = useRef<MovableResizablePanelGeometry | null>(null);

  renderedPanelRef.current = renderedPanel;

  function handleMovePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (interactionRef.current) {
      return;
    }

    const panel = panelRef.current;
    const coordinates = getPointerCoordinates(event);
    const target = event.target instanceof Element ? event.target : null;
    const handle = target?.closest(dragHandleSelector);

    if (
      !panel ||
      !handle ||
      !panel.contains(handle) ||
      !coordinates ||
      isIgnoredDragTarget(target)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const { position, size } = renderedPanelRef.current;

    interactionRef.current = {
      type: "move",
      pointerId: event.pointerId,
      startClientX: coordinates.clientX,
      startClientY: coordinates.clientY,
      startPosition: position,
      startSize: size,
    };
    panelRef.current?.setPointerCapture(event.pointerId);
  }

  function handleResizePointerDown(
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (interactionRef.current) {
      return;
    }

    const coordinates = getPointerCoordinates(event);

    if (!coordinates) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const { position, size } = renderedPanelRef.current;

    interactionRef.current = {
      type: "resize",
      direction,
      pointerId: event.pointerId,
      startClientX: coordinates.clientX,
      startClientY: coordinates.clientY,
      startPosition: position,
      startSize: size,
    };
    panelRef.current?.setPointerCapture(event.pointerId);
  }

  function handleMovePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    const coordinates = getPointerCoordinates(event);

    if (
      !interaction ||
      interaction.pointerId !== event.pointerId ||
      !coordinates
    ) {
      return;
    }

    const { bounds, constraints } = handle.getResizeContext();

    const nextUnclampedPanel =
      interaction.type === "move"
        ? getMovedPanel(interaction, coordinates.clientX, coordinates.clientY)
        : getResizedPanel(
            interaction,
            coordinates.clientX,
            coordinates.clientY,
            constraints,
            bounds,
          );

    const nextPanel = handle.clampGeometry(nextUnclampedPanel);

    draftPanelRef.current = nextPanel;
    setDraftPanel(nextPanel);
  }

  function handleMoveStop(event: ReactPointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;

    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    const finalPanel = draftPanelRef.current ?? renderedPanelRef.current;

    interactionRef.current = null;
    draftPanelRef.current = null;
    setDraftPanel(null);
    panelRef.current?.releasePointerCapture(event.pointerId);
    handle.setGeometry(finalPanel);
  }

  useEffect(() => {
    function keepPanelGeometryWithinBounds() {
      if (interactionRef.current) {
        return;
      }

      handle.keepGeometryWithinBounds();
    }

    window.addEventListener("resize", keepPanelGeometryWithinBounds);

    return () =>
      window.removeEventListener("resize", keepPanelGeometryWithinBounds);
  }, [handle]);

  return (
    <div
      ref={(node) => {
        panelRef.current = node;
        assignForwardedRef(forwardedRef, node);
      }}
      className={`fixed origin-top-left${className ? ` ${className}` : ""}`}
      data-ignore-outside-interaction={ignoreOutsideInteraction || undefined}
      data-testid="movable-resizable-panel"
      style={{
        left: renderedPanel.position.left,
        top: renderedPanel.position.top,
        width: renderedPanel.size.width,
        height: renderedPanel.size.height,
        ...style,
      }}
      onPointerDown={handleMovePointerDown}
      onPointerMove={handleMovePointerMove}
      onPointerUp={handleMoveStop}
      onPointerCancel={handleMoveStop}
    >
      {children}
      {resizeDirections.map((direction) => (
        <div
          key={direction}
          aria-hidden="true"
          data-resize-direction={direction}
          data-testid={`movable-resizable-panel-resize-${direction}`}
          style={getResizeHandleStyle(direction)}
          onPointerDown={(event) => handleResizePointerDown(direction, event)}
        />
      ))}
    </div>
  );
});
