import { signupSchema } from "@/src/features/auth/lib/signupSchema";

describe("signupSchema name validation", () => {
  const validBaseInput = {
    email: "test@example.com",
    password: "P@ssw0rd!",
  };

  it("accepts names with accented letters", () => {
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "André",
    });

    expect(result.success).toBe(true);
  });

  it("accepts names with hyphens", () => {
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "Smith-Jones",
    });

    expect(result.success).toBe(true);
  });

  it("accepts names with apostrophes", () => {
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "O'Brien",
    });

    expect(result.success).toBe(true);
  });

  it("accepts names with periods", () => {
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "Dr. Smith",
    });

    expect(result.success).toBe(true);
  });

  it("rejects names longer than 100 characters", () => {
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "a".repeat(101),
    });

    expect(result.success).toBe(false);
  });

  it("accepts names with smart/curly apostrophes (U+2019)", () => {
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "O\u2019Brien",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("O'Brien");
    }
  });

  it("accepts names with left single quotation mark (U+2018)", () => {
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "O\u2018Brien",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("O'Brien");
    }
  });

  it("rejects punctuation-only names", () => {
    for (const name of ["---", "...", "'''"]) {
      const result = signupSchema.safeParse({
        ...validBaseInput,
        name,
      });

      expect(result.success).toBe(false);
    }
  });

  it("rejects whitespace-only names", () => {
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("rejects names with disallowed punctuation", () => {
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "André!",
    });

    expect(result.success).toBe(false);
  });

  it("rejects names with a leading combining mark", () => {
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "\u0301André",
    });

    expect(result.success).toBe(false);
  });

  it("rejects names consisting only of combining marks", () => {
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "\u0301\u0302\u0303",
    });

    expect(result.success).toBe(false);
  });

  it("accepts NFD-decomposed names after NFC normalization", () => {
    // "é" decomposed as e + combining acute accent
    const result = signupSchema.safeParse({
      ...validBaseInput,
      name: "Andre\u0301",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // NFC normalization should merge the combining mark
      expect(result.data.name).toBe("André");
    }
  });
});
