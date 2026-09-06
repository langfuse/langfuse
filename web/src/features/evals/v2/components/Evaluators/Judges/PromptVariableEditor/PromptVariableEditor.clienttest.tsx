import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { getMessages } from "@/src/features/i18n/messages";
import { PromptVariableEditor } from "./PromptVariableEditor";

describe("PromptVariableEditor", () => {
  it("keeps the interpolated preview aligned and theme-aware", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={getMessages("en")}>
        <PromptVariableEditor
          value="Question: {{input}}"
          onChange={vi.fn()}
          previewEnabled
          preview={{
            status: "ready",
            fragments: [
              { type: "text", text: "Question: " },
              {
                type: "variable",
                name: "input",
                value: "What is Langfuse?",
              },
            ],
          }}
        />
      </NextIntlClientProvider>,
    );

    const preview = container.querySelector("pre");
    expect(preview).toHaveClass(
      "ph-no-capture",
      "bg-muted/50",
      "px-3",
      "py-2",
      "min-h-[140px]",
      "max-h-[50dvh]",
    );

    const interpolatedValue = container.querySelector('[title="{{input}}"]');
    expect(interpolatedValue).toHaveClass(
      "bg-primary-accent/10",
      "dark:bg-accent-light-blue",
      "dark:text-accent-dark-blue",
    );
    expect(interpolatedValue).not.toHaveClass(
      "bg-accent-light-blue",
      "text-accent-dark-blue",
    );
  });
});
