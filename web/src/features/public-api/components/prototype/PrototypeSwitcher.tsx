// PROTOTYPE — throwaway. Floating variant switcher for the create-form prototype.

import { useEffect } from "react";
import { useRouter } from "next/router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/src/components/ui/button";

export type VariantMeta = { key: string; name: string };

export const PrototypeSwitcher = ({
  variants,
  current,
}: {
  variants: VariantMeta[];
  current: string;
}) => {
  const router = useRouter();

  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const active = variants[index];

  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    router.replace(
      { query: { ...router.query, variant: next.key } },
      undefined,
      { shallow: true },
    );
  };

  useArrowKeyNavigation(go);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/90 px-2 py-1.5 text-white shadow-2xl">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => go(-1)}
        className="h-8 w-8 rounded-full text-white hover:bg-white/15 hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-48 px-3 text-center text-xs">
        <span className="font-mono font-bold">{active.key}</span>
        <span className="mx-1.5 opacity-40">—</span>
        <span className="opacity-90">{active.name}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => go(1)}
        className="h-8 w-8 rounded-full text-white hover:bg-white/15 hover:text-white"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};

const useArrowKeyNavigation = (go: (delta: number) => void) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditingTarget(e.target)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
};

const isEditingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
};
