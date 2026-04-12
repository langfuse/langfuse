"use client";

import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";
import type { SpielwieseModelRecommendationTarget } from "../components/spielwieseModelRecommendationState";

type SpielwieseShellContextValue = {
  closeSidePanels: () => void;
  leftCollapsed: boolean;
  modelRecommendationTarget: SpielwieseModelRecommendationTarget | null;
  rightOpen: boolean;
  rightPanelMode: "variables" | "model-recommendation";
  mobileLeftOpen: boolean;
  mobileRightOpen: boolean;
  closeModelRecommendation: () => void;
  togglePrimarySidebar: () => void;
  toggleSecondarySidebar: () => void;
  closeMobilePanels: () => void;
  openModelRecommendation: (
    target: SpielwieseModelRecommendationTarget,
  ) => void;
};

const SpielwieseShellContext =
  createContext<SpielwieseShellContextValue | null>(null);

function isDesktopViewport(query: string) {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches
  );
}

function getShellContextValue(
  value: SpielwieseShellContextValue,
): SpielwieseShellContextValue {
  return value;
}

function closeMobilePanelsState(
  setMobileLeftOpen: (value: boolean) => void,
  setMobileRightOpen: (value: boolean) => void,
) {
  setMobileLeftOpen(false);
  setMobileRightOpen(false);
}

function runDesktopOrMobileAction({
  desktopQuery,
  onDesktop,
  onMobile,
}: {
  desktopQuery: string;
  onDesktop: () => void;
  onMobile: () => void;
}) {
  if (isDesktopViewport(desktopQuery)) {
    onDesktop();
    return;
  }

  onMobile();
}

function useResponsivePanelState() {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);

  return {
    closeMobilePanels: () =>
      closeMobilePanelsState(setMobileLeftOpen, setMobileRightOpen),
    closeSidePanels: () => {
      if (isDesktopViewport("(min-width: 768px)")) {
        setLeftCollapsed(true);
      } else {
        setMobileLeftOpen(false);
      }

      if (isDesktopViewport("(min-width: 1280px)")) {
        setRightOpen(false);
      } else {
        setMobileRightOpen(false);
      }
    },
    leftCollapsed,
    mobileLeftOpen,
    mobileRightOpen,
    openSecondaryPanel: () =>
      runDesktopOrMobileAction({
        desktopQuery: "(min-width: 1280px)",
        onDesktop: () => setRightOpen(true),
        onMobile: () => {
          setMobileLeftOpen(false);
          setMobileRightOpen(true);
        },
      }),
    rightOpen,
    togglePrimarySidebar: () =>
      runDesktopOrMobileAction({
        desktopQuery: "(min-width: 768px)",
        onDesktop: () => setLeftCollapsed((value) => !value),
        onMobile: () => {
          setMobileRightOpen(false);
          setMobileLeftOpen((value) => !value);
        },
      }),
    toggleSecondarySidebar: () =>
      runDesktopOrMobileAction({
        desktopQuery: "(min-width: 1280px)",
        onDesktop: () => setRightOpen((value) => !value),
        onMobile: () => {
          setMobileLeftOpen(false);
          setMobileRightOpen((value) => !value);
        },
      }),
  };
}

export function SpielwieseShellProvider({ children }: PropsWithChildren) {
  const {
    closeMobilePanels,
    closeSidePanels,
    leftCollapsed,
    mobileLeftOpen,
    mobileRightOpen,
    openSecondaryPanel,
    rightOpen,
    togglePrimarySidebar,
    toggleSecondarySidebar,
  } = useResponsivePanelState();
  const [rightPanelMode, setRightPanelMode] = useState<
    "variables" | "model-recommendation"
  >("variables");
  const [modelRecommendationTarget, setModelRecommendationTarget] =
    useState<SpielwieseModelRecommendationTarget | null>(null);
  const openModelRecommendation = (
    target: SpielwieseModelRecommendationTarget,
  ) => {
    setModelRecommendationTarget(target);
    setRightPanelMode("model-recommendation");
    openSecondaryPanel();
  };
  const closeModelRecommendation = () => {
    setRightPanelMode("variables");
    setModelRecommendationTarget(null);
  };

  return (
    <SpielwieseShellContext.Provider
      value={getShellContextValue({
        closeMobilePanels,
        closeModelRecommendation,
        closeSidePanels,
        leftCollapsed,
        modelRecommendationTarget,
        mobileLeftOpen,
        mobileRightOpen,
        openModelRecommendation,
        rightOpen,
        rightPanelMode,
        togglePrimarySidebar,
        toggleSecondarySidebar,
      })}
    >
      {children}
    </SpielwieseShellContext.Provider>
  );
}

export function useSpielwieseShell() {
  const context = useContext(SpielwieseShellContext);

  if (!context) {
    throw new Error(
      "useSpielwieseShell must be used within SpielwieseShellProvider.",
    );
  }

  return context;
}

export function useOptionalSpielwieseShell() {
  return useContext(SpielwieseShellContext);
}
