import { describeInvitesSent } from "@/src/features/rbac/fns/describeInvitesSent";

const emails = (count: number) =>
  Array.from({ length: count }, (_, i) => `person${i}@example.com`);

describe("describeInvitesSent", () => {
  it("promises an email for invites and new members", () => {
    expect(
      describeInvitesSent({
        invited: emails(2),
        added: emails(1),
        addedToProject: [],
      }),
    ).toEqual({
      title: "3 invites sent",
      description: "Each invite comes with an email and a link to join.",
    });
  });

  it("promises no email to members who only gained a project role", () => {
    expect(
      describeInvitesSent({
        invited: [],
        added: [],
        addedToProject: emails(2),
      }),
    ).toEqual({
      title: "2 people added to the project",
      description: "They're already in the organization, so no email goes out.",
    });
  });

  it("names both when a send mixes them", () => {
    expect(
      describeInvitesSent({
        invited: emails(1),
        added: [],
        addedToProject: emails(1),
      }),
    ).toEqual({
      title: "1 invite sent, 1 person added to the project",
      description: "The invite comes with an email and a link to join.",
    });
  });
});
