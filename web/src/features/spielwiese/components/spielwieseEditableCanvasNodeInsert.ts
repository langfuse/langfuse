import type {
  SpielwieseAgentNodeLayout,
  SpielwieseDashboardVM,
} from "../types/dashboard";

const emptyCanvasInsertAnchorNodeId = "__canvas-root__";

function createEmptyCanvasInsertedNode(
  kind: "user" | "agent",
): SpielwieseDashboardVM["canvas"]["agentNodes"][number] {
  const layout = kind === "user" ? "user-only" : "agent-only";

  return {
    description: "",
    id: kind === "user" ? "user-node" : "agent-node",
    kind: kind === "user" ? "Input" : "Agent",
    layout,
    notes: [],
    playgroundPreview: undefined,
    playgroundThinking: undefined,
    promptSections:
      layout === "user-only"
        ? [{ id: "user", label: "User", value: "" }]
        : [{ id: "system", label: "Instructions", value: "" }],
    settings: [],
    stepLabel: "Step 1",
    title: kind === "user" ? "User input" : "",
  };
}

export function cloneAgentNode(
  node: SpielwieseDashboardVM["canvas"]["agentNodes"][number],
) {
  return {
    ...node,
    settings: node.settings.map((setting) => ({ ...setting })),
    promptSections: node.promptSections.map((section) => ({ ...section })),
    notes: node.notes.map((note) => ({ ...note })),
    playgroundThinking: node.playgroundThinking
      ? {
          ...node.playgroundThinking,
          steps: node.playgroundThinking.steps.map((step) => ({ ...step })),
        }
      : undefined,
    playgroundPreview: node.playgroundPreview
      ? { ...node.playgroundPreview }
      : undefined,
  };
}

function getPromptSectionLabel(
  node: SpielwieseDashboardVM["canvas"]["agentNodes"][number],
  sectionId: "user" | "system",
) {
  return (
    node.promptSections.find((section) => section.id === sectionId)?.label ??
    (sectionId === "user" ? "User" : "Instructions")
  );
}

function createInsertedNodeId(
  sourceNodeId: string,
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
) {
  const baseNodeId = sourceNodeId.replace(/-\d+$/, "");
  const existingIds = new Set(nodes.map((node) => node.id));
  let nextIndex = 2;

  while (existingIds.has(`${baseNodeId}-${nextIndex}`)) {
    nextIndex += 1;
  }

  return `${baseNodeId}-${nextIndex}`;
}

function renumberNodeStepLabels(
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
) {
  return nodes.map((node, index) => ({
    ...node,
    stepLabel: `Step ${index + 1}`,
  }));
}

function createInsertedNode({
  layout,
  nodes,
  sourceNode,
}: {
  layout: SpielwieseAgentNodeLayout;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
  sourceNode: SpielwieseDashboardVM["canvas"]["agentNodes"][number];
}) {
  const clonedNode = cloneAgentNode(sourceNode);

  return {
    ...clonedNode,
    description: "",
    id: createInsertedNodeId(sourceNode.id, nodes),
    layout,
    notes: [],
    playgroundPreview: undefined,
    playgroundThinking: undefined,
    promptSections:
      layout === "user-only"
        ? [
            {
              id: "user",
              label: getPromptSectionLabel(sourceNode, "user"),
              value: "",
            },
          ]
        : [
            {
              id: "system",
              label: getPromptSectionLabel(sourceNode, "system"),
              value: "",
            },
          ],
    title: layout === "agent-only" ? "" : clonedNode.title,
  };
}

export function insertAgentNodeAfter(
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  nodeId: string,
  kind: "user" | "agent",
) {
  if (
    nodes.length === 0 &&
    (nodeId === emptyCanvasInsertAnchorNodeId || nodeId.length === 0)
  ) {
    return [createEmptyCanvasInsertedNode(kind)];
  }

  const sourceNodeIndex = nodes.findIndex((node) => node.id === nodeId);

  if (sourceNodeIndex === -1) {
    return nodes;
  }

  const sourceNode = nodes[sourceNodeIndex];

  if (!sourceNode) {
    return nodes;
  }

  const insertedNode = createInsertedNode({
    layout: kind === "user" ? "user-only" : "agent-only",
    nodes,
    sourceNode,
  });

  return renumberNodeStepLabels([
    ...nodes.slice(0, sourceNodeIndex + 1),
    insertedNode,
    ...nodes.slice(sourceNodeIndex + 1),
  ]);
}

export { emptyCanvasInsertAnchorNodeId };
