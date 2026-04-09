import { render, screen } from "@testing-library/react";
import { PromptFrame } from "./PromptFrame";

const productAppShellMock = jest.fn(
  ({ children }: { children: React.ReactNode }) => (
    <div data-testid="product-app-shell">{children}</div>
  ),
);

jest.mock("../shell/AppShell", () => ({
  ProductAppShell: (props: { children: React.ReactNode }) =>
    productAppShellMock(props),
}));

describe("PromptFrame", () => {
  it("wires the white greenfield workspace content shell", () => {
    render(
      <PromptFrame
        projectId="project-test"
        breadcrumbs={[]}
        promptPath={["support", "triage-agent"]}
        activeStage="iterate"
      >
        <div>Prompt content</div>
      </PromptFrame>,
    );

    expect(screen.getByTestId("product-app-shell")).toBeTruthy();
    expect(productAppShellMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        className: "greenfield-pretext greenfield-workspace-shell",
        headerClassName: "bg-[hsl(var(--sidebar-background))]",
        mainClassName: "greenfield-workspace-content",
        projectId: "project-test",
      }),
    );
    expect(screen.queryByText("Iteration signals")).toBeNull();
  });

  it("renders non-iterate signal banners", () => {
    render(
      <PromptFrame
        projectId="project-test"
        breadcrumbs={[]}
        promptPath={["support", "triage-agent"]}
        activeStage="deploy"
      >
        <div>Prompt content</div>
      </PromptFrame>,
    );

    expect(screen.getByText("Release signals")).toBeTruthy();
  });
});
