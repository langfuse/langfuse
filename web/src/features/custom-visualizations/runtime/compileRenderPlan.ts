import { getByPath, type Spec, validateSpec } from "@json-render/core";
import {
  CUSTOM_UI_SPEC_LIMITS,
  CustomUiRenderInputSchema,
  type CustomUiElement,
  type CustomUiRenderInput,
  type CustomUiSpec,
  type CustomUiSpecFailureCode,
  validateCustomUiSpec,
} from "./spec";

type CustomUiRenderCost = "CHEAP" | "MODERATE" | "HEAVY";

type CustomUiPlanNode = {
  key: string;
  type: string;
  depth: number;
  stage: 0 | 1 | 2;
  cost: CustomUiRenderCost;
};

export type CustomUiRuntimeDiagnostics = {
  nodeCount: number;
  maxDepth: number;
  deferredCount: number;
  repeatRegionCount: number;
  boundedRepeatItemCount: number;
  truncatedRepeatItemCount: number;
  validateDurationMs: number;
  compileDurationMs: number;
  specByteLength: number;
};

export type CustomUiRenderPlan = {
  spec: CustomUiSpec;
  input: CustomUiRenderInput;
  nodes: CustomUiPlanNode[];
  stageCount: 1 | 2 | 3;
  diagnostics: CustomUiRuntimeDiagnostics;
};

export type CustomUiPlanFailureCode =
  | CustomUiSpecFailureCode
  | "INVALID_INPUT"
  | "INVALID_STRUCTURE"
  | "TOO_DEEP"
  | "TOO_MANY_NODES";

export type CustomUiRenderPlanResult =
  | { success: true; plan: CustomUiRenderPlan }
  | { success: false; code: CustomUiPlanFailureCode };

const HEAVY_COMPONENTS = new Set([
  "BarList",
  "CodePreview",
  "Json",
  "MessageList",
  "Timeline",
]);
const MODERATE_COMPONENTS = new Set(["Accordion", "Grid", "ToolCallSummary"]);

const now = () => globalThis.performance?.now() ?? Date.now();

const referencesFor = (element: CustomUiElement): string[] => [
  ...element.children,
  ...Object.values(element.slots ?? {}).flat(),
];

const renderCostFor = (type: string): CustomUiRenderCost => {
  if (HEAVY_COMPONENTS.has(type)) return "HEAVY";
  if (MODERATE_COMPONENTS.has(type)) return "MODERATE";
  return "CHEAP";
};

const stageFor = (depth: number, cost: CustomUiRenderCost): 0 | 1 | 2 => {
  if (depth === 0) return 0;
  if (depth >= 6 || (depth >= 3 && cost === "HEAVY")) return 2;
  if (depth >= 3 || cost !== "CHEAP") return 1;
  return 0;
};

const decodePointerSegment = (segment: string) =>
  segment.replaceAll("~1", "/").replaceAll("~0", "~");

const setAtPointer = (
  root: CustomUiRenderInput,
  pointer: string,
  value: unknown,
): CustomUiRenderInput => {
  if (pointer === "") return root;
  const segments = pointer.slice(1).split("/").map(decodePointerSegment);
  const clone: CustomUiRenderInput = { ...root };
  let outputCursor: Record<string, unknown> | unknown[] = clone;
  let inputCursor: unknown = root;

  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      if (Array.isArray(outputCursor)) {
        const arrayIndex = Number(segment);
        if (Number.isInteger(arrayIndex)) outputCursor[arrayIndex] = value;
      } else {
        outputCursor[segment] = value;
      }
      break;
    }

    const nextInput =
      inputCursor && typeof inputCursor === "object"
        ? (inputCursor as Record<string, unknown>)[segment]
        : undefined;
    let nextOutput: Record<string, unknown> | unknown[] = {};
    if (Array.isArray(nextInput)) {
      nextOutput = [...nextInput];
    } else if (nextInput && typeof nextInput === "object") {
      nextOutput = { ...(nextInput as Record<string, unknown>) };
    }

    if (Array.isArray(outputCursor)) {
      const arrayIndex = Number(segment);
      if (!Number.isInteger(arrayIndex)) return clone;
      outputCursor[arrayIndex] = nextOutput;
    } else {
      outputCursor[segment] = nextOutput;
    }
    outputCursor = nextOutput;
    inputCursor = nextInput;
  }

  return clone;
};

