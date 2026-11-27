import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { type SubmitEvent, useId, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Button } from "@/src/components/design-system/Button/Button";
import { Tag } from "@/src/components/design-system/Tag/Tag";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { EmailTagInput } from "@/src/components/EmailTagInput/EmailTagInput";
import {
  type InviteSeatLimit,
  InviteSeatLine,
} from "@/src/features/rbac/components/InviteSeatLine";
import { MAX_MEMBER_INVITES_PER_REQUEST } from "@/src/features/rbac/constants/memberInvites";
import { getSeatState } from "@/src/features/rbac/fns/getSeatState";
import { RoleSelect } from "@/src/features/rbac/components/RoleSelect";
import { MEMBER_INVITE_FAILURE_LABELS } from "@/src/features/rbac/constants/memberInviteFailureLabels";
import {
  type RouterOutputs,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";
import { isEmail } from "@/src/utils/isEmail";

const roleValues = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
  VIEWER: "VIEWER",
  AI_GATEWAY: "AI_GATEWAY",
  NONE: "NONE",
} as const satisfies Record<Role, Role>;

// The submit button holds the send until the list is ready, so the addresses need no rule here.
const formSchema = z.object({
  emails: z.array(z.string()),
  orgRole: z.enum(roleValues),
  projectRole: z.enum(roleValues).exclude([roleValues.AI_GATEWAY]),
});

type FormValues = z.infer<typeof formSchema>;

type MemberInviteResult = RouterOutputs["members"]["create"];

type InviteFailure = MemberInviteResult["failed"][number];

/** The last send: how many went out, and the failures still in the input. */
type SendOutcome = { sentCount: number; failed: InviteFailure[] };

/** A send can fix an unexpected failure, and a seat-limit one once a seat is open. */
const isRetryable = (failure: InviteFailure, hasOpenSeat: boolean) =>
  failure.reason === "other" ||
  (failure.reason === "seat_limit" && hasOpenSeat);

/** What holds the send under the addresses, most urgent first. */
function getListProblem({
  invalidEntries,
  leftOutCount,
}: {
  /** Entries in the list that are not email addresses, in list order. */
  invalidEntries: string[];
  leftOutCount: number;
}) {
  if (invalidEntries.length === 1) {
    return `“${invalidEntries[0]}” isn't an email address. Select it to fix it.`;
  }
  if (invalidEntries.length > 1) {
    return `${invalidEntries.length} entries aren't email addresses. Select one to fix it.`;
  }
  if (leftOutCount > 0) {
    const leftOut =
      leftOutCount === 1
        ? "the last one wasn't added. Send it next."
        : `the last ${leftOutCount} weren't added. Send them next.`;
    return `You can invite up to ${MAX_MEMBER_INVITES_PER_REQUEST} people at a time, so ${leftOut}`;
  }
  return undefined;
}

/** How the last send went, while its failures are still the list. */
function describeSendOutcome({ sentCount, failed }: SendOutcome) {
  const sent =
    sentCount === 0
      ? "No invites sent."
      : `${sentCount} ${sentCount === 1 ? "invite" : "invites"} sent.`;
  const notSent =
    failed.length === 1 ? "1 wasn't sent." : `${failed.length} weren't sent.`;
  return `${sent} ${notSent}`;
}

function getSubmitLabel({
  isPending,
  isRetry,
}: {
  isPending: boolean;
  isRetry: boolean;
}) {
  if (isPending) return "Sending";
  if (isRetry) return "Try again";
  return "Send invites";
}

type CreateProjectMemberDialogProps = {
  project: { id: string; name: string } | undefined;
  organizationName: string;
  hasOnlySingleProjectAccess: boolean;
  hasProjectRoleEntitlement: boolean;
  canManageOrgOwnership: boolean;
  canManageProjectOwnership: boolean;
  isAiGatewayEnabled: boolean;
  /**
   * The role the dialog opens with, Member unless the caller names one: the
   * organization role, or the project role when only this project can be invited to.
   */
  defaultOrgRole?: Role;
  isPending: boolean;
  /** The plan's seats once counted; undefined when it has no member limit. */
  seatLimit: InviteSeatLimit | undefined;
  /** The plan has a member limit and its seats are still being counted. */
  isCountingSeats: boolean;
  /** Resolves to each email's outcome; rejects when the whole request failed. */
  inviteMembers: (values: FormValues) => Promise<MemberInviteResult>;
  /** Called once every email of a submit was invited or added. */
  onAllInvited: (result: MemberInviteResult) => void;
  /** Called on the upgrade link's click, before billing opens in a new tab. */
  onBeforeOpenBilling: (chipCount: number) => void;
  /** Called on Done, once a send left only failures a retry can't fix. */
  onDone: () => void;
};

