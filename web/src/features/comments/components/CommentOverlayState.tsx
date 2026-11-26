import { useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  type CommentOverlay,
  type CommentOverlayStore,
  type CommentTarget,
} from "../state/commentOverlayStore";

export function CommentOverlayState({
  store,
  initialState,
  children,
}: {
  store: CommentOverlayStore;
  initialState?: () => CommentTarget | undefined;
  children: (overlay: CommentOverlay) => ReactNode;
}) {
  const [initialOverlay] = useState<CommentOverlay | undefined>(() => {
    const target = initialState?.();
    return target
      ? { id: 0, target, presentation: "thread", isOpen: true }
      : undefined;
  });
  const selectedOverlay = useStore(store, (state) => state.overlay);
  const overlay = selectedOverlay ?? initialOverlay;
  return overlay ? children(overlay) : null;
}
