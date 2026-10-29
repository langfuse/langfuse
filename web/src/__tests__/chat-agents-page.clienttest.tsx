import { render, screen } from "@testing-library/react";

import ChatAgentsPage from "@/src/pages/for/chat-agents";

describe("chat agents landing page", () => {
  it("renders the core marketing sections", () => {
    render(<ChatAgentsPage />);

    expect(
      screen.getByRole("heading", {
        name: /Ship chat agents your users keep talking to/i,
        level: 1,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: /Trace the full session, not one call/i,
        level: 2,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: /Teams running chat in production/i,
        level: 2,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: /Any model, any framework/i,
        level: 2,
      }),
    ).toBeInTheDocument();
  });
});