/**
 * Invites several emails with one role in one submit. Emails that fail stay
 * as chips with their reason, so the rest of the list is not sent twice.
 */
export function CreateProjectMemberDialog({
  project,
  organizationName,
  hasOnlySingleProjectAccess,
  hasProjectRoleEntitlement,
  canManageOrgOwnership,
  canManageProjectOwnership,
  isAiGatewayEnabled,
  defaultOrgRole = roleValues.MEMBER,
  isPending,
  seatLimit,
  isCountingSeats,
  inviteMembers,
  onAllInvited,
  onBeforeOpenBilling,
  onDone,
}: CreateProjectMemberDialogProps) {
  const formId = useId();
  const listProblemId = useId();
  const [draft, setDraft] = useState("");
  const [isProjectRoleShown, setIsProjectRoleShown] = useState(false);
  const [leftOutCount, setLeftOutCount] = useState(0);
  const [outcome, setOutcome] = useState<SendOutcome>();
  // AI Gateway is an organization role only.
  const defaultProjectRole =
    defaultOrgRole === roleValues.AI_GATEWAY
      ? roleValues.MEMBER
      : defaultOrgRole;
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      emails: [],
      orgRole: hasOnlySingleProjectAccess ? roleValues.NONE : defaultOrgRole,
      projectRole: hasOnlySingleProjectAccess
        ? defaultProjectRole
        : roleValues.NONE,
    },
  });

  // Counts follow the chips; text still in the input becomes chips when it
  // loses focus, which a click on the submit button causes first.
  const emails = form.watch("emails");
  const invalidEntries = emails.filter((email) => !isEmail(email));
  const readyCount = emails.length - invalidEntries.length;
  const failureReasons = new Map(
    outcome?.failed.map(({ email, reason }) => [email, reason]),
  );
  // The last send's result stands until its chips are edited; then the list is sent as new.
  const standingOutcome =
    outcome &&
    emails.length === outcome.failed.length &&
    emails.every((email) => failureReasons.has(email))
      ? outcome
      : undefined;
  const seatState = getSeatState(seatLimit, 0);
  // Seats free up when someone leaves or the plan is upgraded; the counts refetch on focus.
  const hasOpenSeat = !isCountingSeats && seatState !== "full";
  const retryableEmails = (standingOutcome?.failed ?? [])
    .filter((failure) => isRetryable(failure, hasOpenSeat))
    .map(({ email }) => email);
  const isDone = standingOutcome !== undefined && retryableEmails.length === 0;
  const listProblem = getListProblem({ invalidEntries, leftOutCount });
  const isPlanFull = seatState === "full";
  const canSetProjectRole =
    project !== undefined &&
    hasProjectRoleEntitlement &&
    !hasOnlySingleProjectAccess;

  // The paste comes next, so a role picked with the pointer hands the focus back.
  const focusAddresses = () => form.setFocus("emails");
  const requestError = form.formState.errors.root?.message;

  function handleEmailsChange(next: string[]) {
    setLeftOutCount(Math.max(0, next.length - MAX_MEMBER_INVITES_PER_REQUEST));
    form.setValue("emails", next.slice(0, MAX_MEMBER_INVITES_PER_REQUEST));
  }

  // Text left in the field is part of the list: it becomes an entry to fix, which holds the send.
  async function handleFormSubmit(event: SubmitEvent<HTMLFormElement>) {
    // The dialog can open from inside another form: its submit stays its own.
    event.stopPropagation();
    const leftover = draft.trim();
    if (leftover.length === 0) {
      await form.handleSubmit(onSubmit)(event);
      return;
    }
    event.preventDefault();
    handleEmailsChange([...emails, leftover]);
    setDraft("");
    focusAddresses();
  }

  async function onSubmit(values: FormValues) {
    // Send turns disabled while sending, which would drop the focus to the dialog frame.
    focusAddresses();
    const isRetry = standingOutcome !== undefined;
    const kept =
      standingOutcome?.failed.filter((f) => !isRetryable(f, hasOpenSeat)) ?? [];
    try {
      const submitResult = await inviteMembers({
        ...values,
        emails: isRetry ? retryableEmails : values.emails,
      });
      const failed = [...kept, ...submitResult.failed];
      if (failed.length === 0) {
        onAllInvited(submitResult);
        return;
      }
      setOutcome({
        sentCount:
          submitResult.invited.length +
          submitResult.added.length +
          submitResult.addedToProject.length,
        failed,
      });
      setLeftOutCount(0);
      form.setValue(
        "emails",
        failed.map(({ email }) => email),
      );
    } catch (error) {
      // A thrown error failed the whole request, so it belongs to the form, not to an address.
      form.setError("root", {
        type: "manual",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't send the invites. Try again.",
      });
      reportTrpcErrorWithoutToast(error, "members");
    }
  }

  return (
    <Dialog
      actions={[
        isDone
          ? { label: "Done", type: "button", onClick: onDone }
          : {
              label: getSubmitLabel({
                isPending,
                isRetry: standingOutcome !== undefined,
              }),
              type: "submit",
              form: formId,
              loading: isPending,
              disabled:
                !standingOutcome &&
                ((emails.length === 0 && draft.trim().length === 0) ||
                  invalidEntries.length > 0 ||
                  isCountingSeats ||
                  isPlanFull),
            },
      ]}
      hideCloseButton={isDone}
      title="Invite your team"
      description={`We'll email each person a link to join ${project?.name ?? organizationName}.`}
      // The description names the organization or project, which is customer data.
      noCapture
    >
      <Dialog.Body>
        <Form id={formId} actions={[]} onSubmit={handleFormSubmit}>
          {requestError && <Banner variant="error">{requestError}</Banner>}
          {!hasOnlySingleProjectAccess && (
            <Form.Field control={form.control} name="orgRole" label="Invite as">
              {(field) => (
                <RoleSelect
                  triggerId={field.id}
                  roles={Object.values(roleValues).filter(
                    (role) =>
                      isAiGatewayEnabled || role !== roleValues.AI_GATEWAY,
                  )}
                  value={field.value}
                  onValueChange={field.onChange}
                  canManageOwnership={canManageOrgOwnership}
                  onAfterPick={focusAddresses}
                />
              )}
            </Form.Field>
          )}
          {canSetProjectRole && !isProjectRoleShown && (
            <div>
              <Button
                type="button"
                variant="text"
                size="sm"
                icon={Plus}
                text="Set a project role"
                // The button goes once pressed, so the focus moves on to the addresses.
                onClick={() => {
                  setIsProjectRoleShown(true);
                  focusAddresses();
                }}
              />
            </div>
          )}
          {(hasOnlySingleProjectAccess ||
            (canSetProjectRole && isProjectRoleShown)) && (
            <Form.Field
              control={form.control}
              name="projectRole"
              // With access to this project only, its role is the one role to pick.
              label={hasOnlySingleProjectAccess ? "Invite as" : "Project role"}
              description={
                hasOnlySingleProjectAccess
                  ? undefined
                  : "Overrides the organization role in this project."
              }
            >
              {(field) => (
                <RoleSelect
                  triggerId={field.id}
                  isProjectRole
                  roles={Object.values(roleValues).filter(
                    (role) =>
                      role !== roleValues.AI_GATEWAY &&
                      !(hasOnlySingleProjectAccess && role === roleValues.NONE),
                  )}
                  value={field.value}
                  onValueChange={field.onChange}
                  canManageOwnership={canManageProjectOwnership}
                  onAfterPick={focusAddresses}
                />
              )}
            </Form.Field>
          )}
          <div className="flex flex-col gap-2">
            <Form.Field
              control={form.control}
              name="emails"
              label="Email addresses"
              description="Paste a list from anywhere. Commas, spaces and new lines all work."
            >
              {(field) => (
                <EmailTagInput
                  ref={field.ref}
                  id={field.id}
                  value={field.value}
                  onChange={handleEmailsChange}
                  draft={draft}
                  onDraftChange={setDraft}
                  renderTag={(email, { remove }) => {
                    const reason = failureReasons.get(email);
                    return (
                      <Tag
                        text={email}
                        secondaryText={
                          reason &&
                          `(${MEMBER_INVITE_FAILURE_LABELS[reason].toLowerCase()})`
                        }
                        status={reason === undefined ? "default" : "error"}
                        remove={remove}
                      />
                    );
                  }}
                  aria-describedby={[field.inputDescribedById, listProblemId]
                    .filter(Boolean)
                    .join(" ")}
                  autoFocus
                  // A send replaces the list with its failures, so edits made meanwhile would be lost.
                  readOnly={isPending}
                />
              )}
            </Form.Field>
            <Form.Error id={listProblemId} message={listProblem} />
            <p
              aria-live="polite"
              className="text-muted-foreground text-sm empty:sr-only"
            >
              {!listProblem &&
                standingOutcome &&
                describeSendOutcome(standingOutcome)}
            </p>
          </div>
          {seatLimit && (
            <InviteSeatLine
              seatLimit={seatLimit}
              chipCount={readyCount}
              onBeforeOpenBilling={() => onBeforeOpenBilling(readyCount)}
            />
          )}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
