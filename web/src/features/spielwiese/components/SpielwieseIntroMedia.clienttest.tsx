import { fireEvent, render, screen } from "@testing-library/react";
import { SpielwieseIntroCurrentDashboardImage } from "./SpielwieseIntroMedia";

it("zooms the current dashboard image and closes it by clicking outside", () => {
  render(<SpielwieseIntroCurrentDashboardImage />);

  expect(
    screen.queryByTestId("spielwiese-intro-current-dashboard-zoom"),
  ).toBeNull();

  fireEvent.click(
    screen.getByTestId("spielwiese-intro-current-dashboard-image"),
  );

  const zoomOverlay = screen.getByTestId(
    "spielwiese-intro-current-dashboard-zoom",
  );
  const zoomImage = zoomOverlay.querySelector("img");
  const zoomPanel = zoomImage?.parentElement;

  expect(zoomOverlay).toBeTruthy();
  expect(zoomImage).toBeTruthy();
  expect(zoomOverlay.className).toContain(
    "animate-spielwiese-intro-zoom-backdrop-in",
  );
  expect(zoomPanel?.className).toContain(
    "animate-spielwiese-intro-zoom-panel-in",
  );
  expect(zoomPanel?.className).toContain("max-h-[72dvh]");
  expect(zoomPanel?.className).toContain("max-w-[min(82vw,70rem)]");

  fireEvent.click(zoomImage as HTMLImageElement);

  expect(
    screen.getByTestId("spielwiese-intro-current-dashboard-zoom"),
  ).toBeTruthy();

  fireEvent.click(zoomOverlay);

  expect(
    screen.queryByTestId("spielwiese-intro-current-dashboard-zoom"),
  ).toBeNull();
});
