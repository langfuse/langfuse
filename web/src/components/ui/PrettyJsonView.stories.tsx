import { expect } from "storybook/test";
import preview from "../../../.storybook/preview";
import { PrettyJsonView } from "./PrettyJsonView";

const mediaPayload = {
  type: "image",
  mediaType: "image/png",
  content: "data:image/png;base64,iVBORw0KGgo=",
};

const meta = preview.meta({
  component: PrettyJsonView,
});

async function writeDebugLog(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
}) {
  try {
    const { commands } = await import("vitest/browser");
    await commands.writeFile(
      "/opt/cursor/logs/debug.log",
      `${JSON.stringify({ ...payload, timestamp: Date.now() })}\n`,
      { flag: "a" },
    );
  } catch {
    // The filesystem bridge only exists when the story runs through Vitest.
  }
}

export const NarrowFormattedMediaLayout = meta.story({
  name: "(Test) Narrow formatted media layout",
  render: () => (
    <div
      data-testid="narrow-formatted-media"
      className="w-[205px] overflow-hidden rounded-2xl bg-blue-50 p-4"
    >
      <p className="mb-2 text-sm">Show this S3 image.</p>
      <PrettyJsonView json={mediaPayload} currentView="pretty" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const outer = canvasElement.querySelector<HTMLElement>(
      '[data-testid="narrow-formatted-media"]',
    );
    const table = canvasElement.querySelector<HTMLTableElement>("table");
    const firstRow = table?.querySelector<HTMLTableRowElement>("tbody tr");
    const keyCell = firstRow?.cells.item(0) ?? null;
    const valueCell = firstRow?.cells.item(1) ?? null;
    const chip = canvasElement.querySelector<HTMLButtonElement>(
      "button[data-media-tag]",
    );

    await expect(outer).not.toBeNull();
    await expect(table).not.toBeNull();
    await expect(keyCell).not.toBeNull();
    await expect(valueCell).not.toBeNull();
    await expect(chip).not.toBeNull();

    if (!outer || !table || !keyCell || !valueCell || !chip) return;

    const rect = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        height: bounds.height,
      };
    };

    // #region agent log
    await writeDebugLog({
      hypothesisId: "A,D",
      location: "PrettyJsonView.stories.tsx:NarrowFormattedMediaLayout",
      message: "Narrow formatted view entry dimensions",
      data: {
        outer: rect(outer),
        clientWidth: outer.clientWidth,
        scrollWidth: outer.scrollWidth,
      },
    });
    // #endregion

    // #region agent log
    await writeDebugLog({
      hypothesisId: "B,D",
      location: "PrettyJsonView.stories.tsx:NarrowFormattedMediaLayout",
      message: "Formatted table computed layout",
      data: {
        table: rect(table),
        clientWidth: table.clientWidth,
        scrollWidth: table.scrollWidth,
        tableLayout: getComputedStyle(table).tableLayout,
        width: getComputedStyle(table).width,
      },
    });
    // #endregion

    // #region agent log
    await writeDebugLog({
      hypothesisId: "A,B",
      location: "PrettyJsonView.stories.tsx:NarrowFormattedMediaLayout",
      message: "Key and value column allocation",
      data: {
        keyCell: rect(keyCell),
        keyCellInlineWidth: keyCell.style.width,
        keyContent: rect(keyCell.firstElementChild ?? keyCell),
        keyContentMinWidth: getComputedStyle(
          keyCell.firstElementChild ?? keyCell,
        ).minWidth,
        valueCell: rect(valueCell),
        valueCellInlineWidth: valueCell.style.width,
      },
    });
    // #endregion

    // #region agent log
    await writeDebugLog({
      hypothesisId: "C",
      location: "PrettyJsonView.stories.tsx:NarrowFormattedMediaLayout",
      message: "Media chip size inside value column",
      data: {
        chip: rect(chip),
        className: chip.className,
        valueCell: rect(valueCell),
      },
    });
    // #endregion

    // #region agent log
    await writeDebugLog({
      hypothesisId: "D",
      location: "PrettyJsonView.stories.tsx:NarrowFormattedMediaLayout",
      message: "Overflow chain between table and constrained card",
      data: {
        ancestors: [table.parentElement, table.parentElement?.parentElement]
          .filter((element): element is HTMLElement => Boolean(element))
          .map((element) => ({
            rect: rect(element),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            overflow: getComputedStyle(element).overflow,
          })),
      },
    });
    // #endregion
  },
});
