import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import {
  useViewPreferences,
  ViewPreferencesProvider,
} from "./ViewPreferencesContext";
import { useJsonBetaToggle } from "../hooks/useJsonBetaToggle";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ViewPreferencesProvider>{children}</ViewPreferencesProvider>
);

describe("JSON beta preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("does not enable JSON beta from the expired jsonViewPreference migration", () => {
    localStorage.setItem("jsonViewPreference", JSON.stringify("json-beta"));

    const preferences = renderHook(() => useViewPreferences(), { wrapper });
    const toggle = renderHook(() => useJsonBetaToggle("json", vi.fn()));

    expect(preferences.result.current.jsonBetaEnabled).toBe(false);
    expect(toggle.result.current.jsonBetaEnabled).toBe(false);
  });

  it("keeps an explicit jsonBetaEnabled preference", () => {
    localStorage.setItem("jsonViewPreference", JSON.stringify("json-beta"));
    localStorage.setItem("jsonBetaEnabled", JSON.stringify(true));

    const preferences = renderHook(() => useViewPreferences(), { wrapper });
    const toggle = renderHook(() => useJsonBetaToggle("json", vi.fn()));

    expect(preferences.result.current.jsonBetaEnabled).toBe(true);
    expect(toggle.result.current.jsonBetaEnabled).toBe(true);
  });
});
