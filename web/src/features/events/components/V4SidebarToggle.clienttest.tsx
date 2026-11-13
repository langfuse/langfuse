import { fireEvent, render, screen } from "@testing-library/react";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { V4SidebarToggle } from "./V4SidebarToggle";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {}, pathname: "/organizations" }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    userAccount: {
      setV4BetaEnabled: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
    },
  },
}));

it("preserves the toggle button and intro workflow while changing sidebar layout", () => {
  localStorage.removeItem("v4-beta-intro-dialog-seen");
  const session = {
    user: { v4BetaEnabled: false, canToggleV4: true },
  } as Session;
  const toggle = (isCollapsed: boolean) => (
    <SessionProvider session={session}>
      <V4SidebarToggle isCollapsed={isCollapsed} />
    </SessionProvider>
  );
  const { rerender } = render(toggle(true));

  const toggleButton = screen.getByRole("button", { name: "V4 preview: Off" });
  expect(toggleButton).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(toggleButton);
  expect(
    screen.getByRole("dialog", { name: "Welcome to a faster Langfuse" }),
  ).toBeVisible();

  rerender(toggle(false));

  expect(toggleButton).toBeInTheDocument();
  expect(toggleButton).toHaveAttribute("aria-pressed", "false");
  expect(
    screen.queryByRole("switch", { hidden: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("dialog", { name: "Welcome to a faster Langfuse" }),
  ).toBeVisible();
});
