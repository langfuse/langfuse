"use client";

import {
  useCallback,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  captureFinderCloseAnimationSnapshot,
  playFinderCloseAnimation,
  playFinderOpenAnimation,
} from "./spielwieseHeaderFinderMotion";

function closeFinderWithAnimation({
  isClosingRef,
  onClose,
  panelSearchFieldRef,
  triggerBackgroundRef,
  triggerIconRef,
  triggerPlaceholderRef,
  triggerRef,
  triggerShortcutRef,
}: {
  isClosingRef: MutableRefObject<boolean>;
  onClose: () => void;
  panelSearchFieldRef: RefObject<HTMLLabelElement | null>;
  triggerBackgroundRef: RefObject<HTMLSpanElement | null>;
  triggerIconRef: RefObject<SVGSVGElement | null>;
  triggerPlaceholderRef: RefObject<HTMLSpanElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  triggerShortcutRef: RefObject<HTMLElement | null>;
}) {
  const closingRef = isClosingRef;
  const searchFieldRef = panelSearchFieldRef;
  const backgroundRef = triggerBackgroundRef;
  const iconRef = triggerIconRef;
  const placeholderRef = triggerPlaceholderRef;
  const buttonRef = triggerRef;
  const shortcutRef = triggerShortcutRef;

  if (closingRef.current) {
    return;
  }

  closingRef.current = true;
  const closeSnapshot = captureFinderCloseAnimationSnapshot(
    searchFieldRef.current,
  );

  onClose();
  requestAnimationFrame(() => {
    playFinderCloseAnimation({
      snapshot: closeSnapshot,
      triggerBackground: backgroundRef.current,
      triggerIcon: iconRef.current,
      triggerPlaceholder: placeholderRef.current,
      triggerShortcut: shortcutRef.current,
    });
    buttonRef.current?.focus();
  });
}

function scheduleFinderOpenAnimation({
  isClosingRef,
  node,
  openAnimationFrameRef,
  panelBackgroundRef,
  panelInputRef,
  panelResultsRef,
  panelSearchFieldRef,
  panelShortcutRef,
  panelSurfaceRef,
  triggerBackgroundRef,
}: {
  isClosingRef: MutableRefObject<boolean>;
  node: HTMLDivElement | null;
  openAnimationFrameRef: MutableRefObject<number | null>;
  panelBackgroundRef: RefObject<HTMLDivElement | null>;
  panelInputRef: RefObject<HTMLInputElement | null>;
  panelResultsRef: RefObject<HTMLDivElement | null>;
  panelSearchFieldRef: RefObject<HTMLLabelElement | null>;
  panelShortcutRef: RefObject<HTMLElement | null>;
  panelSurfaceRef: RefObject<HTMLDivElement | null>;
  triggerBackgroundRef: RefObject<HTMLSpanElement | null>;
}) {
  const surfaceRef = panelSurfaceRef;
  const closingRef = isClosingRef;
  const frameRef = openAnimationFrameRef;
  const backgroundRef = panelBackgroundRef;
  const inputRef = panelInputRef;
  const resultsRef = panelResultsRef;
  const searchFieldRef = panelSearchFieldRef;
  const shortcutRef = panelShortcutRef;
  const triggerBgRef = triggerBackgroundRef;

  surfaceRef.current = node;
  closingRef.current = false;

  if (!node) {
    return;
  }

  if (frameRef.current !== null) {
    cancelAnimationFrame(frameRef.current);
  }

  frameRef.current = requestAnimationFrame(() => {
    playFinderOpenAnimation({
      panelBackground: backgroundRef.current,
      panelInput: inputRef.current,
      panelResults: resultsRef.current,
      panelSearchField: searchFieldRef.current,
      panelShortcut: shortcutRef.current,
      triggerBackground: triggerBgRef.current,
    });
    frameRef.current = null;
  });
}

export function useSpielwieseHeaderFinderMotion({
  onClose,
}: {
  onClose: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerBackgroundRef = useRef<HTMLSpanElement>(null);
  const triggerIconRef = useRef<SVGSVGElement>(null);
  const triggerPlaceholderRef = useRef<HTMLSpanElement>(null);
  const triggerShortcutRef = useRef<HTMLElement>(null);
  const panelBackgroundRef = useRef<HTMLDivElement>(null);
  const panelInputRef = useRef<HTMLInputElement>(null);
  const panelResultsRef = useRef<HTMLDivElement>(null);
  const panelSearchFieldRef = useRef<HTMLLabelElement>(null);
  const panelShortcutRef = useRef<HTMLElement>(null);
  const panelSurfaceRef = useRef<HTMLDivElement>(null);
  const openAnimationFrameRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);

  const requestClose = () =>
    closeFinderWithAnimation({
      isClosingRef,
      onClose,
      panelSearchFieldRef,
      triggerBackgroundRef,
      triggerIconRef,
      triggerPlaceholderRef,
      triggerRef,
      triggerShortcutRef,
    });

  const scheduleOpenAnimation = useCallback((node: HTMLDivElement | null) => {
    scheduleFinderOpenAnimation({
      isClosingRef,
      node,
      openAnimationFrameRef,
      panelBackgroundRef,
      panelInputRef,
      panelResultsRef,
      panelSearchFieldRef,
      panelShortcutRef,
      panelSurfaceRef,
      triggerBackgroundRef,
    });
  }, []);

  return {
    panelBackgroundRef,
    panelInputRef,
    panelResultsRef,
    panelSearchFieldRef,
    panelShortcutRef,
    requestClose,
    scheduleOpenAnimation,
    triggerBackgroundRef,
    triggerIconRef,
    triggerPlaceholderRef,
    triggerRef,
    triggerShortcutRef,
  };
}
