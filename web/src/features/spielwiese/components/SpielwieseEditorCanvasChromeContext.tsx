import { createContext, useContext, type ReactNode } from "react";

export type SpielwieseEditorCanvasChrome =
  | "default"
  | "onboarding-api-key"
  | "onboarding-model-selection"
  | "onboarding-preview";

const SpielwieseEditorCanvasChromeContext =
  createContext<SpielwieseEditorCanvasChrome>("default");

export function isOnboardingChrome(chrome: SpielwieseEditorCanvasChrome) {
  return chrome !== "default";
}

export function isOnboardingPreviewChrome(
  chrome: SpielwieseEditorCanvasChrome,
) {
  return chrome === "onboarding-preview";
}

export function isOnboardingModelSelectionChrome(
  chrome: SpielwieseEditorCanvasChrome,
) {
  return chrome === "onboarding-model-selection";
}

export function SpielwieseEditorCanvasChromeProvider({
  children,
  chrome,
}: {
  children: ReactNode;
  chrome: SpielwieseEditorCanvasChrome;
}) {
  return (
    <SpielwieseEditorCanvasChromeContext.Provider value={chrome}>
      {children}
    </SpielwieseEditorCanvasChromeContext.Provider>
  );
}

export function useSpielwieseEditorCanvasChrome() {
  return useContext(SpielwieseEditorCanvasChromeContext);
}
