import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { SessionManageViewsDialog } from "./SessionManageViewsDialog";

const meta = preview.meta({
  component: SessionManageViewsDialog,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <DialogController<null>
        initialState={() => null}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
    ),
  ],
  args: {
    views: [
      {
        id: "one",
        name: "Generations",
        createdBy: "me",
        canEdit: true,
        createdByUser: {
          name: "Ben",
          email: "ben@example.com",
          image: null,
        },
      },
      {
        id: "two",
        name: "Errors",
        createdBy: "other",
        canEdit: false,
        createdByUser: {
          name: "Alex",
          email: "alex@example.com",
          image: null,
        },
      },
      { id: "three", name: "Tools", createdBy: "other", canEdit: false },
    ],
    currentUserId: "me",
    pinnedViewIds: ["messages", "one", "two", "three"],
    canEdit: true,
    isLoading: false,
    error: undefined,
    onPin: fn(),
    onUnpin: fn(),
    onEditView: fn(),
    onReorder: fn(),
    onDeleteView: fn(),
  },
});
export default meta;

export const Default = meta.story({ args: { onSetDefaultPin: fn() } });

export const DefaultPinWithPersonalOptOut = meta.story({
  name: "(Test) Default pin remains visible after personal unpin",
  args: {
    views: [
      {
        id: "default",
        name: "Shared view",
        canEdit: false,
        isPinnedByDefaultForProject: true,
      },
    ],
    pinnedViewIds: ["messages"],
    onSetDefaultPin: fn(),
  },
  play: async ({ args }) => {
    const body = within(document.body);
    await expect(body.getByText("Pinned by default")).toBeInTheDocument();
    await userEvent.click(
      body.getByRole("button", { name: "Pin Shared view" }),
    );
    await expect(args.onPin).toHaveBeenCalledWith("default");
    const defaultPinButton = body.getByRole("button", {
      name: "Remove default pin for Shared view",
    });
    await userEvent.hover(defaultPinButton);
    await waitFor(() => {
      const tooltip = document.getElementById(
        defaultPinButton.getAttribute("aria-describedby") ?? "",
      );
      expect(tooltip).toBeVisible();
      expect(tooltip).toHaveTextContent(
        "Remove the default pin for this project.",
      );
      expect(tooltip).toHaveTextContent("Personal pin choices are kept.");
    });
    await userEvent.click(defaultPinButton);
    await expect(args.onSetDefaultPin).toHaveBeenCalledWith("default", false);
  },
});

export const OptInPinning = meta.story({
  name: "(Test) Migrated views start unpinned",
  args: { pinnedViewIds: ["messages"] },
  play: async ({ args }) => {
    const body = within(document.body);
    await expect(
      body.getByRole("button", { name: "Unpin Messages" }),
    ).toBeInTheDocument();
    await expect(
      body.getByRole("button", { name: "Pin Errors" }),
    ).toBeInTheDocument();
    await userEvent.click(
      body.getByRole("button", { name: "Pin Generations" }),
    );
    await expect(args.onPin).toHaveBeenCalledWith("one");
    await expect(
      body.getByRole("button", { name: "Move Generations up" }),
    ).toBeDisabled();
  },
});

export const CreatorFilters = meta.story({
  name: "(Test) Creator filters",
  play: async () => {
    const body = within(document.body);
    await expect(body.getByText("Ben")).toBeInTheDocument();
    await expect(body.getByText("Alex")).toBeInTheDocument();
    await userEvent.click(body.getByRole("tab", { name: "My views" }));
    await expect(body.getByText("Generations")).toBeInTheDocument();
    await expect(body.queryByText("Messages")).not.toBeInTheDocument();
    await expect(body.queryByText("Errors")).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("tab", { name: "Others’ views" }));
    await expect(body.getByText("Errors")).toBeInTheDocument();
    await expect(body.queryByText("Generations")).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("tab", { name: "All views" }));
    await expect(body.getByText("Messages")).toBeInTheDocument();
  },
});

export const PinningAndOrdering = meta.story({
  name: "(Test) Pinning and ordering",
  args: {
    pinnedViewIds: ["three", "one"],
  },
  play: async ({ args }) => {
    const body = within(document.body);
    const rows = body.getAllByRole("row").slice(1);
    await expect(
      rows.map((row) => row.querySelectorAll("td")[1]?.textContent),
    ).toEqual(["Tools", "Generations", "Messages", "Errors"]);
    await expect(
      body.getByRole("button", { name: "Move Errors up" }),
    ).toBeDisabled();
    await expect(
      body.getByRole("button", { name: "Move Errors down" }),
    ).toBeDisabled();
    await userEvent.click(body.getByRole("button", { name: "Pin Messages" }));
    await expect(args.onPin).toHaveBeenCalledWith("messages");
    await userEvent.click(
      body.getByRole("button", { name: "Unpin Generations" }),
    );
    await expect(args.onUnpin).toHaveBeenCalledWith("one");
    await userEvent.click(body.getByRole("tab", { name: "My views" }));
    await userEvent.click(
      body.getByRole("button", { name: "Move Generations up" }),
    );
    await expect(args.onReorder).toHaveBeenCalledWith(["one", "three"]);
  },
});

export const EditAndDelete = meta.story({
  name: "(Test) Edit and delete",
  play: async ({ args }) => {
    const body = within(document.body);
    for (const name of [
      "Edit Messages",
      "Delete Messages",
      "Move Messages up",
      "Move Messages down",
    ]) {
      await expect(body.getByRole("button", { name })).toBeDisabled();
    }
    await userEvent.click(
      body.getByRole("button", { name: "Edit Generations" }),
    );
    await expect(args.onEditView).toHaveBeenCalledWith("one");
    await expect(
      body.getByRole("button", { name: "Edit Errors" }),
    ).toBeDisabled();
    await expect(
      body.getByRole("button", { name: "Delete Errors" }),
    ).toBeDisabled();
    await userEvent.click(
      body.getByRole("button", { name: "Delete Generations" }),
    );
    await expect(args.onDeleteView).toHaveBeenCalledWith("one");
  },
});

export const ReadOnly = meta.story({
  name: "(Test) Read only",
  args: { canEdit: false },
  play: async ({ args }) => {
    const body = within(document.body);
    await expect(
      body.queryByRole("button", { name: "Edit Generations" }),
    ).not.toBeInTheDocument();
    await expect(
      body.queryByRole("button", { name: "Delete Errors" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      body.getByRole("button", { name: "Unpin Generations" }),
    );
    await expect(args.onUnpin).toHaveBeenCalledWith("one");
    await userEvent.click(body.getByRole("button", { name: "Move Errors up" }));
    await expect(args.onReorder).toHaveBeenCalledWith([
      "messages",
      "two",
      "one",
      "three",
    ]);
  },
});

export const EditableOrphan = meta.story({
  name: "(Test) Editable orphan",
  args: {
    views: [
      { id: "orphan", name: "Recovered", createdBy: null, canEdit: true },
    ],
  },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(body.getByRole("button", { name: "Edit Recovered" }));
    await expect(args.onEditView).toHaveBeenCalledWith("orphan");
    await userEvent.click(
      body.getByRole("button", { name: "Delete Recovered" }),
    );
    await expect(args.onDeleteView).toHaveBeenCalledWith("orphan");
  },
});

export const Empty = meta.story({
  args: { views: [] },
});
export const Loading = meta.story({ args: { isLoading: true } });
export const Error = meta.story({ args: { error: "Unable to load views." } });
