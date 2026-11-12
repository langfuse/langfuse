import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { ApiKeyDetailContent } from "@/src/features/public-api/components/ApiKeyDetailContent";

const SECRET_KEY = "sk-lf-4d164bc4-3275-43dd-8b18-150e006da4e7";
const PUBLIC_KEY = "pk-lf-779bffdd-3973-4881-8cb0-06fd83d40ccc";

function renderContent() {
  return render(
    <ApiKeyDetailContent
      scope="project"
      secretKey={SECRET_KEY}
      publicKey={PUBLIC_KEY}
      baseUrl="http://localhost:3000"
      showMcpSection
    />,
  );
}

describe("ApiKeyDetailContent", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  it("does not render the full secret key by default", () => {
    const { container } = renderContent();

    expect(container.textContent).not.toContain(SECRET_KEY);
    expect(container.textContent).not.toContain(
      btoa(`${PUBLIC_KEY}:${SECRET_KEY}`),
    );
    expect(screen.getByText(PUBLIC_KEY)).toBeInTheDocument();
  });

  it("reveals the secret key on explicit request", () => {
    renderContent();

    fireEvent.click(screen.getAllByRole("button", { name: "Show key" })[0]!);

    expect(screen.getByText(SECRET_KEY)).toBeInTheDocument();
  });

  it("copies the full secret key without revealing it", async () => {
    const { container } = renderContent();

    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET_KEY));
    expect(container.textContent).not.toContain(SECRET_KEY);
  });

  it("keeps the secret key masked when copying fails", async () => {
    writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
    const { container } = renderContent();

    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET_KEY));
    expect(container.textContent).not.toContain(SECRET_KEY);
  });

  it("copies the .env snippet with the full secret key", async () => {
    const { container } = renderContent();

    fireEvent.click(
      within(screen.getByRole("tabpanel")).getByRole("button", {
        name: "Copy to clipboard",
      }),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining(`LANGFUSE_SECRET_KEY="${SECRET_KEY}"`),
      ),
    );
    expect(container.textContent).not.toContain(SECRET_KEY);
  });
});
