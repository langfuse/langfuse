import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Search, SearchIcon } from "@langfuse/icons";
import { SiGithub } from "@langfuse/icons/si";
import { TbBrandAzure } from "@langfuse/icons/tb";

test("semantic sizes apply across icon libraries", () => {
  for (const Icon of [Search, SiGithub, TbBrandAzure]) {
    for (const [size, pixels] of [
      ["sm", 12],
      ["base", 14],
      ["lg", 20],
      ["xl", 28],
    ] as const) {
      const html = renderToStaticMarkup(<Icon size={size} />);
      assert.match(html, new RegExp(`width="${pixels}"`));
      assert.match(html, new RegExp(`height="${pixels}"`));
    }
    assert.match(renderToStaticMarkup(<Icon />), /width="14"/);
  }
});

test("aliases render the same icon", () => {
  assert.equal(Search, SearchIcon);
  assert.equal(
    renderToStaticMarkup(<Search />),
    renderToStaticMarkup(<SearchIcon />),
  );
});

test("icons do not shrink in flex layouts by default", () => {
  for (const Icon of [Search, SiGithub, TbBrandAzure]) {
    assert.match(renderToStaticMarkup(<Icon />), /flex-shrink:0/);
  }
});

test("semantic colors resolve through themed variables across icon libraries", () => {
  for (const Icon of [Search, SiGithub, TbBrandAzure]) {
    for (const [color, token] of [
      ["default", "icon-foreground"],
      ["foreground", "foreground"],
      ["muted", "muted-foreground"],
      ["secondary", "foreground-secondary"],
      ["tertiary", "foreground-tertiary"],
      ["destructive", "destructive"],
    ] as const) {
      const html = renderToStaticMarkup(<Icon color={color} />);
      assert.ok(html.includes(`color:hsl(var(--${token}))`));
      assert.doesNotMatch(html, / color="/);
    }
  }
});

test("default and explicit inherited colors leave parent-owned states in control", () => {
  for (const Icon of [Search, SiGithub, TbBrandAzure]) {
    assert.doesNotMatch(renderToStaticMarkup(<Icon />), /color:/);
    assert.doesNotMatch(
      renderToStaticMarkup(<Icon color="inherit" />),
      /color:/,
    );
    assert.match(
      renderToStaticMarkup(
        <Icon color="default" __rawStyle={{ color: "rebeccapurple" }} />,
      ),
      /color:rebeccapurple/,
    );
  }
});

test("preserves accessibility and the libraries' stroke widths", () => {
  const html = renderToStaticMarkup(
    <Search aria-label="Search" role="img" data-testid="search" />,
  );
  assert.match(html, /aria-label="Search"/);
  assert.match(html, /role="img"/);
  assert.match(html, /data-testid="search"/);
  assert.match(html, /stroke-width="2"/);
  assert.match(renderToStaticMarkup(<SiGithub />), /stroke-width="0"/);
});

test("drops forbidden props at runtime, including injected props", () => {
  const injectedProps: Record<string, unknown> = {
    className: "forbidden",
    style: { width: 99 },
    width: 99,
    height: 99,
    strokeWidth: 99,
  };
  const html = renderToStaticMarkup(<Search {...injectedProps} />);
  assert.doesNotMatch(html, /forbidden|99/);
  assert.match(html, /width="14"/);
  assert.match(html, /stroke-width="2"/);
});

test("explicit raw props remain escape hatches", () => {
  const html = renderToStaticMarkup(
    <Search
      __rawClassName="animate-spin"
      __rawStyle={{ width: 48, height: 48 }}
    />,
  );
  assert.match(html, /animate-spin/);
  assert.match(html, /width:48px;height:48px/);
  assert.match(html, /flex-shrink:0/);
  assert.doesNotMatch(html, /__raw/);
});
