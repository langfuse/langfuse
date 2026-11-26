import { type ComponentProps } from "react";
import { expect, within } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { InputDropdown } from "./InputDropdown";

const meta = preview.meta({});

const runName = "Production baseline";

type OptionProps = ComponentProps<
  typeof InputDropdown.SingleSelectOptionContent
>;

const badges = [{ text: "BASELINE" }, { text: "LATEST" }] satisfies NonNullable<
  OptionProps["badges"]
>;

const presence = [false, true];

const variants = presence.flatMap((checked) =>
  presence.flatMap((hasMarker) =>
    presence.flatMap((hasRecency) =>
      presence.map((hasBadges) => {
        const name = [
          checked ? "Selected" : "Unselected",
          hasMarker && "Marker",
          hasRecency && "Recency",
          hasBadges && "Badges",
        ]
          .filter(Boolean)
          .join(" · ");

        const props: OptionProps = {
          label: runName,
          title: runName,
          checked,
          markerColor: hasMarker ? "pink" : undefined,
          secondaryLabel: hasRecency ? "1h ago" : undefined,
          badges: hasBadges ? badges : undefined,
        };

        return { name, props };
      }),
    ),
  ),
);

const longTitle =
  "Production baseline for the multilingual support dataset after the November prompt and retrieval revisions";

const stressCases: typeof variants = [
  {
    name: "Long unbroken label",
    props: {
      label: "production-baseline-support-dataset-revision-2026-11-25",
      title: longTitle,
      checked: false,
      markerColor: "foreground",
    },
  },
  {
    name: "Rich label with a long tooltip",
    props: {
      label: (
        <>
          <strong>Production baseline</strong> · <code>support-v2026.11</code>
        </>
      ),
      title: longTitle,
      checked: true,
      markerColor: "teal",
    },
  },
  {
    name: "Short label with long secondary text",
    props: {
      label: "A",
      title: "Run A — last updated on November 25, 2026",
      secondaryLabel: "Updated 11 months, 3 weeks ago",
      checked: false,
      markerColor: "amber",
    },
  },
  {
    name: "Long badge",
    props: {
      label: runName,
      title: runName,
      checked: true,
      badges: [
        {
          text: "Automatically selected from the latest production runs",
        },
      ],
    },
  },
  {
    name: "Long label, recency, and four badges",
    props: {
      label: longTitle,
      title: longTitle,
      checked: true,
      markerColor: "violet",
      secondaryLabel: "Yesterday at 11:59 PM",
      badges: [
        { text: "BASELINE" },
        { text: "LATEST" },
        { text: "Pending review" },
        { text: "Archived" },
      ],
    },
  },
];

export const VariantMatrix = meta.story({
  name: "(Test) Variant matrix",
  parameters: { controls: { disable: true }, layout: "fullscreen" },
  play: async ({ canvasElement }) => {
    await canvasElement.ownerDocument.fonts.ready;
    const rows = canvasElement.querySelectorAll<HTMLElement>(
      "[data-badged-option]",
    );
    await expect(rows).toHaveLength(16);

    for (const row of rows) {
      const option = within(row);
      const baseline = option.getByText("BASELINE").getBoundingClientRect();
      const latest = option.getByText("LATEST").getBoundingClientRect();
      await expect(baseline.height > 0).toBe(latest.height > 0);
      await expect(Math.abs(baseline.top - latest.top)).toBeLessThanOrEqual(1);
    }
  },
  render: () => (
    <div className="w-full p-2">
      <table className="w-full table-fixed border-separate border-spacing-2 text-left">
        <thead>
          <tr className="text-sm">
            <th scope="col" className="w-1/4">
              Variant
            </th>
            <th scope="col">Single select</th>
            <th scope="col">Multi-select</th>
          </tr>
        </thead>
        <tbody>
          {[...variants, ...stressCases].map(({ name, props }) => (
            <tr key={name}>
              <th
                scope="row"
                className="text-muted-foreground text-xs font-medium"
              >
                {name}
              </th>
              {[
                InputDropdown.SingleSelectOptionContent,
                InputDropdown.MultiSelectOptionContent,
              ].map((OptionContent, index) => (
                <td key={index} className="align-top">
                  <div className="bg-popover text-popover-foreground rounded-md border p-1.5">
                    <InputDropdown.Option highlight="aria-selected">
                      <div
                        data-badged-option={
                          props.badges === badges ? "" : undefined
                        }
                      >
                        <OptionContent {...props} />
                      </div>
                    </InputDropdown.Option>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
});
