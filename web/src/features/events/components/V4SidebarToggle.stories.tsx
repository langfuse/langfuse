import { useRef, useState } from "react";
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
import { ShellSidebar } from "@/src/features/app-shell/components/ShellSidebar";
import {
  AppShellSidebarProvider,
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";

import { V4_PREVIEW_DESCRIPTION } from "@/src/features/events/lib/v4PreviewLabel";

const storyApi = createTRPCReact<AppRouter>();
const session: Session = {
  expires: "2999-01-01T00:00:00.000Z",
  policies: [],
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

const SIDEBAR_EXPANDED_STORAGE_KEY = "langfuse:sidebar:pinned:v1";

const meta = preview.meta({
  component: V4SidebarToggle,
  decorators: [
    (Story) => (
      <AppShellSidebarProvider>
        <Story />
      </AppShellSidebarProvider>
    ),
  ],
});

export const LayoutAndIntro = meta.story({
  name: "(Test) Layout changes preserve the toggle and intro workflow",
  beforeEach: () => {
    const key = "v4-beta-intro-dialog-seen";
    const previous = localStorage.getItem(key);
    const previousExpansion = localStorage.getItem(
      SIDEBAR_EXPANDED_STORAGE_KEY,
    );
    localStorage.removeItem(key);
    localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, "false");
    return () => {
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
      if (previousExpansion === null)
        localStorage.removeItem(SIDEBAR_EXPANDED_STORAGE_KEY);
      else
        localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, previousExpansion);
    };
  },
  render: () => {
    const isMobile = useAppShellSidebar((state) => state.isMobile);
    const isExpanded = useAppShellSidebar((state) => state.isExpanded);
    const { setMobileOpen, setExpanded } = useAppShellSidebarActions();
    const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null);
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
            <div className="pl-64">
              <button
                ref={mobileNavigationTriggerRef}
                onClick={() => setMobileOpen(true)}
              >
                Open menu
              </button>
              <button onClick={() => setExpanded(true)}>
                Expand navigation
              </button>
            </div>
            <ShellSidebar
              isMobile={isMobile}
              mobileNavigationTriggerRef={mobileNavigationTriggerRef}
            >
              <button onClick={() => setMobileOpen(false)}>Close menu</button>
              <V4SidebarToggle isCollapsed={!isMobile && !isExpanded} />
            </ShellSidebar>
          </QueryClientProvider>
        </storyApi.Provider>
      </SessionProvider>
    );
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const originalViewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const viewportFrame = window.frameElement as HTMLIFrameElement | null;
    const originalFrameStyle = viewportFrame?.getAttribute("style");
    const browserPage =
      import.meta.env.VITEST_STORYBOOK !== undefined
        ? (await import("vitest/browser")).page
        : null;
    const setViewport = async (width: number, height: number) => {
      if (browserPage) await browserPage.viewport(width, height);
      else if (viewportFrame) {
        // Resize the preview itself without a globals rerender resetting the dialog.
        viewportFrame.style.width = `${width}px`;
        viewportFrame.style.height = `${height}px`;
      } else
        throw new Error("Open this responsive story in the Storybook canvas");
      await waitFor(() => expect(window.innerWidth).toBe(width));
    };
    const body = within(canvasElement.ownerDocument.body);
    await setViewport(1280, 900);
    try {
      const trigger = await body.findByRole("button", {
        name: "V4 preview: Off",
      });
      await waitFor(() =>
        expect(trigger.closest("aside")).toHaveAttribute(
          "data-sidebar-mode",
          "collapsed",
        ),
      );
      await expect(trigger).toHaveAttribute("aria-pressed", "false");
      await userEvent.hover(trigger);
      await expect(await body.findByRole("tooltip")).toHaveTextContent(
        V4_PREVIEW_DESCRIPTION,
      );
      await userEvent.unhover(trigger);
      await userEvent.click(
        canvas.getByRole("button", { name: "Expand navigation" }),
      );
      await waitFor(() =>
        expect(trigger).toHaveAttribute("data-collapsed", "false"),
      );
      await userEvent.hover(trigger);
      await expect(await body.findByRole("tooltip")).toHaveTextContent(
        V4_PREVIEW_DESCRIPTION,
      );
      await userEvent.unhover(trigger);
      await userEvent.click(trigger);
      const intro = await body.findByRole("dialog", {
        name: "Welcome to a faster Langfuse",
      });
      await waitFor(() => expect(intro).toBeVisible());

      await setViewport(390, 844);
      await waitFor(() =>
        expect(trigger.closest("aside")).toHaveAttribute("inert"),
      );
      await expect(intro.closest("[inert], [aria-hidden='true']")).toBeNull();
      await expect(intro).toBeVisible();
      await expect(trigger).toBeInTheDocument();
      await expect(trigger).toHaveAttribute("data-collapsed", "false");
      await expect(trigger).toHaveAttribute("aria-pressed", "false");
      const confirmation = within(intro).getByRole("button", {
        name: /Understood/,
      });
      confirmation.focus();
      await expect(confirmation).toHaveFocus();
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(intro).not.toBeInTheDocument());

      await userEvent.click(canvas.getByRole("button", { name: "Open menu" }));
      const navigation = await body.findByRole("dialog", {
        name: "Navigation",
      });
      await waitFor(() =>
        expect(body.getByRole("button", { name: "Close menu" })).toHaveFocus(),
      );
      await userEvent.click(trigger);
      const mobileIntro = await body.findByRole("dialog", {
        name: "Welcome to a faster Langfuse",
      });
      await expect(
        mobileIntro.closest("[inert], [aria-hidden='true']"),
      ).toBeNull();
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(mobileIntro).not.toBeInTheDocument());
      await expect(navigation).toBeVisible();
      await expect(navigation).toHaveAttribute("data-mobile-open", "true");
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(navigation).toHaveAttribute("data-mobile-open", "false"),
      );
    } finally {
      if (browserPage)
        await browserPage.viewport(
          originalViewport.width,
          originalViewport.height,
        );
      else if (viewportFrame) {
        if (originalFrameStyle === null) viewportFrame.removeAttribute("style");
        else if (originalFrameStyle !== undefined)
          viewportFrame.setAttribute("style", originalFrameStyle);
      }
    }
  },
});
