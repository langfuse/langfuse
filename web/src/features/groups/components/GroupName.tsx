/** Group name. SCIM groups carry no lock: the Source column already says where they come from. */
export function GroupName({
  group,
}: {
  group: { displayName: string; source: string };
}) {
  return (
    <span className="truncate" title={group.displayName}>
      {group.displayName}
    </span>
  );
}
