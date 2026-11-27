import { takeAddresses } from "@/src/components/EmailTagInput/fns/takeAddresses";

describe("takeAddresses while typing", () => {
  const typing = (text: string) => takeAddresses(text, "typing");

  it.each(["foo, test@", "test@ company.com", "David Kim"])(
    "keeps %j as typed",
    (text) => {
      expect(typing(text)).toEqual({ addresses: [], rest: text });
    },
  );

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

  it("keeps the word still being typed after ended addresses", () => {
    expect(typing("ada@company.com bob@company.com, carl@comp")).toEqual({
      addresses: ["ada@company.com", "bob@company.com"],
      rest: "carl@comp",
    });
  });
});

describe("takeAddresses on a paste from another app", () => {
  const pasted = (text: string) => takeAddresses(text, "pasted");

  it("takes each address out of an email client's To: line", () => {
    expect(
      pasted(
        'Ana Lima <ana@acme.example>; "Ross, Bob" <bob@acme.example> Carl <carl@acme.example>',
      ),
    ).toEqual({
      addresses: ["ana@acme.example", "bob@acme.example", "carl@acme.example"],
      rest: "",
    });
  });

  it("ends each line and cell of a pasted column or row, a typo included", () => {
    expect(
      pasted(
        "ana@acme.example\nbob@acme\r\ncarl@acme.example\tdan@acme.example",
      ),
    ).toEqual({
      addresses: [
        "ana@acme.example",
        "bob@acme",
        "carl@acme.example",
        "dan@acme.example",
      ],
      rest: "",
    });
  });

  it("takes quoted cells from a CSV row, a typo included", () => {
    expect(pasted('"ada@example.com","grace@example"')).toEqual({
      addresses: ["ada@example.com", "grace@example"],
      rest: "",
    });
  });

  it("drops the names of a name column next to the addresses", () => {
    expect(
      pasted("Ana Lima\tana@acme.example\nBob Ross, bob@acme.example"),
    ).toEqual({
      addresses: ["ana@acme.example", "bob@acme.example"],
      rest: "",
    });
  });

  it("leaves a paste without an address as typed", () => {
    expect(pasted("ada love")).toEqual({ addresses: [], rest: "ada love" });
  });
});

describe("takeAddresses on Enter or blur", () => {
  const ending = (text: string) => takeAddresses(text, "ended");

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

  it("repairs a split address next to a whole one", () => {
    expect(ending("ada @company.com bob@company.com")).toEqual({
      addresses: ["ada@company.com", "bob@company.com"],
      rest: "",
    });
    expect(takeAddresses("bob@company.com ada@ company.com", "pasted")).toEqual(
      { addresses: ["bob@company.com", "ada@company.com"], rest: "" },
    );
  });

  it("keeps an address before a `Name <address>`", () => {
    expect(ending("alice@example.com Bob <bob@example.com>")).toEqual({
      addresses: ["alice@example.com", "bob@example.com"],
      rest: "",
    });
  });

  it("turns a malformed address into a chip, so it shows as invalid", () => {
    expect(ending("ada@")).toEqual({ addresses: ["ada@"], rest: "" });
  });
});
