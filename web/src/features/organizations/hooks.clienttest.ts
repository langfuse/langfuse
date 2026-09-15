import { organizationsForSwitcher } from "./organizationsForSwitcher";

const ownOrg = {
  id: "own-org",
  name: "Own Org",
  projects: [{ id: "own-project", name: "Own Project" }],
};

const customerOrg = {
  id: "customer-org",
  name: "Customer Org",
  projects: [{ id: "customer-project", name: "Customer Project" }],
};

describe("organizationsForSwitcher", () => {
  it("returns null while session organizations are still loading", () => {
    expect(organizationsForSwitcher(null, customerOrg as never)).toBeNull();
    expect(
      organizationsForSwitcher(undefined, customerOrg as never),
    ).toBeNull();
  });

  it("leaves the session list unchanged when the current org is already a member org", () => {
    const sessionOrgs = [ownOrg, customerOrg] as never;
    expect(organizationsForSwitcher(sessionOrgs, customerOrg as never)).toBe(
      sessionOrgs,
    );
  });

  it("prepends the current org when an admin is viewing an org they do not belong to", () => {
    expect(
      organizationsForSwitcher([ownOrg] as never, customerOrg as never),
    ).toEqual([customerOrg, ownOrg]);
  });

  it("shows only the current org when an admin has no memberships", () => {
    expect(organizationsForSwitcher([], customerOrg as never)).toEqual([
      customerOrg,
    ]);
  });
});
