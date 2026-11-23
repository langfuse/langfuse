import { expect, waitFor } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { SidebarAccountButton } from "./SidebarAccountButton";

const meta = preview.meta({ component: SidebarAccountButton });

export const ReplayPrivacy = meta.story({
  name: "(Test) Replay excludes account identity and tooltip attributes",
  args: {
    user: {
      name: "Replay private account sentinel",
      email: "replay-private-account@example.com",
      avatar: "",
    },
  },
  render: (args) => (
    <>
      <span>Public account navigation</span>
      <SidebarAccountButton {...args} />
    </>
  ),
  play: async ({ args, canvas }) => {
    await expect(canvas.getByTitle(args.user.name)).toBeInTheDocument();
    await expect(canvas.getByTitle(args.user.email)).toBeInTheDocument();

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
