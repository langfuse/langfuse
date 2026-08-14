import { fireEvent, render, screen } from "@testing-library/react";
import { type MouseEventHandler, type ReactNode } from "react";
import { vi } from "vitest";

import { ModernSessionHeaderActionsController } from "@/src/components/session/ModernSessionHeaderActionsController";
import { DropdownMenuTrigger } from "@/src/components/ui/dropdown-menu";

vi.mock("@/src/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onClick,
  }: {
    children: ReactNode;
    checked: boolean;
    onClick: MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
    >
      {children}
    </button>
  ),
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copy: vi.fn() }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ sessions: { invalidate: vi.fn() } }),
    sessions: {
      publish: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

describe("ModernSessionHeaderActionsController", () => {
  it("keeps all display settings reachable from the actions menu", () => {
    const onShowCorrectionsChange = vi.fn();
    const onShowInlineToolCallsChange = vi.fn();
    const onShowSystemPromptChange = vi.fn();

    render(
      <ModernSessionHeaderActionsController
        projectId="project-id"
        sessionId="session-id"
        isPublic={false}
        showCorrections={false}
        showInlineToolCalls={false}
        showSystemPrompt={false}
        onShowCorrectionsChange={onShowCorrectionsChange}
        onShowInlineToolCallsChange={onShowInlineToolCallsChange}
        onShowSystemPromptChange={onShowSystemPromptChange}
      >
        <DropdownMenuTrigger asChild>
          <button type="button">Actions</button>
        </DropdownMenuTrigger>
      </ModernSessionHeaderActionsController>,
    );

    expect(screen.getByText("Display")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Show corrections" }),
    );
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Show tool calls" }),
    );
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Show system prompt" }),
    );

    expect(onShowCorrectionsChange).toHaveBeenCalledWith(true);
    expect(onShowInlineToolCallsChange).toHaveBeenCalledWith(true);
    expect(onShowSystemPromptChange).toHaveBeenCalledWith(true);
  });
});
