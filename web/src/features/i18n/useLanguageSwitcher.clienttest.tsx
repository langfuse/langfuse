import { act, renderHook } from "@testing-library/react";

import { LOCALE_COOKIE_NAME } from "@/src/features/i18n/config";
import { useLanguageSwitcher } from "@/src/features/i18n/useLanguageSwitcher";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/project/project-1/traces?filter=active",
    locale: "en",
    pathname: "/project/[projectId]/traces",
    push: mocks.push,
    query: { projectId: "project-1", filter: "active" },
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

describe("useLanguageSwitcher", () => {
  beforeEach(() => {
    mocks.capture.mockReset();
    mocks.push.mockReset().mockResolvedValue(true);
    document.cookie = `${LOCALE_COOKIE_NAME}=; Path=/; Max-Age=0`;
  });

  it("persists and navigates to a newly selected locale", () => {
    const { result } = renderHook(() => useLanguageSwitcher());

    act(() => result.current.selectLocale("zh-CN"));

    expect(document.cookie).toContain(`${LOCALE_COOKIE_NAME}=zh-CN`);
    expect(mocks.capture).toHaveBeenCalledWith(
      "user_settings:language_changed",
      { locale: "zh-CN" },
    );
    expect(mocks.push).toHaveBeenCalledWith(
      {
        pathname: "/project/[projectId]/traces",
        query: { projectId: "project-1", filter: "active" },
      },
      "/project/project-1/traces?filter=active",
      { locale: "zh-CN" },
    );
  });

  it("does nothing when the selected locale is already active", () => {
    const { result } = renderHook(() => useLanguageSwitcher());

    act(() => result.current.selectLocale("en"));

    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
