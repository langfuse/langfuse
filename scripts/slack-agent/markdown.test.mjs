import assert from "node:assert/strict";
import test from "node:test";
import { formatSlackMessages } from "./markdown.mjs";

const texts = (input) =>
  formatSlackMessages(input).map((message) => message.text);
const format = (input) => texts(input).join("\n");

test("renders Markdown blocks, emphasis, nested lists, and tasks as Slack text", () => {
  const output = format(
    "# Summary\n\n**bold** and *italic* and ~~old~~\n\n3. third\n   - nested\n4. fourth\n\n- [x] done\n- [ ] todo\n\n> quoted **text**",
  );
  assert.match(output, /^\*Summary\*/);
  assert.match(output, /\*bold\* and _italic_ and ~old~/);
  assert.match(output, /3\. third\n  • nested\n4\. fourth/);
  assert.match(output, /☑ done\n☐ todo/);
  assert.match(output, /> quoted \*text\*/);
});

test("preserves code and renders tables without treating their content as Markdown", () => {
  const output = format(
    "`**literal**`\n\n```js\nconst x = '[label](https://example.com)';\nif (a < b && c) {}\n```\n\n| Name | Count |\n| --- | --- |\n| **trace** | 2 |",
  );
  assert.match(output, /`\*\*literal\*\*`/);
  assert.match(output, /```\nconst x = '\[label\]\(https:\/\/example.com\)';/);
  assert.match(output, /a &lt; b &amp;&amp; c/);
  assert.doesNotMatch(output, /```js/);
  assert.match(output, /Name\s+\| Count\n/);
  assert.match(output, /trace\s+\| 2/);
});

test("renders links, reference links, images, and autolinks without enabling Slack mentions", () => {
  const output = format(
    "[Trace](https://example.com/a_(b)?x=1&y=2) [ref][id] ![plot](https://example.com/img.png) <https://example.com>\n\n[id]: mailto:test@example.com\n\n<!channel> <@U123> <script>alert(1)</script>\n\n[bad](javascript:alert(1)) [pipe](https://example.com/a|b)",
  );
  assert.match(output, /<https:\/\/example.com\/a_\(b\)\?x=1&amp;y=2\|Trace>/);
  assert.match(output, /<mailto:test@example.com\|ref>/);
  assert.match(output, /<https:\/\/example.com\/img.png\|plot>/);
  assert.match(output, /&lt;!channel&gt;/);
  assert.match(output, /&lt;@U123&gt;/);
  assert.match(output, /&lt;script&gt;/);
  assert.doesNotMatch(output, /<javascript:/);
  assert.match(output, /<https:\/\/example.com\/a%7Cb\|pipe>/);
});

test("chunks long prose without breaking links, entities, Unicode, or inline styles", () => {
  const chunks = texts(
    `${"😀 & ".repeat(800)} **${"bold ".repeat(1000)}** [trace](https://example.com/trace)`,
  );
  assert.ok(chunks.length > 2);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 3500);
    assert.ok(chunk.isWellFormed());
    assert.doesNotMatch(chunk, /&(?:a(?:m(?:p)?)?|l(?:t)?|g(?:t)?)$/);
    assert.equal(
      (chunk.match(/<https:/g) ?? []).length,
      (chunk.match(/\|trace>/g) ?? []).length,
    );
  }
  assert.match(chunks.join(""), /<https:\/\/example.com\/trace\|trace>/);
});

