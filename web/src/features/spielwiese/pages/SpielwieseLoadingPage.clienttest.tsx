import { render, screen } from "@testing-library/react";
import SpielwieseLoadingPage, {
  getSpielwieseLoadingRoute,
  isSpielwieseLoadingPath,
} from "./SpielwieseLoadingPage";

describe("SpielwieseLoadingPage route helpers", () => {
  it("detects spielwiese loading paths", () => {
    expect(
      isSpielwieseLoadingPath(
        "/dev/spielwiese/[[...slug]]",
        "/dev/spielwiese/dashboard",
      ),
    ).toBe(true);
    expect(isSpielwieseLoadingPath("/dev/spielwiese", "/dev/spielwiese")).toBe(
      true,
    );
    expect(isSpielwieseLoadingPath("/project/[id]", "/project/1")).toBe(false);
  });

  it("maps spielwiese paths to the matching loading skeleton route", () => {
    expect(getSpielwieseLoadingRoute("/dev/spielwiese")).toBe("intro");
    expect(getSpielwieseLoadingRoute("/dev/spielwiese/onboarding/intent")).toBe(
      "onboarding",
    );
    expect(
      getSpielwieseLoadingRoute("/dev/spielwiese/dashboard#assistant"),
    ).toBe("dashboard");
  });
});

describe("SpielwieseLoadingPage", () => {
  it("renders the dashboard skeleton with a scoped spielwiese root", () => {
    render(<SpielwieseLoadingPage route="dashboard" />);

    const root = screen.getByTestId("spielwiese-loading-page");

    expect(root.getAttribute("data-route")).toBe("dashboard");
    expect(root.getAttribute("data-spielwiese")).not.toBeNull();
    expect(root.style.colorScheme).toBe("light");
    expect(root.style.getPropertyValue("--background")).toBe("0 0% 100%");
    expect(root.textContent).toBe("");
  });

  it("renders page-shaped skeletons for each spielwiese route", () => {
    for (const route of ["intro", "onboarding", "dashboard"] as const) {
      const { unmount } = render(<SpielwieseLoadingPage route={route} />);

      expect(
        screen.getByTestId(`spielwiese-loading-${route}-skeleton`),
      ).toBeTruthy();
      unmount();
    }
  });

  it("keeps all spielwiese loading skeletons free of shadow styling", () => {
    for (const route of ["intro", "onboarding", "dashboard"] as const) {
      const { container, unmount } = render(
        <SpielwieseLoadingPage route={route} />,
      );
      const classNames = Array.from(container.querySelectorAll("[class]")).map(
        (node) => node.className,
      );

      expect(
        classNames.every((className) => !String(className).includes("shadow")),
      ).toBe(true);
      unmount();
    }
  });

  it("keeps spielwiese loading skeleton colors neutral instead of warm", () => {
    for (const route of ["intro", "onboarding", "dashboard"] as const) {
      const { container, unmount } = render(
        <SpielwieseLoadingPage route={route} />,
      );

      expect(container.innerHTML).not.toMatch(
        /91,71,55|183,150,116|255,251,247|255,250,245/i,
      );
      unmount();
    }
  });
});
