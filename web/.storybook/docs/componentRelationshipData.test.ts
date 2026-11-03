import { describe, expect, it } from "vitest";

import { buildComponentRelationshipGraph } from "./componentRelationshipData";

describe("buildComponentRelationshipGraph", () => {
  it("builds component-level edges from alias and relative imports", () => {
    const graph = buildComponentRelationshipGraph({
      "../../src/components/design-system/Button/Button.tsx": "export {}",
      "../../src/components/design-system/Dialog/Dialog.tsx":
        'import { Button } from "@/src/components/design-system/Button/Button";',
      "../../src/components/design-system/Form/Form.tsx":
        'export { Dialog } from "../Dialog/Dialog";',
      "../../src/components/design-system/Form/Form.stories.tsx":
        'import { Checkbox } from "../Checkbox/Checkbox";',
    });

    expect(graph).toEqual({
      nodes: [
        {
          id: "Button",
          label: "Button",
          kind: "component",
          group: null,
        },
        {
          id: "Dialog",
          label: "Dialog",
          kind: "component",
          group: null,
        },
        { id: "Form", label: "Form", kind: "component", group: null },
      ],
      edges: [
        { id: "Dialog->Button", source: "Dialog", target: "Button" },
        { id: "Form->Dialog", source: "Form", target: "Dialog" },
      ],
    });
  });

  it("keeps nested design-system areas readable", () => {
    const graph = buildComponentRelationshipGraph({
      "../../src/components/design-system/table/columns/createTextTableColumn.tsx":
        'import { EmptyValue } from "../components/EmptyValue/EmptyValue";',
      "../../src/components/design-system/table/components/EmptyValue/EmptyValue.tsx":
        "export {};",
      "../../src/components/design-system/internal/InputControl/InputControl.tsx":
        "export {};",
    });

    expect(graph.nodes.map(({ id }) => id)).toEqual([
      "Internal / InputControl",
      "Table / createTextTableColumn",
      "Table / EmptyValue",
    ]);
    expect(graph.nodes.map(({ kind }) => kind)).toEqual([
      "internal",
      "function",
      "component",
    ]);
    expect(graph.edges).toEqual([
      {
        id: "Table / createTextTableColumn->Table / EmptyValue",
        source: "Table / createTextTableColumn",
        target: "Table / EmptyValue",
      },
    ]);
  });

  it("excludes imports that leave the design-system directory", () => {
    const graph = buildComponentRelationshipGraph({
      "../../src/components/design-system/Button/Button.tsx":
        'import { Dialog } from "../../Dialog/Dialog";',
      "../../src/components/design-system/Dialog/Dialog.tsx": "export {};",
    });

    expect(graph.edges).toEqual([]);
  });

  it("groups new lowercase top-level directories automatically", () => {
    const graph = buildComponentRelationshipGraph({
      "../../src/components/design-system/utilities/formatLabel.ts":
        "export {};",
    });

    expect(graph.nodes[0]).toMatchObject({
      id: "Utilities / formatLabel",
      group: "Utilities",
    });
  });
});
