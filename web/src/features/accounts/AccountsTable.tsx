import { RouterOutput } from "@/src/utils/types";

export function AccountsTable({
  users,
}: {
  users: RouterOutput["accounts"]["getUsers"];
}) {
  return (
    <div className="grid gap-4">{users.map((user) => user.identifier)}</div>
  );
}
