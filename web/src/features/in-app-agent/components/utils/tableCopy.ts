export type RenderedTable = {
  headers: string[];
  rows: string[][];
};

const BLOCK_COPY_BUTTON_SELECTOR = "[data-in-app-agent-block-copy-button]";

function normalizeCell(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cellText(cell: Element) {
  const clone = cell.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    return normalizeCell(cell.textContent ?? "");
  }

  clone.querySelectorAll(BLOCK_COPY_BUTTON_SELECTOR).forEach((node) => {
    node.remove();
  });
  clone.querySelectorAll("br").forEach((node) => {
    node.replaceWith("\n");
  });

  return normalizeCell(clone.textContent ?? "");
}

function rowCells(row: Element) {
  return [...row.querySelectorAll(":scope > th, :scope > td")].map(cellText);
}

export function readRenderedTable(table: HTMLTableElement): RenderedTable {
  const sectionRows = [
    ...table.querySelectorAll(":scope > thead > tr"),
    ...table.querySelectorAll(":scope > tbody > tr"),
    ...table.querySelectorAll(":scope > tfoot > tr"),
  ].map(rowCells);
  const looseRows = [...table.querySelectorAll(":scope > tr")].map(rowCells);
  const [headers = [], ...rows] = [...sectionRows, ...looseRows].filter(
    (row) => row.length > 0,
  );

  return { headers, rows };
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

  const header = padded.headers.map(escapeMarkdownCell);
  const separator = padded.headers.map(() => "---");
  const body = padded.rows.map((row) => row.map(escapeMarkdownCell));

  return [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}
