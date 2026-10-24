/**
 * Safari (and SES lockdown) expose `Error.prototype.stack` as a getter-only
 * inherited accessor. `vfile-message` used to assign
 * `VFileMessage.prototype.stack = ""` at module evaluation; that throw
 * aborted the react-markdown chunk on traces. The patched package defines
 * an own writable `stack` instead.
 */
describe("vfile-message under a getter-only Error.stack", () => {
  const previousStack = Object.getOwnPropertyDescriptor(
    Error.prototype,
    "stack",
  );

  afterEach(() => {
    if (previousStack) {
      Object.defineProperty(Error.prototype, "stack", previousStack);
      return;
    }
    delete (Error.prototype as { stack?: unknown }).stack;
  });

  it("loads react-markdown when Error.stack has no setter", async () => {
    Object.defineProperty(Error.prototype, "stack", {
      configurable: true,
      enumerable: false,
      get() {
        return "inherited-stack";
      },
    });

    vi.resetModules();

    // react-markdown is the traces-page importer; it evaluates vfile-message
    // at module load. vfile-message is transitive, so Vite cannot resolve
    // it as a bare specifier from this file.
    const { default: ReactMarkdown } = await import("react-markdown");

    expect(typeof ReactMarkdown).toBe("function");
  });
});
