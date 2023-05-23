import { type PropsWithChildren } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function JSONview(props: { json: string | any }) {
  const text =
    typeof props.json === "string"
      ? props.json
      : JSON.stringify(props.json, null, 2);

  return <CodeView>{text}</CodeView>;
}

export function CodeView(props: PropsWithChildren) {
  return (
    <pre className="rounded-md border px-4 py-3 font-mono text-sm">
      {props.children}
    </pre>
  );
}
