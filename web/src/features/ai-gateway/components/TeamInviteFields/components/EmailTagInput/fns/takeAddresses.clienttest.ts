import { takeAddresses } from "@/src/features/ai-gateway/components/TeamInviteFields/components/EmailTagInput/fns/takeAddresses";

describe("takeAddresses while typing", () => {
  const typing = (text: string) => takeAddresses(text, { isTyping: true });

  it.each([
    "foo, test@",
    ", test@",
    "  test@",
    "test@ company.com",
    "test @company.com",
    "David Kim",
  ])("keeps %j as typed", (text) => {
    expect(typing(text)).toEqual({ addresses: [], rest: text });
  });

  it("ends a valid address with a space or a comma", () => {
    expect(typing("ada@company.com ")).toEqual({
      addresses: ["ada@company.com"],
      rest: "",
    });
    expect(typing("foo, test@company.com,")).toEqual({
      addresses: ["test@company.com"],
      rest: "foo ",
    });
  });

  it("joins an address split by stray spaces once a comma ends it", () => {
    expect(typing("test@ company.com,")).toEqual({
      addresses: ["test@company.com"],
      rest: "",
    });
  });

  it("keeps the word still being typed after a pasted list", () => {
    expect(typing("ada@company.com bob@company.com, carl@comp")).toEqual({
      addresses: ["ada@company.com", "bob@company.com"],
      rest: "carl@comp",
    });
  });
});

describe("takeAddresses on Enter or blur", () => {
  const ending = (text: string) => takeAddresses(text, { isTyping: false });

  it("drops stray spaces inside a single address", () => {
    expect(ending(" test @ company.com ")).toEqual({
      addresses: ["test@company.com"],
      rest: "",
    });
  });

  it("repairs only the address next to a search word, not the search word", () => {
    expect(ending("John john@ company.com")).toEqual({
      addresses: ["john@company.com"],
      rest: "John",
    });
  });

  it("keeps words without an @ next to a valid address", () => {
    expect(ending("foo test@company.com")).toEqual({
      addresses: ["test@company.com"],
      rest: "foo",
    });
  });

  it("turns a malformed address into a chip, so it shows as invalid", () => {
    expect(ending("ada@")).toEqual({ addresses: ["ada@"], rest: "" });
  });

  it("leaves a search untouched", () => {
    expect(ending("ada love")).toEqual({ addresses: [], rest: "ada love" });
  });
});
