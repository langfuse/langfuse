import { useEffect, useState } from "react";
import { Input } from "@/src/components/design-system/Input/Input";
import { useDebounce } from "@/src/hooks/useDebounce";

export function AgentSearchInput({
  value,
  onSearch,
}: {
  value: string;
  onSearch: (value: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(
    null,
  );
  const visibleValue = draft?.base === value ? draft.text : value;
  const apply = async (text: string, base: string) => {
    if (base !== value) return;
    await onSearch(text);
    setDraft((current) => (current?.text === text ? null : current));
  };
  const debounced = useDebounce(apply, 450, false);
  // The browser timer must not navigate after its search field unmounts.
  useEffect(() => () => debounced.cancel(), [debounced]);
  return (
    <Input
      maxLength={200}
      aria-label="Search agents"
      placeholder="Search by agent name or ID"
      value={visibleValue}
      onChange={(event) => {
        const text = event.target.value;
        setDraft({ base: value, text });
        debounced(text, value);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        debounced.cancel();
        apply(visibleValue, value);
      }}
    />
  );
}
