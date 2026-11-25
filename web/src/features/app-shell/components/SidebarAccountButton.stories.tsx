import { expect, waitFor } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { SidebarAccountButton } from "./SidebarAccountButton";
import motion from "./sidebarMotion.module.css";

const meta = preview.meta({ component: SidebarAccountButton });

export const VariantMatrix = meta.story({
  render: () => (
    <div className="flex flex-wrap items-start gap-8 p-4">
      {(["expanded", "collapsed", "mobile"] as const).map((surface) => (
        <div key={surface}>
          <p className="text-muted-foreground mb-2 text-xs">{surface}</p>
          <div
            className={motion.surface}
            data-sidebar-mode={surface}
            style={surface === "mobile" ? { width: 343 } : undefined}
          >
            <div className="bg-sidebar text-sidebar-foreground p-2">
              <SidebarAccountButton
                surface={surface}
                versionState={{
                  deployment: "self-hosted",
                  plan: "oss",
                  release: {
                    status: "update-available",
                    updateType: "minor",
                    latestRelease: "v9.9.9",
                  },
                  migration: { status: "idle" },
                }}
                user={{
                  name: "Alexandra Morgan",
                  email: "alexandra.morgan@example.com",
                  avatar: "",
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  ),
});

export const ReplayPrivacy = meta.story({
  name: "(Test) Replay excludes account identity and tooltip attributes",
  args: {
    surface: "expanded",
    user: {
      name: "Replay private account sentinel",
      email: "replay-private-account@example.com",
      avatar: "",
    },
    versionState: { deployment: "cloud" },
  },
  render: (args) => (
    <>
      <span>Public account navigation</span>
      <SidebarAccountButton {...args} />
    </>
  ),
  play: async ({ args, canvas }) => {
    await expect(canvas.getByTitle(args.user.name)).toBeInTheDocument();

    const { record, EventType } = await import("posthog-js/dist/rrweb");
    const snapshots: unknown[] = [];
    const stop = record({
      // The existing replay configuration contract pins this block class.
      blockClass: "ph-no-capture",
      maskAllInputs: true,
      inlineStylesheet: false,
      emit: (event) => {
        if (event.type === EventType.FullSnapshot)
          snapshots.push(event.data.node);
      },
    });

    try {
      await waitFor(() => expect(snapshots.length).toBeGreaterThan(0));
      const serialized = JSON.stringify(snapshots);
      await expect(serialized.includes("Public account navigation")).toBe(true);
      const identityLeaks = [args.user.name, args.user.email].filter((value) =>
        serialized.includes(value),
      );
      await expect(identityLeaks).toEqual([]);
    } finally {
      stop?.();
    }
  },
});
