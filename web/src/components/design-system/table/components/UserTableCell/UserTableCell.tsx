/* eslint-disable boundaries/dependencies */
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { EMPTY_VALUE_PLACEHOLDER } from "@/src/components/design-system/table/constants";
import { Skeleton } from "@/src/components/ui/skeleton";

export type UserTableColumnValue = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  id?: string | null;
};

export function UserTableCell({
  user,
  variant,
  presentation,
  emptyValue,
  avatarSize = "md",
}:
  | {
      variant: "avatar" | "text";
      user: UserTableColumnValue;
      emptyValue?: string;
      avatarSize?: "sm" | "md";
      presentation?: never;
    }
  | {
      variant: "loading";
      presentation: "avatar" | "text";
      user?: never;
      emptyValue?: never;
      avatarSize?: never;
    }) {
  if (variant === "loading") {
    if (presentation === "text") return <Skeleton className="h-4 w-1/2" />;

    return (
      <div className="flex w-full min-w-0 items-center space-x-2">
        <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
        <Skeleton className="h-4 max-w-24 min-w-12 flex-1" />
      </div>
    );
  }

  const { name, email, image, id } = user;
  const label = name ?? email ?? id ?? emptyValue ?? EMPTY_VALUE_PLACEHOLDER;
  if (variant === "text") {
    return (
      <span className="block truncate" title={label}>
        {label}
      </span>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <Avatar size={avatarSize} src={image ?? undefined} displayName={label} />
      <span>{label}</span>
    </div>
  );
}
