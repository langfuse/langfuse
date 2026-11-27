import { getSeatState } from "@/src/features/rbac/fns/getSeatState";

describe("getSeatState", () => {
  it("is none without a member limit", () => {
    expect(getSeatState(undefined, 0)).toBe("none");
    expect(getSeatState(undefined, 3)).toBe("none");
  });

  it.each([
    { used: 2, max: 2, state: "full" },
    { used: 1, max: 2, state: "last" },
    { used: 1, max: 4, state: "open" },
  ])("is $state with no addresses, $used of $max seats used", (seats) => {
    expect(getSeatState(seats, 0)).toBe(seats.state);
  });

  it.each([
    { chipCount: 1, state: "open" },
    { chipCount: 3, state: "last" },
    { chipCount: 4, state: "over" },
  ])("is $state with $chipCount addresses and 3 seats open", (seats) => {
    expect(getSeatState({ used: 1, max: 4 }, seats.chipCount)).toBe(
      seats.state,
    );
  });

  it("is full with addresses once no seat is open", () => {
    expect(getSeatState({ used: 2, max: 2 }, 1)).toBe("full");
    expect(getSeatState({ used: 3, max: 2 }, 0)).toBe("full");
  });
});
