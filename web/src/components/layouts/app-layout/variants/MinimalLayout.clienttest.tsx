import { render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import { MinimalLayout } from "./MinimalLayout";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/dynamic", () => () => () => null);

const mockedUseRouter = jest.mocked(useRouter);

describe("MinimalLayout", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders agentation for the spielwiese dev route", () => {
    mockedUseRouter.mockReturnValue({
      pathname: "/dev/spielwiese",
    } as ReturnType<typeof useRouter>);

    render(
      <MinimalLayout>
        <div>Spielwiese</div>
      </MinimalLayout>,
    );

    expect(screen.getByText("Spielwiese")).toBeTruthy();
    expect(screen.getByTestId("agentation-surface")).toBeTruthy();
  });

  it("does not render agentation for other minimal routes", () => {
    mockedUseRouter.mockReturnValue({
      pathname: "/dev/dashboard",
    } as ReturnType<typeof useRouter>);

    render(
      <MinimalLayout>
        <div>Dashboard</div>
      </MinimalLayout>,
    );

    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.queryByTestId("agentation-surface")).toBeNull();
  });
});
