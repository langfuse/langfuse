import { fn } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineGutterRow } from "./TimelineGutterRow";
import { flattenTreeWithTimelineMetrics } from "./timeline-flattening";
import { makeItem, makeTreeNode } from "./timeline.fixtures";

const ROW_BOX =
  "bg-background relative h-[26px] w-[320px] overflow-hidden rounded border";
const PANEL_BOX = "bg-background w-[320px] overflow-hidden rounded border";

// fn() gives Storybook actions; cast to the prop type so meta args and the
// per-story decorators agree (story-level decorators are typed against the
// component props, not the Mock-widened meta args).
const meta = preview.meta({
  component: TimelineGutterRow,
  args: {
    item: makeItem({
      depth: 1,
      treeLines: [false],
      isLastSibling: true,
      node: makeTreeNode({ name: "compose-context-window", type: "SPAN" }),
    }),
    isSelected: false,
    onSelect: fn() as () => void,
    onHover: fn() as () => void,
    onToggleCollapse: fn() as () => void,
    hasChildren: false,
    isCollapsed: false,
  },
});

export const Default = meta.story({
  decorators: [
    (Story) => (
      <div className={ROW_BOX}>
        <Story />
      </div>
    ),
  ],
});

export const RootWithChildren = meta.story({
  args: {
    item: makeItem({
      depth: 0,
      treeLines: [],
      isLastSibling: true,
      node: makeTreeNode({ name: "orchestrator-agent", type: "AGENT" }),
    }),
    hasChildren: true,
  },
  decorators: [
    (Story) => (
      <div className={ROW_BOX}>
        <Story />
      </div>
    ),
  ],
});

export const NestedWithSiblingBelow = meta.story({
  args: {
    item: makeItem({
      depth: 2,
      treeLines: [true, true],
      isLastSibling: false,
      node: makeTreeNode({ name: "rerank-candidate-passages", type: "SPAN" }),
    }),
    hasChildren: true,
  },
  decorators: [
    (Story) => (
      <div className={ROW_BOX}>
        <Story />
      </div>
    ),
  ],
});

export const NestedLastChild = meta.story({
  args: {
    item: makeItem({
      depth: 2,
      treeLines: [true, false],
      isLastSibling: true,
      node: makeTreeNode({ name: "vector-search-shard-3", type: "SPAN" }),
    }),
  },
  decorators: [
    (Story) => (
      <div className={ROW_BOX}>
        <Story />
      </div>
    ),
  ],
});

export const Selected = meta.story({
  args: { isSelected: true },
  decorators: [
    (Story) => (
      <div className={ROW_BOX}>
        <Story />
      </div>
    ),
  ],
});

export const Collapsed = meta.story({
  args: {
    item: makeItem({
      depth: 1,
      treeLines: [false],
      isLastSibling: true,
      node: makeTreeNode({ name: "retrieve-relevant-documents", type: "SPAN" }),
    }),
    hasChildren: true,
    isCollapsed: true,
  },
  decorators: [
    (Story) => (
      <div className={ROW_BOX}>
        <Story />
      </div>
    ),
  ],
});

// Design showcase: a stacked mini-tree from the real flattening logic, so the
// connectors connect parent→child across rows exactly as in the app.
export const TreeShowcase = meta.story({
  decorators: [
    (Story) => (
      <div className={PANEL_BOX}>
        <Story />
      </div>
    ),
  ],
  render: (args) => {
    const t = (ms: number) =>
      new Date(Date.parse("2024-01-01T00:00:00.000Z") + ms);
    const tree = makeTreeNode({
      id: "orch",
      name: "orchestrator-agent",
      type: "AGENT",
      startTime: t(0),
      endTime: t(8000),
      latency: 8,
      children: [
        makeTreeNode({
          id: "retr",
          name: "retrieve-relevant-documents",
          type: "SPAN",
          startTime: t(200),
          endTime: t(6000),
          children: [
            makeTreeNode({
              id: "rerank",
              name: "rerank-candidate-passages",
              type: "SPAN",
              startTime: t(500),
              endTime: t(5500),
              children: [
                makeTreeNode({
                  id: "compose",
                  name: "compose-context-window",
                  type: "SPAN",
                  startTime: t(1000),
                  endTime: t(5000),
                  children: [
                    makeTreeNode({
                      id: "llm",
                      name: "call-large-language-model",
                      type: "GENERATION",
                      startTime: t(1200),
                      endTime: t(4800),
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        makeTreeNode({
          id: "e0",
          name: "vector-search-shard-0",
          type: "SPAN",
          startTime: t(6000),
          endTime: t(6900),
        }),
        makeTreeNode({
          id: "e1",
          name: "vector-search-shard-1",
          type: "SPAN",
          startTime: t(6900),
          endTime: t(7800),
        }),
      ],
    });

    const items = flattenTreeWithTimelineMetrics(
      [tree],
      new Set(),
      tree.startTime,
      8,
      900,
    );

    return (
      <>
        {items.map((item) => (
          <div key={item.node.id} className="h-[26px]">
            <TimelineGutterRow
              item={item}
              isSelected={false}
              onSelect={args.onSelect}
              onHover={args.onHover}
              onToggleCollapse={args.onToggleCollapse}
              hasChildren={item.node.children.length > 0}
              isCollapsed={false}
            />
          </div>
        ))}
      </>
    );
  },
});
