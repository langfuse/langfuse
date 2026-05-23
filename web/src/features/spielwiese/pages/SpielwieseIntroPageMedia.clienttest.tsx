import { fireEvent, render, screen } from "@testing-library/react";
import { spielwieseSetupMomentContent } from "../components/spielwieseSetupMomentContent";
import { preloadSpielwieseSignUpShader } from "../onboarding/components/spielwieseSignUpShaderPreload";
import SpielwieseIntroPage from "./SpielwieseIntroPage";

jest.mock("../onboarding/components/spielwieseSignUpShaderPreload", () => ({
  preloadSpielwieseSignUpShader: jest.fn(),
}));

const mockedPreloadSpielwieseSignUpShader = jest.mocked(
  preloadSpielwieseSignUpShader,
);
const renderIntroPage = () => render(<SpielwieseIntroPage />);

it("starts preloading the onboarding shader with the intro page bundle", () => {
  expect(mockedPreloadSpielwieseSignUpShader).toHaveBeenCalledTimes(1);
});

it("renders the embedded images and intro video inside the article", () => {
  renderIntroPage();

  expect(screen.getByTestId("spielwiese-intro-article")).toBeTruthy();
  expect(
    screen.getByTestId("spielwiese-intro-setup-moment-image"),
  ).toBeTruthy();
  expect(
    screen.getByTestId("spielwiese-intro-current-dashboard-image"),
  ).toBeTruthy();
  expect(
    screen.queryByText("[ image of setup, aha, habit moment ]"),
  ).toBeNull();
  expect(
    screen.queryByText("[ image of current langfuse dashboard ]"),
  ).toBeNull();
  expect(screen.getByTestId("spielwiese-intro-video-shell")).toBeTruthy();
  expect(
    screen.getByTestId("spielwiese-intro-video-embed").getAttribute("src"),
  ).toBe("https://supercut.ai/embed/evren/oytU71kWAMHfHJtASg8NA2?embed=full");
  expect(screen.queryByText(spielwieseSetupMomentContent.videoNote)).toBeNull();
});

it("keeps the onboarding shader preload warm when the entry link is targeted", () => {
  mockedPreloadSpielwieseSignUpShader.mockClear();
  renderIntroPage();

  const entryLink = screen.getByTestId("spielwiese-intro-enter-link");

  fireEvent.mouseEnter(entryLink);
  fireEvent.focus(entryLink);
  fireEvent.pointerDown(entryLink);

  expect(mockedPreloadSpielwieseSignUpShader).toHaveBeenCalledTimes(3);
});