const clampDisclosure = (
  spec: CustomUiSpec,
  depthByKey: ReadonlyMap<string, number>,
): CustomUiSpec => ({
  ...spec,
  elements: Object.fromEntries(
    Object.entries(spec.elements).map(([key, element]) => {
      const depth = depthByKey.get(key) ?? 0;
      if (element.type === "Accordion" && depth > 2) {
        return [
          key,
          { ...element, props: { ...element.props, defaultOpen: false } },
        ];
      }
      if (element.type === "Json" && depth > 1) {
        return [
          key,
          { ...element, props: { ...element.props, collapsed: true } },
        ];
      }
      return [key, element];
    }),
  ),
});

function compileGraph(spec: CustomUiSpec):
  | {
      success: true;
      depthByKey: Map<string, number>;
      maxDepth: number;
    }
  | { success: false; code: "INVALID_STRUCTURE" | "TOO_DEEP" } {
  const depthByKey = new Map<string, number>();
  let maxDepth = 0;

  const visit = (
    key: string,
    depth: number,
    ancestors: Set<string>,
  ): boolean => {
    if (depth > CUSTOM_UI_SPEC_LIMITS.maxDepth) return false;
    const element = spec.elements[key];
    if (!element || ancestors.has(key)) return false;
    const previousDepth = depthByKey.get(key);
    if (previousDepth !== undefined && previousDepth >= depth) return true;

    depthByKey.set(key, depth);
    maxDepth = Math.max(maxDepth, depth);
    const nextAncestors = new Set(ancestors).add(key);
    return referencesFor(element).every((child) =>
      visit(child, depth + 1, nextAncestors),
    );
  };

  if (!visit(spec.root, 0, new Set())) {
    const hasExcessiveDepth = maxDepth >= CUSTOM_UI_SPEC_LIMITS.maxDepth;
    return {
      success: false,
      code: hasExcessiveDepth ? "TOO_DEEP" : "INVALID_STRUCTURE",
    };
  }
  if (depthByKey.size !== Object.keys(spec.elements).length) {
    return { success: false, code: "INVALID_STRUCTURE" };
  }
  return { success: true, depthByKey, maxDepth };
}

const boundRepeats = (
  spec: CustomUiSpec,
  input: CustomUiRenderInput,
): {
  input: CustomUiRenderInput;
  repeatRegionCount: number;
  boundedRepeatItemCount: number;
  truncatedRepeatItemCount: number;
} => {
  const paths = [
    ...new Set(
      Object.values(spec.elements)
        .map((element) => element.repeat?.statePath)
        .filter((path): path is string => path !== undefined),
    ),
  ];
  let boundedInput = input;
  let itemCount = 0;
  let truncated = 0;

  for (const path of paths) {
    const value = getByPath(input, path);
    if (!Array.isArray(value)) continue;
    itemCount += Math.min(value.length, CUSTOM_UI_SPEC_LIMITS.maxRepeatItems);
    if (value.length > CUSTOM_UI_SPEC_LIMITS.maxRepeatItems) {
      truncated += value.length - CUSTOM_UI_SPEC_LIMITS.maxRepeatItems;
      boundedInput = setAtPointer(
        boundedInput,
        path,
        value.slice(0, CUSTOM_UI_SPEC_LIMITS.maxRepeatItems),
      );
    }
  }

  return {
    input: boundedInput,
    repeatRegionCount: paths.length,
    boundedRepeatItemCount: itemCount,
    truncatedRepeatItemCount: truncated,
  };
};

