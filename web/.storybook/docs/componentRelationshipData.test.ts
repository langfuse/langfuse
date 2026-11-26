import { describe, expect, it } from "vitest";

import {
  buildComponentRelationshipGraph,
  componentIdForDesignSystemStory,
  focusComponentRelationshipGraph,
} from "./componentRelationshipData";

describe("componentIdForDesignSystemStory", () => {
  it("maps nested design-system story paths to graph node IDs", () => {
    expect(
      componentIdForDesignSystemStory(
        "./src/components/design-system/table/components/UserTableCell/UserTableCell.stories.tsx",
      ),
    ).toBe("Table / UserTableCell");
  });

  it("ignores stories outside the design system", () => {
    expect(
      componentIdForDesignSystemStory("./src/features/Button.stories.tsx"),
    ).toBeNull();
  });
});

describe("buildComponentRelationshipGraph", () => {
  it("matches Windows source paths to their story node IDs", () => {
    const graph = buildComponentRelationshipGraph({
      "src\\components\\design-system\\Button\\Button.tsx": "",
    });

    expect(graph.nodes.map(({ id }) => id)).toEqual([
      componentIdForDesignSystemStory(
        "src\\components\\design-system\\Button\\Button.stories.tsx",
      ),
    ]);
  });

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
          paths: ["Button/Button.tsx"],
        },
        {
          id: "Dialog",
          label: "Dialog",
          kind: "component",
          group: null,
          paths: ["Dialog/Dialog.tsx"],
        },
        {
          id: "Form",
          label: "Form",
          kind: "component",
          group: null,
          paths: ["Form/Form.tsx"],
        },
      ],
      edges: [
        { id: "Dialog->Button", source: "Dialog", target: "Button" },
        { id: "Form->Dialog", source: "Form", target: "Dialog" },
      ],
    });
  });

  it("keeps every source path represented by a component node", () => {
    const graph = buildComponentRelationshipGraph({
      "../../src/components/design-system/Button/Button.tsx": "export {};",
      "../../src/components/design-system/Button/components/ButtonIcon.tsx":
        "export {};",
    });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.paths).toEqual([
      "Button/Button.tsx",
      "Button/components/ButtonIcon.tsx",
    ]);
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

  it("classifies constants files separately from components", () => {
    const graph = buildComponentRelationshipGraph({
      "../../src/components/design-system/charts/constants.ts":
        "export const chartHeight = 200;",
    });

    expect(graph.nodes[0]).toMatchObject({
      id: "Charts / constants",
      kind: "constants",
    });
  });
});

describe("focusComponentRelationshipGraph", () => {
  it.each([
    [
      "dependencies",
      ["Base", "Leaf", "Selected"],
      ["Base->Leaf", "Selected->Base"],
    ],
    [
      "dependents",
      ["Page", "Selected", "Wrapper"],
      ["Page->Wrapper", "Wrapper->Selected"],
    ],
    [
      "both",
      ["Base", "Leaf", "Page", "Selected", "Wrapper"],
      ["Base->Leaf", "Page->Wrapper", "Selected->Base", "Wrapper->Selected"],
    ],
  ] as const)("follows only %s paths", (direction, nodes, edges) => {
    const graph = buildComponentRelationshipGraph({
      "../../src/components/design-system/Selected/Selected.tsx":
        'import "../Base/Base";',
      "../../src/components/design-system/Base/Base.tsx":
        'import "../Leaf/Leaf";',
      "../../src/components/design-system/Leaf/Leaf.tsx": "export {};",
      "../../src/components/design-system/Wrapper/Wrapper.tsx":
        'import "../Selected/Selected"; import "../Base/Base";',
      "../../src/components/design-system/Page/Page.tsx":
        'import "../Wrapper/Wrapper"; import "../Unrelated/Unrelated";',
      "../../src/components/design-system/Unrelated/Unrelated.tsx":
        "export {};",
    });

    const focused = focusComponentRelationshipGraph(
      graph,
      "Selected",
      direction,
    );
    expect(focused.nodes.map(({ id }) => id)).toEqual(nodes);
    expect(focused.edges.map(({ id }) => id)).toEqual(edges);
  });
});
