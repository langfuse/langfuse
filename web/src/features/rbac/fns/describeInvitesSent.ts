const invites = (count: number) =>
  count === 1 ? "1 invite" : `${count} invites`;
const people = (count: number) =>
  count === 1 ? "1 person" : `${count} people`;

/**
 * The success toast for a send. Invites and new members get an email with a
 * link to join; existing members who only gained a project role get none.
 */
export function describeInvitesSent({
  invited,
  added,
  addedToProject,
}: {
  invited: string[];
  added: string[];
  addedToProject: string[];
}): { title: string; description: string } {
  const emailed = invited.length + added.length;
  const projectOnly = addedToProject.length;
  if (emailed === 0)
    return {
      title: `${people(projectOnly)} added to the project`,
      description: "They're already in the organization, so no email goes out.",
    };

  const description =
    emailed === 1
      ? "The invite comes with an email and a link to join."
      : "Each invite comes with an email and a link to join.";
  if (projectOnly === 0)
    return { title: `${invites(emailed)} sent`, description };
  return {
    title: `${invites(emailed)} sent, ${people(projectOnly)} added to the project`,
    description,
  };
}
