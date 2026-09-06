import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ResizableImage } from "@/src/components/ui/resizable-image";
import { SharedUiProvider } from "@/src/utils/shared-ui-translations";
import chineseMessages from "@/src/features/i18n/messages/zh-CN/sharedUi.json";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated" }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    utilities: {
      validateImgUrl: {
        useQuery: () => ({ isLoading: false, data: { isValid: false } }),
      },
    },
  },
}));

it("localizes deferred image controls", () => {
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{ sharedUi: chineseMessages }}
    >
      <SharedUiProvider>
        <ResizableImage src="https://example.com/image.png" />
      </SharedUiProvider>
    </NextIntlClientProvider>,
  );

  expect(screen.getByRole("button", { name: "加载图片" })).toHaveAttribute(
    "title",
    "显示图片",
  );
});
