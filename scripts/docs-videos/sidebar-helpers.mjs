// Helpers for the tables' filter sidebar, shared by scenes that filter from it.

/** Hovers a facet value and clicks its "Only" shortcut. */
export async function facetOnly(scene, facet, value) {
  const { page, glideTo, glideClick } = scene;
  const region = page.getByRole("region", { name: facet, exact: true });
  const label = region.getByText(value, { exact: true });
  await label.scrollIntoViewIfNeeded();
  const box = await label.boundingBox();
  await glideTo(box.x + box.width * 0.4, box.y + box.height / 2, 900);
  // Each value row reveals its own "Only" on hover.
  const only = label.locator("xpath=..").getByText("Only", { exact: true });
  await only.waitFor();
  await page.waitForTimeout(450);
  await glideClick(only, 500, { x: 0.5, y: 0.5 });
}

/**
 * Clears the sidebar's search and every filter. Sidebar selections are
 * mirrored as chips in the table's search bar, so clearing that clears them.
 */
export async function clearSidebarFilters(page) {
  const search = page.getByRole("textbox", { name: "Search filters" });
  if (await search.isVisible()) await search.fill("");
  const bar = page.getByRole("combobox", { name: "Search" }).first();
  await bar.click();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Backspace");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    document.activeElement?.blur();
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollTop > 0) el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(800);
}
