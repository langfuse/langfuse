import { useEffect, useState } from "react";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import { expect, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { type AppRouter } from "@/src/server/api/root";
import { V4SidebarToggle } from "./V4SidebarToggle";

const storyApi = createTRPCReact<AppRouter>();
const session: Session = {
  expires: "2999-01-01T00:00:00.000Z",
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: null,
  },
  user: {
    id: "storybook-user",
    canCreateOrganizations: false,
    organizations: [],
    featureFlags: testFeatureFlags(),
    v4BetaEnabled: false,
    canToggleV4: true,
  },
};

const meta = preview.meta({ component: V4SidebarToggle });

export const LayoutAndIntro = meta.story({
  name: "(Test) Layout changes preserve the toggle and intro workflow",
  beforeEach: () => {
    const key = "v4-beta-intro-dialog-seen";
    const previous = localStorage.getItem(key);
    localStorage.removeItem(key);
    return () => {
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
    };
  },
  render: () => {
    const [isCollapsed, setIsCollapsed] = useState(true);
    useEffect(() => {
      const toggleLayout = (event: KeyboardEvent) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "b"
        ) {
          event.preventDefault();
          setIsCollapsed((collapsed) => !collapsed);
        }
      };
      window.addEventListener("keydown", toggleLayout, true);
      return () => window.removeEventListener("keydown", toggleLayout, true);
    }, []);
    const [queryClient] = useState(() => new QueryClient());
    const [client] = useState(() =>
      createTRPCClient<AppRouter>({
        links: [
          () => () =>
            observable((observer) => {
              observer.error(
                new TRPCClientError("The intro must precede any mutation"),
              );
            }),
        ],
      }),
    );
    return (
      <SessionProvider session={session} refetchOnWindowFocus={false}>
        <storyApi.Provider client={client} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <V4SidebarToggle isCollapsed={isCollapsed} />
          </QueryClientProvider>
        </storyApi.Provider>
      </SessionProvider>
    );
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "V4 preview: Off" });
    await expect(trigger).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(trigger);
    const intro = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Welcome to a faster Langfuse" },
    );
    await waitFor(() => expect(intro).toBeVisible());

    await userEvent.keyboard("{Control>}b{/Control}");

    await expect(trigger).toBeInTheDocument();
    await expect(trigger).toHaveAttribute("data-collapsed", "false");
    await expect(trigger).toHaveAttribute("aria-pressed", "false");
    await expect(
      within(canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Welcome to a faster Langfuse",
      }),
    ).toBe(intro);
    await waitFor(() => expect(intro).toBeVisible());
  },
});
