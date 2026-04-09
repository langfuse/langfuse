"use client";

import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";

type SpielwieseShellContextValue = {
  leftCollapsed: boolean;
  rightOpen: boolean;
  mobileLeftOpen: boolean;
  mobileRightOpen: boolean;
  togglePrimarySidebar: () => void;
  toggleSecondarySidebar: () => void;
  closeMobilePanels: () => void;
};

const SpielwieseShellContext =
  createContext<SpielwieseShellContextValue | null>(null);

function isDesktopViewport(query: string) {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

export function SpielwieseShellProvider({ children }: PropsWithChildren) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);

  const togglePrimarySidebar = () => {
    if (isDesktopViewport("(min-width: 768px)")) {
      setLeftCollapsed((value) => !value);
      return;
    }

    setMobileRightOpen(false);
    setMobileLeftOpen((value) => !value);
  };

  const toggleSecondarySidebar = () => {
    if (isDesktopViewport("(min-width: 1280px)")) {
      setRightOpen((value) => !value);
      return;
    }

    setMobileLeftOpen(false);
    setMobileRightOpen((value) => !value);
  };

  const closeMobilePanels = () => {
    setMobileLeftOpen(false);
    setMobileRightOpen(false);
  };

  return (
    <SpielwieseShellContext.Provider
      value={{
        closeMobilePanels,
        leftCollapsed,
        mobileLeftOpen,
        mobileRightOpen,
        rightOpen,
        togglePrimarySidebar,
        toggleSecondarySidebar,
      }}
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
