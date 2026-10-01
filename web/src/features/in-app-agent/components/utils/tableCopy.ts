import { getSafeLinkUrl } from "@/src/components/ui/safe-url";

export type RenderedTable = {
  headers: string[];
  rows: string[][];
  /**
   * Cells are already safe to place in a Markdown table. Plain-text callers
   * leave this unset so `tableToMarkdown` still escapes `|` and `\`.
   */
  markdownReady?: boolean;
};

const BLOCK_COPY_BUTTON_SELECTOR = "[data-in-app-agent-block-copy-button]";

function normalizeCell(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cellValue(cell: Element, format: "text" | "markdown") {
  const clone = cell.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    const text = normalizeCell(cell.textContent ?? "");
    return format === "markdown" ? escapeMarkdownCell(text) : text;
  }

  clone.querySelectorAll(BLOCK_COPY_BUTTON_SELECTOR).forEach((node) => {
    node.remove();
  });

  return normalizeCell(renderInline(clone, format));
}

function renderInline(node: Node, format: "text" | "markdown"): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return format === "markdown" ? escapeMarkdownCell(text) : text;
  }

  if (!(node instanceof HTMLElement)) {
    return [...node.childNodes]
      .map((child) => renderInline(child, format))
      .join("");
  }

  if (node.tagName === "BR") {
    return "\n";
  }

  const children = [...node.childNodes]
    .map((child) => renderInline(child, format))
    .join("");
  if (format !== "markdown" || node.tagName !== "A") {
    return children;
  }

  const href = getSafeLinkUrl(node.getAttribute("href"));
  const label = normalizeCell(children);
  if (!href || !label) {
    return children;
  }

  const text = label.replace(/[[\]]/g, "\\$&");
  const url = href.replace(/[()\\|]/g, "\\$&");
  return `[${text}](${url})`;
}

function rowCells(row: Element, format: "text" | "markdown") {
  return [...row.querySelectorAll(":scope > th, :scope > td")].map((cell) =>
    cellValue(cell, format),
  );
}

export function readRenderedTable(
  table: HTMLTableElement,
  format: "text" | "markdown" = "text",
): RenderedTable {
  const sectionRows = [
    ...table.querySelectorAll(":scope > thead > tr"),
    ...table.querySelectorAll(":scope > tbody > tr"),
    ...table.querySelectorAll(":scope > tfoot > tr"),
  ].map((row) => rowCells(row, format));
  const looseRows = [...table.querySelectorAll(":scope > tr")].map((row) =>
    rowCells(row, format),
  );
  const [headers = [], ...rows] = [...sectionRows, ...looseRows].filter(
    (row) => row.length > 0,
  );

  return {
    headers,
    rows,
    markdownReady: format === "markdown",
  };
}

function columnCount(table: RenderedTable) {
  let width = table.headers.length;
  for (const row of table.rows) {
    if (row.length > width) {
      width = row.length;
    }
  }
  return width;
}

function paddedRows(table: RenderedTable) {
  const width = columnCount(table);
  if (width === 0) {
    return null;
  }

  const pad = (cells: string[]) => {
    const padded = cells.slice(0, width).map(normalizeCell);
    while (padded.length < width) {
      padded.push("");
    }
    return padded;
  };

  return {
    headers: pad(table.headers),
    rows: table.rows.map(pad),
  };
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeMarkdownCell(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

export function tableToCsv(table: RenderedTable) {
  const padded = paddedRows(table);
  if (!padded) {
    return "";
  }

  return [padded.headers, ...padded.rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
}

export function tableToMarkdown(table: RenderedTable) {
  const padded = paddedRows(table);
  if (!padded) {
    return "";
  }

  const escape = table.markdownReady
    ? (value: string) => value
    : escapeMarkdownCell;
  const header = padded.headers.map(escape);
  const separator = padded.headers.map(() => "---");
  const body = padded.rows.map((row) => row.map(escape));

  return [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}
