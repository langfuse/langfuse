import { decodeHTML } from "entities";
import { marked } from "marked";

const LIMIT = 3500;
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const prose = (value) => escape(decodeHTML(value));
const part = (value, atomic = false) => ({ value, atomic });
const join = (parts, separator) =>
  parts.flatMap((value, index) =>
    index ? [part(separator), ...value] : value,
  );

function plain(tokens, includeLinks = false) {
  return tokens
    .map((token) => {
      if (token.type === "br") return "\n";
      if (token.type === "codespan" || token.type === "code") return token.text;
      if (includeLinks && (token.type === "link" || token.type === "image")) {
        const label = token.tokens
          ? plain(token.tokens, true)
          : decodeHTML(token.text);
        const href = decodeHTML(token.href);
        try {
          if (["http:", "https:", "mailto:"].includes(new URL(href).protocol))
            return label === href ? href : `${label} (${href})`;
        } catch {}
        return label;
      }
      if (token.tokens) return plain(token.tokens, includeLinks);
      return decodeHTML(token.text ?? token.raw ?? "");
    })
    .join("");
}

function link(token) {
  const label = token.tokens ? plain(token.tokens) : decodeHTML(token.text);
  const href = decodeHTML(token.href);
  try {
    const url = new URL(href);
    if (!["http:", "https:", "mailto:"].includes(url.protocol))
      return part(escape(label));
    const destination = escape(
      url.href
        .replaceAll("|", "%7C")
        .replaceAll("<", "%3C")
        .replaceAll(">", "%3E"),
    );
    const formatted = `<${destination}|${escape(label || href).replaceAll("|", "｜")}>`;
    return formatted.length <= LIMIT
      ? part(formatted, true)
      : part(escape(`${label} (${href})`));
  } catch {
    return part(escape(label));
  }
}

