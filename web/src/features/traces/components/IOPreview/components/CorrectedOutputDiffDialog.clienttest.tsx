/**
 * The output-correction diff dialog has three states, and gated (too-large)
 * output must not be conflated with genuinely-absent output (LFE-10847 review):
 * - `actualOutputTooLarge` → the original exists but was gated out of the view,
 *   so we say it is too large to diff (NOT "no original output").
 * - original output null/undefined and not gated → "No original output".
 * - original output present → render the diff.
 *
 * The Dialog primitives (Radix portal + layer container) and DiffViewer are
 * stubbed to inline renders so these tests pin the branch logic, not the
 * overlay plumbing.
 */
import { render, screen } from "@testing-library/react";

vi.mock("@/src/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

vi.mock("@/src/components/DiffViewer", () => ({
  default: (props: { oldString: string; newString: string }) => (
    <div
      data-testid="diff-viewer"
      data-old={props.oldString}
      data-new={props.newString}
    />
  ),
}));

import { CorrectedOutputDiffDialog } from "./CorrectedOutputDiffDialog";

const noop = () => {};

describe("CorrectedOutputDiffDialog original-output state", () => {
  it("reports too-large output as such, not as missing", () => {
    render(
      <CorrectedOutputDiffDialog
        isOpen
        setIsOpen={noop}
        actualOutput={undefined}
        actualOutputTooLarge
        correctedOutput='{"answer":"fixed"}'
        strictJsonMode={false}
      />,
    );

    expect(screen.getByText(/too large to diff/i)).toBeInTheDocument();
    expect(screen.queryByText(/^No original output$/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("diff-viewer")).not.toBeInTheDocument();
  });

  it("reports genuinely-absent output as 'No original output'", () => {
    render(
      <CorrectedOutputDiffDialog
        isOpen
        setIsOpen={noop}
        actualOutput={undefined}
        correctedOutput='{"answer":"fixed"}'
        strictJsonMode={false}
      />,
    );

    expect(screen.getByText(/^No original output$/i)).toBeInTheDocument();
    expect(screen.queryByText(/too large to diff/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("diff-viewer")).not.toBeInTheDocument();
  });

  it("renders the diff when an original output is present", () => {
    render(
      <CorrectedOutputDiffDialog
        isOpen
        setIsOpen={noop}
        actualOutput="original"
        correctedOutput="corrected"
        strictJsonMode={false}
      />,
    );

    expect(screen.getByTestId("diff-viewer")).toBeInTheDocument();
    expect(screen.queryByText(/No original output/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/too large to diff/i)).not.toBeInTheDocument();
  });
});
