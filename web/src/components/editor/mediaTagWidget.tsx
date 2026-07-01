import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@uiw/react-codemirror";
import { type Extension } from "@codemirror/state";
import { useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MEDIA_REFERENCE_PATTERN } from "@langfuse/shared";
import {
  classifyMediaLeaf,
  type MediaLeafDescriptor,
} from "@/src/components/ui/media/classifyMediaLeaf";
import { JsonMediaTag } from "@/src/components/ui/media/JsonMediaTag";

type LangfuseRefDescriptor = Extract<
  MediaLeafDescriptor,
  { kind: "langfuseRef" }
>;

type MediaAnchor = {
  id: number;
  dom: HTMLElement;
  descriptor: LangfuseRefDescriptor;
  detachedFrames: number;
};

const EMPTY: MediaAnchor[] = [];

/**
 * Tracks the live media-chip anchor nodes a CodeMirror editor has created.
 * The CodeMirror widget can only produce a detached DOM node — which has no
 * access to the app's React providers (tRPC, router, layers) — so instead of
 * mounting React there, the widget registers an empty anchor here and the
 * in-tree portal host (`MediaTagWidgetPortals`) renders `JsonMediaTag` into it,
 * keeping the hover-peek's lazy fetch and popover working.
 */
class MediaTagWidgetStore {
  private anchors = new Map<number, MediaAnchor>();
  private listeners = new Set<() => void>();
  private nextId = 0;
  private snapshot: MediaAnchor[] = EMPTY;
  private emitScheduled = false;
  private sweepScheduled = false;

  register(dom: HTMLElement, descriptor: LangfuseRefDescriptor) {
    const id = this.nextId++;
    this.anchors.set(id, { id, dom, descriptor, detachedFrames: 0 });
    this.queueEmit();
    return id;
  }

  subscribe = (onChange: () => void) => {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  };

  getSnapshot = () => this.snapshot;

  private queueEmit() {
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    queueMicrotask(() => {
      this.emitScheduled = false;
      this.emit();
    });
  }

  scheduleDetachedSweep() {
    if (this.sweepScheduled) return;
    this.sweepScheduled = true;
    const schedule =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);

    schedule(() => {
      this.sweepScheduled = false;
      let changed = false;
      let hasDetachedAnchors = false;

      for (const [id, anchor] of this.anchors) {
        if (anchor.dom.isConnected) {
          anchor.detachedFrames = 0;
          continue;
        }

        anchor.detachedFrames += 1;
        hasDetachedAnchors = true;
        if (anchor.detachedFrames >= 3) {
          this.anchors.delete(id);
          changed = true;
        }
      }

      if (changed) this.queueEmit();
      if (hasDetachedAnchors) this.scheduleDetachedSweep();
    });
  }

  private emit() {
    this.snapshot = Array.from(this.anchors.values());
    this.listeners.forEach((l) => l());
  }
}

class MediaTagWidget extends WidgetType {
  private id?: number;

  constructor(
    private readonly store: MediaTagWidgetStore,
    private readonly descriptor: LangfuseRefDescriptor,
  ) {
    super();
  }

  eq(other: MediaTagWidget) {
    return other.descriptor.referenceString === this.descriptor.referenceString;
  }

  toDOM() {
    const dom = document.createElement("span");
    dom.style.verticalAlign = "middle";
    this.id = this.store.register(dom, this.descriptor);
    return dom;
  }

  destroy() {
    // CodeMirror may destroy/rebuild widget views during bracket/cursor
    // decoration updates. Treat destroy as a hint and only clean up anchors that
    // remain detached across frames, so transient redraws do not drop the
    // React portal that makes the chip hoverable.
    this.store.scheduleDetachedSweep();
  }

  // Let hover/focus reach the chip's React HoverCard rather than the editor.
  ignoreEvent() {
    return true;
  }
}

function createMediaTagWidgetExtension(store: MediaTagWidgetStore): Extension {
  const matcher = new MatchDecorator({
    // Swallow the surrounding JSON quotes into the replaced range so the chip
    // stands in for `"<tag>"` as a whole — otherwise the quotes render around
    // it. The tag itself (capture group) is what we classify. Fresh RegExp so
    // the shared pattern's lastIndex isn't mutated across uses.
    regexp: new RegExp(`"(${MEDIA_REFERENCE_PATTERN.source})"`, "g"),
    decoration: (match) => {
      const descriptor = classifyMediaLeaf(match[1]);
      if (descriptor?.kind !== "langfuseRef") return null;
      return Decoration.replace({
        widget: new MediaTagWidget(store, descriptor),
      });
    },
  });

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }

      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations);
        store.scheduleDetachedSweep();
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      provide: (plugin) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(plugin)?.decorations ?? Decoration.none,
        ),
    },
  );
}

function MediaTagWidgetPortals({ store }: { store: MediaTagWidgetStore }) {
  const anchors = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY,
  );
  return (
    <>
      {anchors.map((anchor) =>
        createPortal(
          <JsonMediaTag descriptor={anchor.descriptor} />,
          anchor.dom,
          String(anchor.id),
        ),
      )}
    </>
  );
}

/**
 * Renders Langfuse media reference tags in a CodeMirror editor as inline,
 * hover-to-peek chips. Spread `extension` into the editor's `extensions` and
 * render `portals` anywhere inside the component (it must stay within the app's
 * providers). The underlying tag text is preserved and treated atomically.
 */
export function useMediaTagChips() {
  const [store] = useState(() => new MediaTagWidgetStore());
  const extension = useMemo(
    () => createMediaTagWidgetExtension(store),
    [store],
  );
  const portals = <MediaTagWidgetPortals store={store} />;
  return { extension, portals };
}