function code(value) {
  // Slack has one fence length, so literal triple backticks need a separator.
  return { value: escape(value.replace(/`(?=``)/g, "`\u200b")), code: true };
}

function inline(tokens) {
  return tokens.flatMap((token) => {
    switch (token.type) {
      case "strong":
      case "em":
      case "del": {
        const marker = { strong: "*", em: "_", del: "~" }[token.type];
        const children = inline(token.tokens);
        const value = `${marker}${children.map((child) => child.value).join("")}${marker}`;
        if (children.some((child) => child.code) || value.length > LIMIT)
          return part(escape(plain(token.tokens)));
        return part(value, true);
      }
      case "codespan":
        return token.text.includes("`") || escape(token.text).length + 2 > LIMIT
          ? code(token.text)
          : part(`\`${escape(token.text)}\``, true);
      case "link":
      case "image":
        return link(token);
      case "br":
        return part("\n");
      default:
        return token.tokens
          ? inline(token.tokens)
          : part(prose(token.text ?? token.raw ?? ""));
    }
  });
}

function table(token) {
  const rows = [token.header, ...token.rows].map((row) =>
    row.map((cell) => plain(cell.tokens, true)),
  );
  const fragments = [];
  for (let column = 0; column < token.header.length; column += 20) {
    const header = rows[0].slice(column, column + 20);
    const headerSize = header.reduce((sum, cell) => sum + cell.length, 0);
    const columnSettings = token.align
      .slice(column, column + 20)
      .map((align) => ({
        align: align ?? "left",
        is_wrapped: true,
      }));
    let batch = [header];
    let size = headerSize;
    const flush = () => {
      if (batch.length === 1 && rows.length > 1) return;
      const fallback = escape(batch.map((row) => row.join(" | ")).join("\n"));
      fragments.push({
        table: {
          text:
            fallback.length <= LIMIT
              ? fallback || "Empty table"
              : `Table with ${batch.length - 1} data rows and ${header.length} columns. See the table below.`,
          blocks: [
            {
              type: "table",
              column_settings: columnSettings,
              rows: batch.map((row) =>
                row.map((text) => ({ type: "raw_text", text })),
              ),
            },
          ],
        },
      });
      batch = [header];
      size = headerSize;
    };
    for (const fullRow of rows.slice(1)) {
      const row = fullRow.slice(column, column + 20);
      const rowSize = row.reduce((sum, cell) => sum + cell.length, 0);
      if (headerSize + rowSize > 10000) {
        flush();
        fragments.push(
          part(
            escape(
              row.map((cell, index) => `${header[index]}: ${cell}`).join("\n"),
            ) + "\n\n",
          ),
        );
        continue;
      }
      if (batch.length === 100 || size + rowSize > 10000) flush();
      batch.push(row);
      size += rowSize;
    }
    if (rows.length === 1 && headerSize > 10000) {
      fragments.push(part(escape(header.join(" | "))));
    } else {
      flush();
    }
  }
  return fragments;
}

function blocks(tokens, indent = "") {
  return join(
    tokens
      .filter((token) => token.type !== "space")
      .map((token) => {
        switch (token.type) {
          case "heading": {
            const text = plain(token.tokens);
            const value = escape(text);
            return [
              part(value.length + 2 <= LIMIT ? `*${value}*` : value, true),
            ];
          }
          case "code":
            return [code(token.text)];
          case "table":
            return table(token);
          case "hr":
            return [part("───")];
          case "blockquote": {
            let lineStart = true;
            return blocks(token.tokens).map((child) => {
              if (child.code || child.table) {
                lineStart = true;
                return child;
              }
              if (!child.value.trim()) {
                if (child.value.includes("\n")) lineStart = true;
                return child;
              }
              const value =
                (lineStart ? "> " : "") +
                child.value.replace(/\n(?=[^\n]*\S)/g, "\n> ");
              lineStart = child.value.endsWith("\n");
              return { ...child, value };
            });
          }
          case "list":
            return join(
              token.items.map((item, index) => {
                const bullet = item.task
                  ? item.checked
                    ? "☑"
                    : "☐"
                  : token.ordered
                    ? `${Number(token.start) + index}.`
                    : "•";
                const content = item.tokens
                  .filter((child) => child.type !== "checkbox")
                  .flatMap((child, childIndex) => {
                    if (child.type === "list")
                      return [part("\n"), ...blocks([child], `${indent}  `)];
                    return [
                      ...(childIndex ? [part(`\n${indent}  `)] : []),
                      ...blocks([child], indent),
                    ];
                  });
                return [part(`${indent}${bullet} `), ...content];
              }),
              "\n",
            );
          default:
            return token.tokens
              ? inline(token.tokens)
              : [part(prose(token.text ?? token.raw ?? ""))];
        }
      }),
    "\n\n",
  );
}

/** Convert only at the Slack boundary; keep agent Markdown untouched. */
export function formatSlackMessages(markdown) {
  const messages = [];
  let current = "";
  const flush = () => {
    if (current.trim()) messages.push({ text: current });
    current = "";
  };
  const append = (value, prefix = "", suffix = "") => {
    const units = value.match(/&(?:amp|lt|gt);|[\s\S]/gu) ?? [];
    let offset = 0;
    while (offset < units.length) {
      let size = current.length + prefix.length + suffix.length;
      let end = offset;
      let boundary = offset;
      while (end < units.length && size + units[end].length <= LIMIT) {
        size += units[end].length;
        if (/\s/u.test(units[end])) boundary = end + 1;
        end++;
      }
      if (end === offset) {
        flush();
        continue;
      }
      if (end < units.length && boundary > offset) end = boundary;
      current += prefix + units.slice(offset, end).join("") + suffix;
      offset = end;
      if (offset < units.length) flush();
    }
  };
  for (const fragment of blocks(marked.lexer(markdown, { gfm: true }))) {
    if (fragment.table) {
      flush();
      messages.push(fragment.table);
    } else if (fragment.code) {
      flush();
      append(fragment.value || " ", "```\n", "\n```");
      flush();
    } else if (fragment.atomic && fragment.value.length <= LIMIT) {
      if (current.length + fragment.value.length > LIMIT) flush();
      current += fragment.value;
    } else {
      append(fragment.value);
    }
  }
  flush();
  return messages;
}
