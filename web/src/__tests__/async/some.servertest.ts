describe("Sample Test Suite", () => {
  it("should return true for a simple truthy test", () => {
    expect(true).toBe(true);
  });

  it("should add two numbers correctly", () => {
    const sum = (a: number, b: number) => a + b;
    expect(sum(1, 2)).toBe(3);
  });
});
