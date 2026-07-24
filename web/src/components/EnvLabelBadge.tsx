import { cva, type VariantProps } from "class-variance-authority";

const envLabelBadgeVariants = cva(
  "flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-xs whitespace-nowrap",
  {
    variants: {
      variant: {
        development: "bg-light-green text-dark-green",
        staging: "bg-light-blue text-dark-blue",
        production: "bg-light-red text-dark-red",
      },
    },
  },
);

export const EnvLabelBadge = ({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: NonNullable<VariantProps<typeof envLabelBadgeVariants>["variant"]>;
  onClick: () => void;
}) => {
  return (
    <div className={envLabelBadgeVariants({ variant })} onClick={onClick}>
      {label}
    </div>
  );
};
