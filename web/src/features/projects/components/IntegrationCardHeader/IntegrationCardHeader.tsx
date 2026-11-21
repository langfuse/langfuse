import {
  StatusBadge,
  type Status,
} from "@/src/components/ui/StatusBadge/StatusBadge";

export const IntegrationCardHeader = (props: {
  status: Status | undefined;
  isLoading: boolean;
  hasAccess: boolean;
  children: React.ReactNode;
}) => (
  <div className="mb-4 flex items-center justify-between gap-2">
    <div className="flex items-center gap-2">{props.children}</div>
    {props.hasAccess && !props.isLoading && (
      <StatusBadge type={props.status ?? "not_configured"} />
    )}
  </div>
);
