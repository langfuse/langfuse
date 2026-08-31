import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  apiReferenceReact: vi.fn((_props: { configuration: { url: string } }) => (
    <div>API reference</div>
  )),
}));

vi.mock("@scalar/api-reference-react", () => ({
  ApiReferenceReact: mocks.apiReferenceReact,
}));

import { ApiReference } from "./ApiReference";

describe("ApiReference", () => {
  it("renders the local spec with hosted integrations disabled", () => {
    render(<ApiReference />);

    expect(screen.getByText("API reference")).toBeInTheDocument();
    const configuration =
      mocks.apiReferenceReact.mock.calls[0]?.[0].configuration;
    expect(configuration).toMatchObject({
      url: "../generated/api/openapi.yml",
      agent: { disabled: true },
      mcp: { disabled: true },
      hideClientButton: true,
      withDefaultFonts: false,
    });
    expect(configuration).not.toHaveProperty("hideTestRequestButton");
    expect(
      new URL(
        configuration.url,
        "https://langfuse.example.com/langfuse/api/spec",
      ).pathname,
    ).toBe("/langfuse/generated/api/openapi.yml");
  });
});
