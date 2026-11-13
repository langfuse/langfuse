import { fireEvent, render, screen } from "@testing-library/react";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";
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

it("opens the intro from the collapsed row and retains it while expanding the same toggle", () => {
  localStorage.removeItem("v4-beta-intro-dialog-seen");
  const session = {
    user: { v4BetaEnabled: false, canToggleV4: true },
  } as Session;
  const toggle = (isCollapsed: boolean) => (
    <SessionProvider session={session}>
      <TooltipProvider>
        <V4SidebarToggle isCollapsed={isCollapsed} />
      </TooltipProvider>
    </SessionProvider>
  );
  const { rerender } = render(toggle(true));

  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "V4 preview: Off" }));
  expect(
    screen.getByRole("dialog", { name: "Welcome to a faster Langfuse" }),
  ).toBeVisible();

  rerender(toggle(false));

  expect(screen.getAllByRole("switch", { hidden: true })).toHaveLength(1);
  expect(
    screen.getByRole("dialog", { name: "Welcome to a faster Langfuse" }),
  ).toBeVisible();
});
