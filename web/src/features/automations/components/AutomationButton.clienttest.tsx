import { render } from "@testing-library/react";
import type { ReactNode } from "react";

const useQueryMock = vi.fn(() => ({ data: undefined, isLoading: false }));

vi.mock("@/src/utils/api", () => ({
  api: {
    automations: {
      count: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

vi.mock("@/src/features/rbac", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/components/ActionButton", () => ({
  ActionButton: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

import { AutomationButton } from "./AutomationButton";

describe("AutomationButton automations.count gating", () => {
  beforeEach(() => {
    useQueryMock.mockClear();
  });

  test("does not enable the count query while projectId is missing", () => {
    render(<AutomationButton projectId={undefined as unknown as string} />);

    expect(useQueryMock).toHaveBeenCalledWith(
      { projectId: undefined },
      { enabled: false },
    );
  });

  test("enables the count query once projectId is a string", () => {
    render(<AutomationButton projectId="p1" />);

    expect(useQueryMock).toHaveBeenCalledWith(
      { projectId: "p1" },
      { enabled: true },
    );
  });
});
