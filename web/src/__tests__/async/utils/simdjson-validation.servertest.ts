import simdjson from "simdjson";

describe("simdjson.isValid() validation tests", () => {
  describe("Valid JSON objects", () => {
    it("should validate simple object", () => {
      expect(simdjson.isValid('{"key": "value"}')).toBe(true);
    });

    it("should validate nested object", () => {
      expect(simdjson.isValid('{"nested": {"object": true}}')).toBe(true);
    });

    it("should validate complex nested object", () => {
      expect(
        simdjson.isValid('{"this":{"is":{"a":["complex","object"]}}}'),
      ).toBe(true);
    });
  });

  describe("Valid JSON arrays", () => {
    it("should validate string array", () => {
      expect(simdjson.isValid('["array", "of", "strings"]')).toBe(true);
    });

    it("should validate number array", () => {
      expect(simdjson.isValid("[1, 2, 3, 4, 5]")).toBe(true);
    });

    it("should validate mixed array", () => {
      expect(simdjson.isValid('[{"mixed": true}, "array"]')).toBe(true);
    });
  });

  describe("Valid JSON primitives", () => {
    it("should validate JSON string", () => {
      expect(simdjson.isValid('"string"')).toBe(true);
    });

    it("should validate number", () => {
      expect(simdjson.isValid("42")).toBe(true);
    });

    it("should validate float", () => {
      expect(simdjson.isValid("3.14159")).toBe(true);
    });

    it("should validate boolean true", () => {
      expect(simdjson.isValid("true")).toBe(true);
    });

    it("should validate boolean false", () => {
      expect(simdjson.isValid("false")).toBe(true);
    });

    it("should validate null", () => {
      expect(simdjson.isValid("null")).toBe(true);
    });
  });

  describe("Valid JSON edge cases", () => {
    it("should validate empty string", () => {
      expect(simdjson.isValid('""')).toBe(true);
    });

    it("should validate empty object", () => {
      expect(simdjson.isValid("{}")).toBe(true);
    });

    it("should validate empty array", () => {
      expect(simdjson.isValid("[]")).toBe(true);
    });

    it("should validate zero", () => {
      expect(simdjson.isValid("0")).toBe(true);
    });

    it("should validate negative number", () => {
      expect(simdjson.isValid("-42")).toBe(true);
    });

    it("should validate scientific notation", () => {
      expect(simdjson.isValid("1e10")).toBe(true);
    });
  });

  describe("Invalid JSON - plain strings", () => {
    it("should reject unquoted string", () => {
      expect(simdjson.isValid("regular string")).toBe(false);
    });

    it("should reject unquoted string with spaces", () => {
      expect(simdjson.isValid("hello world")).toBe(false);
    });

    it("should reject plain text", () => {
      expect(simdjson.isValid("this is not json")).toBe(false);
    });
  });

  describe("Invalid JSON - malformed", () => {
    it("should reject unquoted object key", () => {
      expect(simdjson.isValid('{key: "value"}')).toBe(false);
    });

    it("should reject single quotes", () => {
      expect(simdjson.isValid("{'key': 'value'}")).toBe(false);
    });

    it("should reject unquoted key and value", () => {
      expect(simdjson.isValid("{key: value}")).toBe(false);
    });

    it("should reject incomplete object", () => {
      expect(simdjson.isValid('{"incomplete": ')).toBe(false);
    });

    it("should reject incomplete array", () => {
      expect(simdjson.isValid('["incomplete"')).toBe(false);
    });

    it("should reject undefined keyword", () => {
      expect(simdjson.isValid("undefined")).toBe(false);
    });

    it("should reject function", () => {
      expect(simdjson.isValid("function() {}")).toBe(false);
    });
  });

  describe("Edge cases - potentially tricky", () => {
    it("should reject empty string", () => {
      expect(simdjson.isValid("")).toBe(false);
    });

    it("should reject whitespace only", () => {
      expect(simdjson.isValid(" ")).toBe(false);
    });

    it("should reject various whitespace", () => {
      expect(simdjson.isValid("\n\t  \r")).toBe(false);
    });

    it("should reject trailing comma in object", () => {
      expect(simdjson.isValid('{"key": "value",}')).toBe(false);
    });

    it("should reject trailing comma in array", () => {
      expect(simdjson.isValid('["value",]')).toBe(false);
    });
  });
});
