import {
  emailSchema,
  normalizeEmail,
} from "@/src/features/auth/lib/emailSchema";

describe("emailSchema", () => {
  it("trims leading, trailing and tab whitespace before validating (#15780)", () => {
    for (const input of [
      "user@example.com ",
      " user@example.com",
      "\tuser@example.com\t",
      "  user@example.com  ",
    ]) {
      const result = emailSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("user@example.com");
      }
    }
  });

  it("accepts a clean email unchanged", () => {
    const result = emailSchema.safeParse("user@example.com");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("user@example.com");
  });

  it("preserves case (the server lowercases on lookup)", () => {
    const result = emailSchema.safeParse("User@Example.com ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("User@Example.com");
  });

  it("still rejects a value that is not an email", () => {
    for (const input of ["not-an-email ", "   ", "user@", "@example.com"]) {
      expect(emailSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
    expect(normalizeEmail("\tuser@example.com\n")).toBe("user@example.com");
  });

  it("leaves an already-normalized email unchanged", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });
});
