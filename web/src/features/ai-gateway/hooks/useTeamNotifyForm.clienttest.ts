import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useTeamInviteEmails } from "@/src/features/ai-gateway/hooks/useTeamInviteEmails";
import { useTeamNotifyForm } from "@/src/features/ai-gateway/hooks/useTeamNotifyForm";
import type { TeamInviteMember } from "@/src/features/ai-gateway/types/teamInviteMembers";

const suggestedMembers = [
  { id: "user-1", name: "Ada Lovelace", email: "ada@company.com", image: null },
  {
    id: "user-2",
    name: "Grace Hopper",
    email: "grace@company.com",
    image: null,
  },
  { id: "user-3", name: null, email: "alan@company.com", image: null },
];

const notifiable = { isSelf: false, canUseGateway: true };
const organization = new Map<string, TeamInviteMember>([
  ["ada@company.com", { name: "Ada Lovelace", ...notifiable }],
  ["grace@company.com", { name: "Grace Hopper", ...notifiable }],
  ["me@company.com", { name: "Me", isSelf: true, canUseGateway: true }],
  [
    "viewer@company.com",
    { name: "Vera Viewer", isSelf: false, canUseGateway: false },
  ],
]);

/** The form over real invitee state; addresses outside `organization` are outsiders. */
function renderForm({ isEmailConfigured = true } = {}) {
  return renderHook(() => {
    const invitees = useTeamInviteEmails();
    const inviteeMembers = new Map(
      invitees.emails.map((email) => [email, organization.get(email) ?? null]),
    );
    const form = useTeamNotifyForm({
      notifiableMembers: { isEmailConfigured, count: 12 },
      suggestedMembers,
      invitees,
      inviteeMembers,
    });
    return { invitees, form };
  });
}

function suggestedEmails(form: ReturnType<typeof useTeamNotifyForm>) {
  return form.fieldsProps.memberSuggestions?.suggestedMembers.map(
    (member) => member.email,
  );
}

describe("useTeamNotifyForm", () => {
  it("offers members who are not picked yet and match the typed text, even before the next results arrive", () => {
    const { result } = renderForm();

    act(() => result.current.invitees.addMember(suggestedMembers[0]!));
    expect(suggestedEmails(result.current.form)).toEqual([
      "grace@company.com",
      "alan@company.com",
    ]);

    act(() => result.current.invitees.setDraft("ALAN"));
    expect(suggestedEmails(result.current.form)).toEqual(["alan@company.com"]);
  });

  it("counts only the people who get an email", () => {
    const { result } = renderForm();

    act(() =>
      result.current.invitees.setEmails([
        "ada@company.com",
        "sam@contractor.dev",
        "me@company.com",
        "viewer@company.com",
      ]),
    );
    expect(result.current.form.sendLabel).toBe("Notify 2 people");

    act(() =>
      result.current.form.fieldsProps.memberSuggestions?.onAllSelectedChange(
        true,
      ),
    );
    expect(result.current.form.sendLabel).toBe("Notify 13 people");
  });

  it("counts members only when email is configured, while outsiders are still invited", () => {
    const { result } = renderForm({ isEmailConfigured: false });

    act(() =>
      result.current.invitees.setEmails([
        "ada@company.com",
        "sam@contractor.dev",
      ]),
    );
    expect(result.current.form.sendLabel).toBe("Notify 1 person");
    expect(result.current.form.fieldsProps.memberSuggestions).toBeUndefined();
  });

  it("allows sending only with valid addresses and someone to notify", () => {
    const { result } = renderForm();
    expect(result.current.form.canSend).toBe(false);

    act(() => result.current.invitees.setEmails(["me@company.com"]));
    expect(result.current.form.canSend).toBe(false);

    act(() =>
      result.current.invitees.setEmails(["sam@contractor.dev", "not-an-email"]),
    );
    expect(result.current.form.canSend).toBe(false);

    act(() => result.current.invitees.setEmails(["sam@contractor.dev"]));
    expect(result.current.form.canSend).toBe(true);
  });

  it("notifies every member once and keeps only failed addresses for a retry", async () => {
    const { result } = renderForm();
    const failed = [
      { email: "sam@contractor.dev", message: "Invitation failed" },
    ];
    const invite = vi.fn().mockResolvedValue({ failed });

    act(() => {
      result.current.form.fieldsProps.memberSuggestions?.onAllSelectedChange(
        true,
      );
      result.current.invitees.setEmails([
        "ada@company.com",
        "sam@contractor.dev",
      ]);
    });
    let isDone: boolean | undefined;
    await act(async () => {
      isDone = await result.current.form.send(invite);
    });

    expect(isDone).toBe(false);
    expect(invite).toHaveBeenLastCalledWith({
      emails: ["ada@company.com", "sam@contractor.dev"],
      notifyMembers: true,
    });
    expect(result.current.invitees.emails).toEqual(["sam@contractor.dev"]);
    expect(result.current.form.failures).toEqual(failed);
    expect(result.current.form.fieldsProps.memberSuggestions).toBeUndefined();

    invite.mockResolvedValue({ failed: [] });
    await act(async () => {
      isDone = await result.current.form.send(invite);
    });
    expect(isDone).toBe(true);
    expect(invite).toHaveBeenLastCalledWith({
      emails: ["sam@contractor.dev"],
      notifyMembers: false,
    });
  });
});
