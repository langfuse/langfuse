"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
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

type PanelSizeConstraints = {
  maxHeight: number;
  maxWidth: number;
  minHeight: number;
  minWidth: number;
};

type MovableResizablePanelProps = {
  children: ReactNode;
  className?: string;
  dragHandleSelector: string;
  maxSize?: MovableResizablePanelSize;
  minSize: MovableResizablePanelSize;
  panelRef?: RefObject<HTMLDivElement | null>;
  position: MovableResizablePanelPosition;
  size: MovableResizablePanelSize;
  boundsPadding?: number;
  ignoreOutsideInteraction?: boolean;
  isGeometryManaged?: boolean;
  isMovable?: boolean;
  isResizable?: boolean;
  style?: CSSProperties;
  zIndex?: number;
  onPositionChange: (position: MovableResizablePanelPosition) => void;
  onSizeChange: (size: MovableResizablePanelSize) => void;
};

export function useMovableResizablePanelGeometry({
  getInitialGeometry,
}: {
  getInitialGeometry: () => MovableResizablePanelGeometry;
}) {
  const [geometry, setGeometry] =
    useState<MovableResizablePanelGeometry | null>(null);

  const getGeometry = () => geometry ?? getInitialGeometry();
  const initializeGeometry = () => {
    setGeometry((currentGeometry) => currentGeometry ?? getInitialGeometry());
  };
  const resetGeometry = () => setGeometry(getInitialGeometry());
  const clearGeometry = () => setGeometry(null);
  const setPosition = (position: MovableResizablePanelPosition) => {
    setGeometry((currentGeometry) => ({
      position,
      size: currentGeometry?.size ?? getInitialGeometry().size,
    }));
  };
  const setSize = (size: MovableResizablePanelSize) => {
    setGeometry((currentGeometry) => ({
      position: currentGeometry?.position ?? getInitialGeometry().position,
      size,
    }));
  };

  return {
    geometry,
    getGeometry,
    initializeGeometry,
    resetGeometry,
    clearGeometry,
    setPosition,
    setSize,
  };
}

const DEFAULT_BOUNDS_PADDING = 8;
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

