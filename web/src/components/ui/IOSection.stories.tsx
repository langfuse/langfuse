import { useState } from "react";
import preview from "../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import Image from "next/image";
import { FoldVertical, Pencil, Wrench } from "@langfuse/icons";
import { IOSection } from "./IOSection";
import { PrettyJsonView } from "./PrettyJsonView";
import { IO_STICKY_HEADERS_CLASS } from "@/src/features/traces/constants/ioSectionClasses";

const meta = preview.meta({
  component: IOSection,
  args: {
    onCopy: fn(),
  },
});

const USER_TEXT =
  "Hi — I was charged twice for my Pro subscription this month (invoices inv_20260701 and inv_20260701-2, $49 each). Can you refund the duplicate?";

const ASSISTANT_TEXT =
  "Context: pro plan customer (Maya Chen, Acme Robotics), two $49 invoices paid 5s apart on 2026-07-01, one prior ticket with the same pattern resolved by refund.";

const TOOL_INPUT = {
  customer_id: "cus_LqT4v8",
  period: "2026-07",
  amount_usd: 49,
};

const ERROR_OUTPUT = {
  error: {
    type: "upstream_error",
    code: 502,
    message: "Search backend unavailable, request not retried.",
  },
};

const LONG_TEXT = Array.from(
  { length: 40 },
  (_, i) =>
    `Turn ${i + 1}: the agent re-checked the invoice list, compared the payment intents and drafted the next step for the reply.`,
).join("\n\n");

const headerActions = [
  {
    icon: FoldVertical,
    label: "Collapse all rows",
    onClick: fn(),
  },
  {
    icon: Pencil,
    label: "Correct output",
    onClick: fn(),
  },
];

const info = {
  label: "About corrected outputs",
  text: "Corrected outputs allow you to save the expected output for a trace or observation.",
  docsHref: "https://langfuse.com/docs/observability/features/corrections",
};

const jsonToggle = {
  label: "JSON",
  checked: false,
  onCheckedChange: fn(),
};

/** A section whose header carries a view switch (always visible while open). */
function TabsControlExample() {
  const [tab, setTab] = useState("called");
  return (
    <IOSection
      title="Tools"
      variant="table"
      tabs={{
        value: tab,
        onValueChange: setTab,
        items: [
          { value: "called", label: "Called", count: 3 },
          { value: "not-called", label: "Not called", count: 36 },
        ],
      }}
    >
      <p className="px-1 py-1.5 text-sm">
        {tab === "called" ? "3 called tools" : "36 tools not called"}
      </p>
    </IOSection>
  );
}

export const Default = meta.story({
  args: {
    title: "user",
    children: <p className="text-sm">{USER_TEXT}</p>,
  },
});

