"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-canvas group-[.toaster]:text-secondary group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-tertiary",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-on-fill",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-tertiary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
