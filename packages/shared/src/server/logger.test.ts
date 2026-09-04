import { describe, expect, it } from "vitest";
import { redactCommandCredentials } from "./logger";

/**
 * ioredis attaches the command to reply errors, and for AUTH the arguments are the
 * credential. Without redaction, every queue-layer handler that passes a raw
 * connection error to winston would serialise it.
 */
describe("redactCommandCredentials", () => {
  const transform = (info: Record<string, unknown>) =>
    redactCommandCredentials().transform(info as never) as Record<
      string,
      unknown
    >;

  it("strips the arguments of an AUTH command", () => {
    const out = transform({
      level: "error",
      message: "queue error",
      command: { name: "auth", args: ["object-id", "a-real-bearer-token"] },
    });

    expect(JSON.stringify(out)).not.toContain("a-real-bearer-token");
    expect(out.command).toEqual({ name: "auth", args: "[REDACTED]" });
  });

  it("strips HELLO, which also carries credentials", () => {
    const out = transform({
      command: { name: "HELLO", args: ["3", "AUTH", "user", "secret"] },
    });

    expect(JSON.stringify(out)).not.toContain("secret");
    expect(out.command).toEqual({ name: "HELLO", args: "[REDACTED]" });
  });

  it("leaves other commands intact so errors stay debuggable", () => {
    const out = transform({
      command: { name: "get", args: ["some:key"] },
    });

    expect(out.command).toEqual({ name: "get", args: ["some:key"] });
  });

  it("passes through records with no command", () => {
    const out = transform({ level: "info", message: "hello" });
    expect(out).toEqual({ level: "info", message: "hello" });
  });
});