test("splits long code into independently fenced messages", () => {
  const chunks = texts(`\`\`\`sql\n${"select '<&>';\n".repeat(900)}\`\`\``);
  assert.ok(chunks.length > 2);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 3500);
    assert.match(chunk, /^```\n/);
    assert.match(chunk, /\n```$/);
    assert.equal((chunk.match(/```/g) ?? []).length, 2);
  }
});

test("keeps literal fence delimiters from escaping code and safely degrades oversized links", () => {
  const output = format("````\na ``` b\n````");
  assert.equal((output.match(/```/g) ?? []).length, 2);
  const chunks = texts(`[name](https://example.com/${"x".repeat(4000)})`);
  assert.ok(chunks.every((chunk) => chunk.length <= 3500));
  assert.ok(!chunks.join("").includes("<https:"));
  assert.ok(chunks.join("").includes("name"));
});

test("decodes Markdown prose entities while keeping code entities literal", () => {
  const output = format(
    "A &amp; B &copy; &#60;!here&#62;\n\n`&amp;`\n\n[query](https://example.com/?a=1&amp;b=2)",
  );
  assert.match(output, /A &amp; B © &lt;!here&gt;/);
  assert.match(output, /`&amp;amp;`/);
  assert.match(output, /<https:\/\/example.com\/\?a=1&amp;b=2\|query>/);
  const chunks = texts(`\`${"&".repeat(1500)}\``);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 3500));
  assert.ok(
    chunks.every(
      (chunk) => chunk.startsWith("```\n") && chunk.endsWith("\n```"),
    ),
  );
});

test("splits native tables by rows, columns, and cell character budgets", () => {
  const messages = formatSlackMessages(
    `| Name | Count |\n|---|---|\n${"| trace | 2 |\n".repeat(600)}`,
  );
  assert.equal(messages.length, 7);
  assert.equal(
    messages.reduce(
      (sum, message) => sum + message.blocks[0].rows.length - 1,
      0,
    ),
    600,
  );
  for (const message of messages) {
    assert.ok(message.text.length <= 3500);
    assert.ok(message.blocks[0].rows.length <= 100);
    assert.equal(message.blocks[0].rows[0][0].text, "Name");
  }
  const columns = Array.from({ length: 25 }, (_, index) => `Column${index}`);
  const wide = formatSlackMessages(
    `| ${columns.join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |\n| ${columns.map((_, index) => `value${index}`).join(" | ")} |`,
  );
  assert.deepEqual(
    wide.map((message) => message.blocks[0].rows[0].length),
    [20, 5],
  );
  assert.equal(wide[1].blocks[0].rows[1][4].text, "value24");
  const large = formatSlackMessages(
    `| Name |\n|---|\n${`| ${"x".repeat(2000)} |\n`.repeat(8)}`,
  );
  assert.equal(large.length, 2);
  assert.ok(
    large.every(
      (message) =>
        message.blocks[0].rows
          .flat()
          .reduce((sum, cell) => sum + cell.text.length, 0) <= 10000,
    ),
  );
  assert.ok(
    texts(`# ${"heading ".repeat(1000)}`).every(
      (chunk) => chunk.length <= 3500,
    ),
  );
});

test("falls back without losing oversized cell data and leaves quoted tables intact", () => {
  const content = "x".repeat(12000);
  const messages = formatSlackMessages(`| Name |\n|---|\n| ${content} |`);
  assert.ok(
    messages.every((message) => !message.blocks && message.text.length <= 3500),
  );
  assert.equal(
    messages
      .map((message) => message.text)
      .join("")
      .replace("Name: ", "")
      .trim(),
    content,
  );
  const quoted = formatSlackMessages(
    "> | Name | Count |\n> |---|---|\n> | trace | 2 |",
  );
  assert.equal(quoted.length, 1);
  assert.equal(quoted[0].blocks[0].rows[1][0].text, "trace");
});

test("preserves code inside blockquotes without stray quote messages or code prefixes", () => {
  const chunks = texts("> ```js\n> const a = 1;\n> const b = 2;\n> ```");
  assert.deepEqual(chunks, ["```\nconst a = 1;\nconst b = 2;\n```"]);
  const mixed = texts(
    "> Explanation\n>\n> ```js\n> const a = 1;\n> const b = 2;\n> ```\n>\n> More explanation",
  );
  assert.equal(mixed.length, 3);
  assert.match(mixed[0], /^> Explanation/);
  assert.equal(mixed[1], "```\nconst a = 1;\nconst b = 2;\n```");
  assert.match(mixed[2], /> More explanation/);
  assert.ok(mixed.every((chunk) => !/^\s*>\s*$/.test(chunk)));
});

test("renders a native Slack table with raw cells and Markdown column alignment", () => {
  const messages = formatSlackMessages(
    "| **Name** | Count |\n| :--- | ---: |\n| <!channel> [trace](https://example.com) | 2 |",
  );
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].blocks, [
    {
      type: "table",
      column_settings: [
        { align: "left", is_wrapped: true },
        { align: "right", is_wrapped: true },
      ],
      rows: [
        [
          { type: "raw_text", text: "Name" },
          { type: "raw_text", text: "Count" },
        ],
        [
          { type: "raw_text", text: "<!channel> trace (https://example.com)" },
          { type: "raw_text", text: "2" },
        ],
      ],
    },
  ]);
  assert.match(messages[0].text, /&lt;!channel&gt;/);
});
