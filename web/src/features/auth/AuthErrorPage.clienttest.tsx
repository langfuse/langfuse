import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AuthErrorPage from "@/src/features/auth/AuthErrorPage";

const { routerState } = vi.hoisted(() => ({
  routerState: { query: {} as Record<string, string> },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: routerState.query }),
}));

vi.mock("@/src/components/error-page", () => ({
  ErrorPageWithSentry: ({ message }: { message: string }) => <p>{message}</p>,
}));

describe("AuthErrorPage", () => {
  it("shows an error message containing a literal percent sign", () => {
    // Next.js has already decoded the query value once; decoding it again
    // throws on a bare `%`.
    routerState.query = { error: "Quota at 100% for this tenant" };

    render(<AuthErrorPage />);

    expect(
      screen.getByText("Quota at 100% for this tenant"),
    ).toBeInTheDocument();
  });

  it("shows an already-decoded percent sequence as is", () => {
    routerState.query = { error: "Value was %41" };

    render(<AuthErrorPage />);

    expect(screen.getByText("Value was %41")).toBeInTheDocument();
  });
});