/** Compile an untrusted spec and normalized envelope into a bounded plan. */
export function compileCustomUiRenderPlan(
  specInput: unknown,
  renderInput: unknown,
): CustomUiRenderPlanResult {
  const validateStartedAt = now();
  const specResult = validateCustomUiSpec(specInput);
  if (!specResult.success) return specResult;
  const inputResult = CustomUiRenderInputSchema.safeParse(renderInput);
  if (!inputResult.success) return { success: false, code: "INVALID_INPUT" };
  if (
    Object.keys(specResult.spec.elements).length >
    CUSTOM_UI_SPEC_LIMITS.maxNodes
  ) {
    return { success: false, code: "TOO_MANY_NODES" };
  }
  const structure = validateSpec(
    { ...specResult.spec, state: inputResult.data } as Spec,
    {
      checkOrphans: true,
    },
  );
  if (!structure.valid) {
    return { success: false, code: "INVALID_STRUCTURE" };
  }
  const validateDurationMs = now() - validateStartedAt;

  const compileStartedAt = now();
  const graph = compileGraph(specResult.spec);
  if (!graph.success) return graph;
  const bounded = boundRepeats(specResult.spec, inputResult.data);
  const sanitizedSpec = clampDisclosure(specResult.spec, graph.depthByKey);
  const parentsByKey = new Map<string, string[]>();
  for (const [parentKey, element] of Object.entries(sanitizedSpec.elements)) {
    for (const childKey of referencesFor(element)) {
      parentsByKey.set(childKey, [
        ...(parentsByKey.get(childKey) ?? []),
        parentKey,
      ]);
    }
  }
  const stageByKey = new Map<string, 0 | 1 | 2>();
  const nodes = [...graph.depthByKey.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([key, depth]) => {
      const type = sanitizedSpec.elements[key]?.type ?? "Unknown";
      const cost = renderCostFor(type);
      const ownStage = stageFor(depth, cost);
      const parentStage = Math.max(
        0,
        ...(parentsByKey.get(key) ?? []).map(
          (parentKey) => stageByKey.get(parentKey) ?? 0,
        ),
      ) as 0 | 1 | 2;
      const stage = Math.max(ownStage, parentStage) as 0 | 1 | 2;
      stageByKey.set(key, stage);
      return { key, type, depth, cost, stage };
    });
  const highestStage = nodes.reduce<0 | 1 | 2>(
    (highest, node) => Math.max(highest, node.stage) as 0 | 1 | 2,
    0,
  );
  const compileDurationMs = now() - compileStartedAt;

  return {
    success: true,
    plan: {
      spec: sanitizedSpec,
      input: bounded.input,
      nodes,
      stageCount: (highestStage + 1) as 1 | 2 | 3,
      diagnostics: {
        nodeCount: nodes.length,
        maxDepth: graph.maxDepth,
        deferredCount: nodes.filter((node) => node.stage > 0).length,
        repeatRegionCount: bounded.repeatRegionCount,
        boundedRepeatItemCount: bounded.boundedRepeatItemCount,
        truncatedRepeatItemCount: bounded.truncatedRepeatItemCount,
        validateDurationMs,
        compileDurationMs,
        specByteLength: specResult.byteLength,
      },
    },
  };
}

/** Build the official json-render spec visible at one progressive stage. */
export function buildCustomUiStageSpec(
  plan: CustomUiRenderPlan,
  stage: 0 | 1 | 2,
): CustomUiSpec {
  const included = new Set(
    plan.nodes.filter((node) => node.stage <= stage).map((node) => node.key),
  );
  const elements = Object.fromEntries(
    Object.entries(plan.spec.elements)
      .filter(([key]) => included.has(key))
      .map(([key, element]) => [
        key,
        {
          ...element,
          children: element.children.filter((child) => included.has(child)),
          ...(element.slots && {
            slots: Object.fromEntries(
              Object.entries(element.slots).map(([slot, children]) => [
                slot,
                children.filter((child) => included.has(child)),
              ]),
            ),
          }),
        },
      ]),
  );
  return { root: plan.spec.root, elements };
}
