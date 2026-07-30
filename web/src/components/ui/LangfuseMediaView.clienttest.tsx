import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LangfuseMediaView } from "./LangfuseMediaView";

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-id",
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    media: {
      getById: {
        useQuery: () => ({ data: undefined }),
      },
    },
  },
}));

vi.mock("./media/useResolvedMedia", () => ({
  useResolvedMedia: () => ({ status: "idle", url: undefined }),
}));

describe("LangfuseMediaView", () => {
  it("renders a field-limit reference as an attachment", () => {
    render(
      <LangfuseMediaView mediaReferenceString="@@@langfuseMedia:type=text/plain|id=oversized-field|source=field_size_limit@@@" />,
    );

    expect(
      screen.getByRole("button", { name: "Full value attached media" }),
    ).toBeInTheDocument();
  });
});
