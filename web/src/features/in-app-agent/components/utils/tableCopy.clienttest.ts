import { describe, expect, it } from "vitest";
import { readRenderedTable, tableToCsv, tableToMarkdown } from "./tableCopy";

function tableFromHtml(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  const table = container.querySelector("table");
  if (!table) {
    throw new Error("Missing table");
  }
  return table;
}

describe("table copy", () => {
  it("keeps the header row when the markup has no thead", () => {
    const table = readRenderedTable(
      tableFromHtml(`
        <table>
          <tbody>
            <tr><td>Priority</td><td>Status</td></tr>
            <tr><td>1</td><td>New, now</td></tr>
          </tbody>
        </table>
      `),
    );

    expect(tableToCsv(table)).toBe('Priority,Status\n1,"New, now"');
    expect(tableToMarkdown(table)).toBe(
      ["| Priority | Status |", "| --- | --- |", "| 1 | New, now |"].join("\n"),
    );
  });

  it("reads header cells separately from body cells", () => {
    const table = readRenderedTable(
      tableFromHtml(`
        <table>
          <thead>
            <tr><th>Note</th><th>Value</th></tr>
          </thead>
          <tbody>
            <tr><td>say "hi"<br>please</td><td>a|b\\c</td></tr>
          </tbody>
        </table>
      `),
    );

    expect(tableToCsv(table)).toBe('Note,Value\n"say ""hi"" please",a|b\\c');
    expect(tableToMarkdown(table)).toBe(
      [
        "| Note | Value |",
        "| --- | --- |",
        '| say "hi" please | a\\|b\\\\c |',
      ].join("\n"),
    );
  });

  it("pads a short header so every column still has a header cell", () => {
    expect(
      tableToCsv({
        headers: ["Only"],
        rows: [["1", "2"]],
      }),
    ).toBe("Only,\n1,2");
    expect(
      tableToMarkdown({
        headers: ["Only"],
        rows: [["1", "2"]],
      }),
    ).toBe(["| Only |  |", "| --- | --- |", "| 1 | 2 |"].join("\n"));
  });

  it("keeps a safe link target when copying markdown", () => {
    const table = tableFromHtml(`
      <table>
        <thead>
          <tr><th>Where</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>see <a href="https://example.com/docs">a|b</a> and <a href="javascript:alert(1)">skip</a></td>
          </tr>
        </tbody>
      </table>
    `);

    expect(tableToCsv(readRenderedTable(table))).toBe(
      "Where\nsee a|b and skip",
    );
    expect(tableToMarkdown(readRenderedTable(table, "markdown"))).toBe(
      [
        "| Where |",
        "| --- |",
        "| see [a\\|b](https://example.com/docs) and skip |",
      ].join("\n"),
    );
  });

  it("ignores copy controls nested in a cell", () => {
    const table = readRenderedTable(
      tableFromHtml(`
        <table>
          <thead>
            <tr>
              <th>Priority<button data-in-app-agent-block-copy-button="true">.csv</button></th>
            </tr>
          </thead>
          <tbody>
            <tr><td>1</td></tr>
          </tbody>
        </table>
      `),
    );

    expect(table.headers).toEqual(["Priority"]);
    expect(tableToCsv(table)).toBe("Priority\n1");
  });
});
