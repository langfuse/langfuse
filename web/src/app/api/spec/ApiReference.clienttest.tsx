import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  swaggerUI: vi.fn((_props: { url: string }) => <div>API reference</div>),
}));

vi.mock("swagger-ui-react", () => ({
  default: mocks.swaggerUI,
}));

import { ApiReference } from "./ApiReference";

describe("ApiReference", () => {
  it("renders the deployment-local specification", () => {
    render(<ApiReference />);

    expect(screen.getByText("API reference")).toBeInTheDocument();
    const properties = mocks.swaggerUI.mock.calls[0]?.[0];
    expect(properties).toMatchObject({
      url: "../generated/api/openapi.yml",
      deepLinking: true,
      docExpansion: "none",
      persistAuthorization: false,
      validatorUrl: null,
    });
    expect(
      new URL(properties.url, "https://langfuse.example.com/langfuse/api/spec")
        .pathname,
    ).toBe("/langfuse/generated/api/openapi.yml");
  });
});