export const VariantMatrix = meta.story({
  args: {
    title: "user",
    children: null,
  },
  render: (args) => (
    <div className="flex flex-col gap-8">
      <Example caption="Text body (default): chat message">
        <IOSection onCopy={args.onCopy} title="user">
          <p className="text-sm">{USER_TEXT}</p>
        </IOSection>
      </Example>

      <Example caption="Table body: PrettyJsonView owns the section (variant table, py-1)">
        <PrettyJsonView title="Input" json={TOOL_INPUT} currentView="pretty" />
      </Example>

      <Example caption="Media body: tiles sit 12px from every edge (variant media)">
        <IOSection onCopy={args.onCopy} title="Media" variant="media">
          <div className="flex flex-wrap gap-2">
            <Image
              src="/revenue-chart.svg"
              alt="Attached chart"
              width={160}
              height={96}
              unoptimized
              className="bg-background rounded-md border"
            />
          </div>
        </IOSection>
      </Example>

      <Example caption="Tone danger: error message text">
        <IOSection onCopy={args.onCopy} title="Error" tone="danger">
          Zendesk 502: upstream search unavailable
        </IOSection>
      </Example>

      <Example caption="Tone warning">
        <IOSection onCopy={args.onCopy} title="Warning" tone="warning">
          The observation completed with a recoverable warning.
        </IOSection>
      </Example>

      <Example caption="Tone muted: default status message">
        <IOSection onCopy={args.onCopy} title="Status" tone="muted">
          The observation completed with additional status details.
        </IOSection>
      </Example>

      <Example caption="Tone neutral">
        <IOSection onCopy={args.onCopy} title="Debug" tone="neutral">
          Detailed diagnostic information for this observation.
        </IOSection>
      </Example>

      <Example caption="Toned table: the plain table box with the tone as fill, neutral dividers">
        <PrettyJsonView
          title="Output"
          json={ERROR_OUTPUT}
          currentView="pretty"
          tone="danger"
        />
      </Example>

      <Example caption="Collapsed: header only, body not rendered">
        <IOSection onCopy={args.onCopy} title="system" defaultCollapsed>
          <p className="text-sm">{ASSISTANT_TEXT}</p>
        </IOSection>
      </Example>

      <Example caption="Header actions (hover the section): expand-all, pencil, copy">
        <IOSection onCopy={args.onCopy} title="Output" actions={headerActions}>
          <p className="text-sm">{ASSISTANT_TEXT}</p>
        </IOSection>
      </Example>

      <Example caption="Status saving + JSON toggle + info hover card (hover the section)">
        <IOSection
          title="Corrected output"
          info={info}
          status={{ kind: "saving", text: "Saving" }}
          toggle={jsonToggle}
          actions={headerActions}
        >
          <p className="text-sm">{ASSISTANT_TEXT}</p>
        </IOSection>
      </Example>

      <Example caption="Status saved">
        <IOSection
          title="Corrected output"
          info={info}
          status={{ kind: "saved", text: "Saved" }}
          toggle={jsonToggle}
          actions={headerActions}
        >
          <p className="text-sm">{ASSISTANT_TEXT}</p>
        </IOSection>
      </Example>

      <Example caption="Status error">
        <IOSection
          title="Corrected output"
          info={info}
          status={{ kind: "error", text: "Invalid JSON - fix to save" }}
          toggle={{ ...jsonToggle, checked: true }}
        >
          <p className="text-sm">{ASSISTANT_TEXT}</p>
        </IOSection>
      </Example>

      <Example caption="Count badge">
        <IOSection onCopy={args.onCopy} title="Skills" count={3}>
          <p className="text-sm">3 skills loaded for this run.</p>
        </IOSection>
      </Example>

      <Example caption="Tabs control: Called / Not called switch in the header, hidden while collapsed">
        <TabsControlExample />
      </Example>

      <Example caption="Title icon">
        <IOSection onCopy={args.onCopy} title="Tools" titleIcon={Wrench}>
          <p className="text-sm">
            3 of 39 available tools were called in this generation.
          </p>
        </IOSection>
      </Example>

      <Example caption="Sticky header: long body inside a fixed-height scroll container">
        <div
          className={`h-64 overflow-y-auto rounded-md border p-3 ${IO_STICKY_HEADERS_CLASS}`}
        >
          <IOSection onCopy={args.onCopy} title="assistant">
            <p className="text-sm whitespace-pre-wrap">{LONG_TEXT}</p>
          </IOSection>
        </div>
      </Example>
    </div>
  ),
});

export const StickyHeader = meta.story({
  args: {
    title: "system",
    children: null,
  },
  render: (args) => (
    <div
      className={`h-72 overflow-y-auto rounded-md border p-3 ${IO_STICKY_HEADERS_CLASS}`}
    >
      <IOSection onCopy={args.onCopy} title="system">
        <p className="text-sm whitespace-pre-wrap">{LONG_TEXT}</p>
      </IOSection>
      <div className="pt-2">
        <IOSection onCopy={args.onCopy} title="user">
          <p className="text-sm">{USER_TEXT}</p>
        </IOSection>
      </div>
    </div>
  ),
});

export const HeaderRowToggles = meta.story({
  name: "(Test) Header Row Toggles",
  args: {
    title: "assistant",
    actions: headerActions,
    children: <p className="text-sm">{ASSISTANT_TEXT}</p>,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Clicking the title text (not the caret) collapses the section.
    await userEvent.click(canvas.getByText("assistant"));
    await expect(canvas.queryByText(ASSISTANT_TEXT)).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Expand assistant" }),
    ).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(
      canvas.getByRole("button", { name: "Expand assistant" }),
    );
    await expect(canvas.getByText(ASSISTANT_TEXT)).toBeVisible();

    // A header control runs its own action and leaves the section open.
    await userEvent.click(canvas.getByTitle("Copy to clipboard"));
    await expect(args.onCopy).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByTitle("Correct output"));
    await expect(canvas.getByText(ASSISTANT_TEXT)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Collapse assistant" }),
    ).toHaveAttribute("aria-expanded", "true");
  },
});

/** Caption + example, used by the variant matrix only. */
function Example({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">{caption}</p>
      {children}
    </div>
  );
}