function getViewportBounds(boundsPadding: number) {
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
}): PanelSizeConstraints {
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
  constraints: PanelSizeConstraints,
  bounds: ReturnType<typeof getViewportBounds>,
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

export function MovableResizablePanel({
  boundsPadding = DEFAULT_BOUNDS_PADDING,
  children,
  className,
  dragHandleSelector,
  ignoreOutsideInteraction = false,
  isGeometryManaged = true,
  isMovable = true,
  isResizable = true,
  maxSize,
  minSize,
  panelRef: externalPanelRef,
  position,
  size,
  style,
  zIndex,
  onPositionChange,
  onSizeChange,
}: MovableResizablePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const maxSizeHeight = maxSize?.height;
  const maxSizeWidth = maxSize?.width;
  const minSizeHeight = minSize.height;
  const minSizeWidth = minSize.width;
  const [{ position: livePosition, size: liveSize }, setLivePanel] = useState(
    () =>
      clampPanelBounds({
        boundsPadding,
        maxSize,
        minSize,
        position,
        size,
      }),
  );
  const livePanelRef = useRef({ position: livePosition, size: liveSize });
  const onPositionChangeRef = useRef(onPositionChange);
  const onSizeChangeRef = useRef(onSizeChange);

  onPositionChangeRef.current = onPositionChange;
  onSizeChangeRef.current = onSizeChange;

  useEffect(() => {
    if (interactionRef.current) {
      return;
    }

    const nextPanel = clampPanelBounds({
      boundsPadding,
      maxSize:
        typeof maxSizeWidth === "number" && typeof maxSizeHeight === "number"
          ? { width: maxSizeWidth, height: maxSizeHeight }
          : undefined,
      minSize: { width: minSizeWidth, height: minSizeHeight },
      position,
      size,
    });

    livePanelRef.current = nextPanel;
    setLivePanel((currentPanel) =>
      arePanelsEqual(currentPanel, nextPanel) ? currentPanel : nextPanel,
    );
  }, [
    boundsPadding,
    maxSizeHeight,
    maxSizeWidth,
    minSizeHeight,
    minSizeWidth,
    position,
    size,
  ]);

  useEffect(() => {
    const handleResize = () => {
      if (interactionRef.current) {
        return;
      }

      const nextPanel = clampPanelBounds({
        boundsPadding,
        maxSize:
          typeof maxSizeWidth === "number" && typeof maxSizeHeight === "number"
            ? { width: maxSizeWidth, height: maxSizeHeight }
            : undefined,
        minSize: { width: minSizeWidth, height: minSizeHeight },
        position: livePanelRef.current.position,
        size: livePanelRef.current.size,
      });

      if (arePanelsEqual(livePanelRef.current, nextPanel)) {
        return;
      }

      livePanelRef.current = nextPanel;
      setLivePanel(nextPanel);
      onPositionChangeRef.current(nextPanel.position);
      onSizeChangeRef.current(nextPanel.size);
    };

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, [boundsPadding, maxSizeHeight, maxSizeWidth, minSizeHeight, minSizeWidth]);

  const startInteraction = (
    event: ReactPointerEvent<HTMLDivElement>,
    interaction: Interaction,
  ) => {
    const panel = panelRef.current;

    event.preventDefault();
    event.stopPropagation();
    interactionRef.current = interaction;
    panel?.setPointerCapture(event.pointerId);
  };

  const updateInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    const coordinates = getPointerCoordinates(event);

    if (
      !interaction ||
      interaction.pointerId !== event.pointerId ||
      !coordinates
    ) {
      return;
    }

    const nextPanel = clampPanelBounds({
      boundsPadding,
      maxSize,
      minSize,
      ...(interaction.type === "move"
        ? getMovedPanel(interaction, coordinates.clientX, coordinates.clientY)
        : getResizedPanel(
            interaction,
            coordinates.clientX,
            coordinates.clientY,
            getPanelSizeConstraints({ boundsPadding, maxSize, minSize }),
            getViewportBounds(boundsPadding),
          )),
    });

    livePanelRef.current = nextPanel;
    setLivePanel(nextPanel);
  };

  const stopInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;

    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    const finalPanel = livePanelRef.current;

    interactionRef.current = null;
    panelRef.current?.releasePointerCapture(event.pointerId);
    onPositionChange(finalPanel.position);
    onSizeChange(finalPanel.size);
  };

  return (
    <div
      ref={(node) => {
        panelRef.current = node;

        if (externalPanelRef) {
          externalPanelRef.current = node;
        }
      }}
      className={`fixed origin-top-left${className ? ` ${className}` : ""}`}
      data-ignore-outside-interaction={ignoreOutsideInteraction || undefined}
      data-testid="movable-resizable-panel"
      style={{
        ...(isGeometryManaged
          ? {
              left: livePosition.left,
              top: livePosition.top,
              width: liveSize.width,
              height: liveSize.height,
            }
          : null),
        zIndex,
        ...style,
      }}
      onPointerDown={(event) => {
        if (!isMovable || interactionRef.current) {
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

        startInteraction(event, {
          type: "move",
          pointerId: event.pointerId,
          startClientX: coordinates.clientX,
          startClientY: coordinates.clientY,
          startPosition: livePosition,
          startSize: liveSize,
        });
      }}
      onPointerMove={updateInteraction}
      onPointerUp={stopInteraction}
      onPointerCancel={stopInteraction}
    >
      {children}
      {isResizable
        ? resizeDirections.map((direction) => (
            <div
              key={direction}
              aria-hidden="true"
              data-resize-direction={direction}
              data-testid={`movable-resizable-panel-resize-${direction}`}
              style={getResizeHandleStyle(direction)}
              onPointerDown={(event) => {
                if (interactionRef.current) {
                  return;
                }

                const coordinates = getPointerCoordinates(event);

                if (!coordinates) {
                  return;
                }

                startInteraction(event, {
                  type: "resize",
                  direction,
                  pointerId: event.pointerId,
                  startClientX: coordinates.clientX,
                  startClientY: coordinates.clientY,
                  startPosition: livePosition,
                  startSize: liveSize,
                });
              }}
            />
          ))
        : null}
    </div>
  );
}
