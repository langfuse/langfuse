import {
  fireEvent,
  render as testingLibraryRender,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";

import { StringMapEditor } from "./StringMapEditor";
import settingsEnterpriseMessages from "@/src/features/i18n/messages/en/settingsEnterprise.json";

const render = (ui: Parameters<typeof testingLibraryRender>[0]) =>
  testingLibraryRender(
    <NextIntlClientProvider
      locale="en"
      messages={{ settingsEnterprise: settingsEnterpriseMessages }}
    >
      {ui}
    </NextIntlClientProvider>,
  );

function TestEditor({
  initialEntries = {},
}: {
  initialEntries?: Record<string, string>;
}) {
  const [entries, setEntries] = useState<Array<[string, string]>>(() =>
    Object.entries(initialEntries),
  );

  return (
    <StringMapEditor
      title="Model Parameters"
      description="Pricing attributes"
      entries={entries}
      onChange={setEntries}
    />
  );
}

describe("StringMapEditor", () => {
  it("edits exact string keys and values", () => {
    render(<TestEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Add Attribute" }));

    fireEvent.change(screen.getByPlaceholderText("e.g. service_tier"), {
      target: { value: "service_tier" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. priority"), {
      target: { value: "priority" },
    });

    expect(screen.getByDisplayValue("service_tier")).toBeInTheDocument();
    expect(screen.getByDisplayValue("priority")).toBeInTheDocument();
  });

  it("preserves the row while replacing its key", () => {
    render(<TestEditor initialEntries={{ service_tier: "priority" }} />);

    const keyInput = screen.getByDisplayValue("service_tier");
    fireEvent.change(keyInput, { target: { value: "" } });

    expect(screen.getByDisplayValue("priority")).toBeInTheDocument();

    fireEvent.change(keyInput, { target: { value: "service_class" } });

    expect(screen.getByDisplayValue("service_class")).toBeInTheDocument();
    expect(screen.getByDisplayValue("priority")).toBeInTheDocument();
  });
});
