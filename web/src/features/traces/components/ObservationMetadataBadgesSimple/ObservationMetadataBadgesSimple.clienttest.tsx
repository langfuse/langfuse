import { render as testingLibraryRender, screen } from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { getMessages } from "@/src/features/i18n/messages";
import { ReleaseBadge } from "./ObservationMetadataBadgesSimple";

const render = (ui: ReactElement) =>
  testingLibraryRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale="en" messages={getMessages("en")}>
        {children}
      </NextIntlClientProvider>
    ),
  });

describe("ReleaseBadge", () => {
  it("shows an observation release", () => {
    render(<ReleaseBadge release="181" />);

    expect(screen.getByText("Release: 181")).toBeInTheDocument();
  });

  it("hides when no release is available", () => {
    const { container } = render(<ReleaseBadge release={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
