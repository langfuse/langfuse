import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import { pythonLanguage } from "@codemirror/lang-python";
import { syntaxTree } from "@codemirror/language";

import {
  CODE_EVAL_COMPLETION_CONTRACT,
  type CodeEvalSourceCodeLanguage,
} from "@/src/features/evals/utils/code-eval-template-starter-examples";

// Member paths are read from the syntax tree by hand: lang-javascript's
// `completionPath` cannot express indexed access (`toolCalls[0].`) and
// lang-python has no equivalent. One implementation covers both languages
// because lezer-python emits the same MemberExpression / PropertyName /
// VariableName node names as lezer-javascript.

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

type CompletionHandler = (
  context: CompletionContext,
  inner: SyntaxNode,
) => CompletionResult | null;

const propertyOptions = (
  properties: readonly { label: string; detail: string }[],
) => properties.map((property) => ({ ...property, type: "property" }));

const TYPESCRIPT_CONTRACT = CODE_EVAL_COMPLETION_CONTRACT.TYPESCRIPT;
const PYTHON_CONTRACT = CODE_EVAL_COMPLETION_CONTRACT.PYTHON;

const INDEX_PATH_SEGMENT = "[]";

function buildPathCompletions(
  pathProperties: Record<string, readonly { label: string; detail: string }[]>,
  toolCallProperties: readonly { label: string; detail: string }[],
  toolCallsPath: string,
) {
  const pathCompletions = new Map(
    Object.entries(pathProperties).map(
      ([path, properties]) => [path, propertyOptions(properties)] as const,
    ),
  );
  // Indexed element access completes the element type's properties.
  pathCompletions.set(
    `${toolCallsPath}.${INDEX_PATH_SEGMENT}`,
    propertyOptions(toolCallProperties),
  );
  return pathCompletions;
}

const TYPESCRIPT_EVALUATION_RESULT = {
  ...TYPESCRIPT_CONTRACT.resultType,
  type: "type",
} as const;

const PYTHON_RESULT_CONSTRUCTORS = PYTHON_CONTRACT.resultConstructors.map(
  (constructor) => ({ ...constructor, type: "class" }),
);

const PYTHON_CONSTRUCTOR_PARAMETERS = new Map<
  string,
  readonly { label: string; detail: string }[]
>(Object.entries(PYTHON_CONTRACT.constructorParameters));

const ENUM_VALUE_PROPERTIES = new Set(["dataType", "data_type"]);

const OBJECT_NODES = new Set(["ObjectExpression", "ObjectPattern"]);
const ARRAY_NODES = new Set(["ArrayExpression", "ArrayPattern"]);
const EXPRESSION_WRAPPER_NODES = new Set([
  "AssignmentExpression",
  "ParenthesizedExpression",
]);

const SCOPE_NODES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunction",
  "FunctionDefinition",
]);

const NESTED_SCOPE_NODES = new Set([
  ...SCOPE_NODES,
  "ClassDeclaration",
  "ClassDefinition",
]);

const CONTROL_FLOW_NODES = new Set([
  "Block",
  "Body",
  "IfStatement",
  "ForStatement",
  "WhileStatement",
  "TryStatement",
  "MatchStatement",
  "SwitchStatement",
]);

const STRING_AND_COMMENT_SYNTAX_NODES: ReadonlySet<string> = new Set([
  "String",
  "FormatString",
  "TemplateString",
  "Comment",
  "LineComment",
  "BlockComment",
]);
const DATA_TYPE_IGNORED_SYNTAX_NODES: ReadonlySet<string> = new Set(
  [...STRING_AND_COMMENT_SYNTAX_NODES].filter((node) => node !== "String"),
);
// `${…}` / f"{…}" interpolations embed real code inside string literals.
const INTERPOLATION_NODES = new Set(["Interpolation", "FormatReplacement"]);

export function isInsideStringOrComment(node: SyntaxNode) {
  for (
    let ancestor: SyntaxNode | null = node;
    ancestor;
    ancestor = ancestor.parent
  ) {
    if (INTERPOLATION_NODES.has(ancestor.name)) return false;
    if (STRING_AND_COMMENT_SYNTAX_NODES.has(ancestor.name)) return true;
  }
  return false;
}

const TYPESCRIPT_PROPERTY_NAME = /^(?:[$A-Za-z_][$A-Za-z0-9_]*)?$/;
const PYTHON_PROPERTY_NAME = /^(?:[A-Za-z_][A-Za-z0-9_]*)?$/;

function sliceNode(context: CompletionContext, node: SyntaxNode) {
  return context.state.doc.sliceString(node.from, node.to);
}

// Slice an identifier only up to the cursor so completing mid-word filters and
// replaces the typed prefix (`ctx.obse|rvation`), not text after the cursor.
function sliceNameToCursor(context: CompletionContext, node: SyntaxNode) {
  return context.state.doc.sliceString(
    node.from,
    Math.min(node.to, context.pos),
  );
}

function readMemberPath(
  node: SyntaxNode,
  context: CompletionContext,
): string[] | null {
  if (node.name === "VariableName") {
    return [sliceNode(context, node)];
  }
  if (node.name !== "MemberExpression") return null;

  const object = node.firstChild;
  const operator = object?.nextSibling;
  if (!object || !operator) return null;

  const path = readMemberPath(object, context);
  if (!path) return null;

  if (
    operator.name === "[" ||
    (operator.name === "?." && operator.nextSibling?.name === "[")
  ) {
    return node.lastChild?.name === "]" ? [...path, INDEX_PATH_SEGMENT] : null;
  }

  const property = operator.nextSibling;
  if (
    (operator.name !== "." && operator.name !== "?.") ||
    property?.name !== "PropertyName"
  ) {
    return null;
  }

  return [...path, sliceNode(context, property)];
}

function resolveContractPath(
  path: string[],
  aliases: ReadonlyMap<string, string[]>,
) {
  if (path[0] === "ctx") return path;

  const aliasPath = aliases.get(path[0] ?? "");
  return aliasPath ? [...aliasPath, ...path.slice(1)] : null;
}

function nodeKey(node: SyntaxNode) {
  return `${node.name}:${node.from}:${node.to}`;
}

function getCompletionScope(inner: SyntaxNode) {
  let top = inner;
  for (let node: SyntaxNode | null = inner; node; node = node.parent) {
    if (SCOPE_NODES.has(node.name)) return node;
    top = node;
  }
  return top;
}

const ASSIGNMENT_NODES = new Set([
  "VariableDeclaration", // TS `let x = …`, possibly with several declarators
  "AssignmentExpression", // TS `x = …`, `[x] = …`, `x += …`
  "AssignStatement", // PY `x = …`, `a, b = …`, `x = y = …`
  "UpdateStatement", // PY `x += …`
]);
const ASSIGNMENT_OPERATOR_NODES = new Set(["Equals", "AssignOp"]);
// Destructuring containers whose variable names an assignment rebinds. Member
// targets (`cache[0] = …`) rebind no variable and must not appear here.
const BINDING_PATTERN_NODES = new Set([
  "ArrayPattern",
  "ObjectPattern",
  "PatternProperty",
  "ParenthesizedExpression",
  "TupleExpression",
]);

function collectTargetNames(
  node: SyntaxNode,
  context: CompletionContext,
  into: string[],
) {
  if (node.name === "VariableName" || node.name === "VariableDefinition") {
    into.push(sliceNode(context, node));
    return;
  }
  if (BINDING_PATTERN_NODES.has(node.name)) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      collectTargetNames(child, context, into);
    }
  }
}

type AssignmentTarget = {
  name: string;
  // Set only when this name is the sole, plain-variable target of its
  // assignment: anything else (tuples, patterns, `+=`) cannot alias safely.
  value: SyntaxNode | null;
};

function readDeclarationTargets(
  node: SyntaxNode,
  context: CompletionContext,
): AssignmentTarget[] {
  const targets: AssignmentTarget[] = [];
  let pendingSimple: SyntaxNode | null = null;
  let pendingPatternNames: string[] = [];

  const flush = (value: SyntaxNode | null) => {
    if (pendingSimple) {
      targets.push({ name: sliceNode(context, pendingSimple), value });
    }
    for (const name of pendingPatternNames) targets.push({ name, value: null });
    pendingSimple = null;
    pendingPatternNames = [];
  };

  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "VariableDefinition") {
      pendingSimple = child;
    } else if (BINDING_PATTERN_NODES.has(child.name)) {
      collectTargetNames(child, context, pendingPatternNames);
    } else if (ASSIGNMENT_OPERATOR_NODES.has(child.name)) {
      flush(child.nextSibling);
    } else if (child.name === ",") {
      // Declarator without initializer (`let x, y = 1`) still rebinds x.
      flush(null);
    }
  }
  flush(null);
  return targets;
}

function readAssignmentTargets(
  node: SyntaxNode,
  context: CompletionContext,
): AssignmentTarget[] {
  if (node.name === "VariableDeclaration") {
    return readDeclarationTargets(node, context);
  }

  // Split children into sections separated by assignment operators: the last
  // section is the assigned value, every earlier one a target list (chained
  // `x = y = …` has several target sections).
  const sections: SyntaxNode[][] = [[]];
  let aliasBlocked = false;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (ASSIGNMENT_OPERATOR_NODES.has(child.name)) {
      sections.push([]);
    } else if (child.name === "UpdateOp") {
      // Augmented assignment (`x += …`) rebinds x to a derived value.
      aliasBlocked = true;
      sections.push([]);
    } else if (child.name !== ",") {
      sections[sections.length - 1].push(child);
    }
  }
  if (sections.length === 1) {
    // Operator not recognized (`x ??= …`): invalidate anything that looks
    // like a target rather than risking a stale alias.
    const names: string[] = [];
    for (const part of sections[0]) collectTargetNames(part, context, names);
    return names.map((name) => ({ name, value: null }));
  }

  const valueSection = sections.pop() ?? [];
  const value =
    !aliasBlocked && valueSection.length === 1 ? valueSection[0] : null;

  const targets: AssignmentTarget[] = [];
  for (const section of sections) {
    const [first] = section;
    if (
      section.length === 1 &&
      (first.name === "VariableName" || first.name === "VariableDefinition")
    ) {
      targets.push({ name: sliceNode(context, first), value });
      continue;
    }
    const names: string[] = [];
    for (const part of section) collectTargetNames(part, context, names);
    for (const name of names) targets.push({ name, value: null });
  }
  return targets;
}

// Constructs that rebind names without an assignment node. "ForStatement" and
// "TryStatement" match both grammars; the TS variants keep their targets in
// ForOfSpec/ForInSpec/CatchClause children, so the flat rules find nothing.
const BINDING_NODES = new Set([
  "ForOfSpec",
  "ForInSpec",
  "CatchClause",
  "ForStatement",
  "WithStatement",
  "TryStatement",
]);

function readBindingTargetNames(node: SyntaxNode, context: CompletionContext) {
  const names: string[] = [];

  if (
    node.name === "ForOfSpec" ||
    node.name === "ForInSpec" ||
    node.name === "CatchClause"
  ) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (
        child.name === "of" ||
        child.name === "in" ||
        child.name === "Block"
      ) {
        break;
      }
      collectTargetNames(child, context, names);
    }
    return names;
  }

  if (node.name === "ForStatement") {
    // PY `for x in items:` — everything after `in` is a read, not a target.
    for (
      let child = node.firstChild;
      child && child.name !== "in";
      child = child.nextSibling
    ) {
      collectTargetNames(child, context, names);
    }
    return names;
  }

  // PY WithStatement / TryStatement: only the name directly after `as` is
  // bound (`except ValueError as e:` reads ValueError, binds e).
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "as" && child.nextSibling?.name === "VariableName") {
      names.push(sliceNode(context, child.nextSibling));
    }
  }
  return names;
}

function isOnCursorPath(
  node: SyntaxNode,
  scope: SyntaxNode,
  cursorAncestors: ReadonlySet<string>,
) {
  // An assignment in another branch may not run, so it invalidates rather
  // than establishes an alias for code at the cursor.
  for (
    let parent = node.parent;
    parent && parent !== scope;
    parent = parent.parent
  ) {
    if (
      CONTROL_FLOW_NODES.has(parent.name) &&
      !cursorAncestors.has(nodeKey(parent))
    ) {
      return false;
    }
  }
  return true;
}

function getContractAliases(context: CompletionContext, inner: SyntaxNode) {
  const aliases = new Map<string, string[]>();
  const scope = getCompletionScope(inner);
  const cursorAncestors = new Set<string>();

  for (let node: SyntaxNode | null = inner; node; node = node.parent) {
    cursorAncestors.add(nodeKey(node));
    if (node.from === scope.from && node.to === scope.to) break;
  }

  function visit(node: SyntaxNode) {
    if (node.from >= context.pos) return;
    if (node !== scope && NESTED_SCOPE_NODES.has(node.name)) return;

    // Bindings shadow for their whole statement (the cursor may sit inside
    // the loop body), so invalidate regardless of where the node ends.
    if (BINDING_NODES.has(node.name)) {
      for (const name of readBindingTargetNames(node, context)) {
        aliases.delete(name);
      }
    }

    if (ASSIGNMENT_NODES.has(node.name) && node.to <= context.pos) {
      const allowAlias = isOnCursorPath(node, scope, cursorAncestors);
      for (const target of readAssignmentTargets(node, context)) {
        const path =
          allowAlias && target.value
            ? readMemberPath(target.value, context)
            : null;
        const resolvedPath = path ? resolveContractPath(path, aliases) : null;

        if (resolvedPath) aliases.set(target.name, resolvedPath);
        else aliases.delete(target.name);
      }
      // Keep descending: the assigned value can nest further assignments
      // (`cache[0] = x = {}` must still invalidate `x`).
    }

    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  }

  visit(scope);
  return aliases;
}

function getSyntaxCompletionPath(
  context: CompletionContext,
  inner: SyntaxNode,
) {
  let member: SyntaxNode | null = null;
  let name = "";

  if (inner.name === "PropertyName") {
    member = inner.parent;
    name = sliceNameToCursor(context, inner);
  } else if (
    (inner.name === "." || inner.name === "?.") &&
    inner.parent?.name === "MemberExpression"
  ) {
    member = inner.parent;
  } else if (inner.name === "MemberExpression") {
    member = inner;
  }

  const object = member?.firstChild;
  const path = object ? readMemberPath(object, context) : null;
  if (!path) return null;

  const resolvedPath = resolveContractPath(
    path,
    path[0] === "ctx" ? new Map() : getContractAliases(context, inner),
  );
  return resolvedPath ? { path: resolvedPath, name } : null;
}

// Whitespace after `{`, `(`, or `,` makes the cursor resolve to the enclosing
// container node instead of the token; the previous token decides whether the
// cursor still sits in "new entry" position.
function lastChildBefore(node: SyntaxNode, pos: number) {
  let previous: SyntaxNode | null = null;
  for (
    let child = node.firstChild;
    child && child.from < pos;
    child = child.nextSibling
  ) {
    previous = child;
  }
  return previous;
}

function makePathCompletionHandler(
  pathCompletions: ReadonlyMap<string, readonly Completion[]>,
  validFor: RegExp,
): CompletionHandler {
  return (context, inner) => {
    const resolved = getSyntaxCompletionPath(context, inner);
    if (!resolved) return null;

    const options = pathCompletions.get(resolved.path.join("."));
    if (!options) return null;

    return { from: context.pos - resolved.name.length, options, validFor };
  };
}

function getPythonConstructorParameterCompletion(
  context: CompletionContext,
  inner: SyntaxNode,
) {
  let argumentList: SyntaxNode | null = null;
  let name = "";

  if (inner.name === "VariableName" && inner.parent?.name === "ArgList") {
    const previous = inner.prevSibling;
    if (previous?.name !== "(" && previous?.name !== ",") return null;
    argumentList = inner.parent;
    name = sliceNameToCursor(context, inner);
  } else if (
    (inner.name === "(" || inner.name === ",") &&
    inner.parent?.name === "ArgList"
  ) {
    argumentList = inner.parent;
  } else if (inner.name === "ArgList") {
    const previous = lastChildBefore(inner, context.pos);
    if (previous?.name === "(" || previous?.name === ",") {
      argumentList = inner;
    }
  }

  const call = argumentList?.parent;
  const callee = call?.name === "CallExpression" ? call.firstChild : null;
  if (callee?.name !== "VariableName") return null;

  const constructorName = sliceNode(context, callee);
  const parameters = PYTHON_CONSTRUCTOR_PARAMETERS.get(constructorName);
  if (!parameters) return null;

  const usedParameters = new Set<string>();
  for (let child = argumentList?.firstChild; child; child = child.nextSibling) {
    if (
      child.name === "VariableName" &&
      child.nextSibling?.name === "AssignOp"
    ) {
      // The keyword being edited stays available for its own completion.
      if (child.from === inner.from && child.to === inner.to) continue;
      usedParameters.add(sliceNode(context, child));
    }
  }

  return {
    from: context.pos - name.length,
    options: parameters
      .filter((parameter) => !usedParameters.has(parameter.label))
      .map((parameter) => ({
        ...parameter,
        type: "property",
        apply: `${parameter.label}=`,
      })),
    validFor: PYTHON_PROPERTY_NAME,
  };
}

function getPythonResultConstructorCompletion(
  context: CompletionContext,
  inner: SyntaxNode,
) {
  if (inner.name !== "VariableName" || inner.from >= context.pos) return null;

  return {
    from: inner.from,
    options: PYTHON_RESULT_CONSTRUCTORS,
    validFor: PYTHON_PROPERTY_NAME,
  };
}

// Mirrors the validator's hasEvaluateFunction: an evaluator may be a
// `function evaluate` declaration or a `const evaluate = …` arrow/function
// expression, where the authoritative name is the declarator's.
function getFunctionName(node: SyntaxNode, context: CompletionContext) {
  if (node.name === "FunctionDeclaration") {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "VariableDefinition") {
        return sliceNode(context, child);
      }
    }
    return null;
  }

  if (node.name !== "ArrowFunction" && node.name !== "FunctionExpression") {
    return null;
  }
  if (node.parent?.name !== "VariableDeclaration") return null;
  for (
    let sibling = node.prevSibling;
    sibling && sibling.name !== ",";
    sibling = sibling.prevSibling
  ) {
    if (sibling.name === "VariableDefinition") {
      return sliceNode(context, sibling);
    }
  }
  return null;
}

function getTypeScriptReturnTypeCompletion(
  context: CompletionContext,
  inner: SyntaxNode,
) {
  let annotation: SyntaxNode | null = null;
  if (inner.name === "TypeName") {
    for (let node = inner.parent; node; node = node.parent) {
      if (node.name === "TypeAnnotation") {
        annotation = node;
        break;
      }
      if (SCOPE_NODES.has(node.name) || node.name === "ParamList") break;
    }
  } else if (inner.name === ":" && inner.parent?.name === "TypeAnnotation") {
    annotation = inner.parent;
  }
  const fn = annotation?.parent;
  if (!fn || getFunctionName(fn, context) !== "evaluate") return null;

  const name =
    inner.name === "TypeName" ? sliceNameToCursor(context, inner) : "";
  return {
    from: context.pos - name.length,
    options: [TYPESCRIPT_EVALUATION_RESULT],
    validFor: TYPESCRIPT_PROPERTY_NAME,
  };
}

function getCurrentObjectProperty(
  context: CompletionContext,
  inner: SyntaxNode,
) {
  let object: SyntaxNode | null = null;
  let property: SyntaxNode | null = null;
  let name = "";

  if (
    inner.name === "PropertyDefinition" &&
    inner.parent?.name === "Property" &&
    OBJECT_NODES.has(inner.parent.parent?.name ?? "")
  ) {
    property = inner.parent;
    object = property.parent;
    name = sliceNameToCursor(context, inner);
  } else if (
    inner.name === "PropertyName" &&
    inner.parent?.name === "PatternProperty" &&
    OBJECT_NODES.has(inner.parent.parent?.name ?? "")
  ) {
    property = inner.parent;
    object = property.parent;
    name = sliceNameToCursor(context, inner);
  } else if (
    (inner.name === "{" || inner.name === ",") &&
    OBJECT_NODES.has(inner.parent?.name ?? "")
  ) {
    object = inner.parent;
  } else if (OBJECT_NODES.has(inner.name)) {
    const previous = lastChildBefore(inner, context.pos);
    if (previous?.name === "{" || previous?.name === ",") {
      object = inner;
    }
  }

  return object ? { object, property, name } : null;
}

function unwrapExpressionParent(node: SyntaxNode | null) {
  while (node && EXPRESSION_WRAPPER_NODES.has(node.name)) {
    node = node.parent;
  }
  return node;
}

function isEvaluateReturnObject(
  object: SyntaxNode,
  context: CompletionContext,
) {
  const container = unwrapExpressionParent(object.parent);
  // Expression-body arrows return without a ReturnStatement:
  // `const evaluate = (ctx) => ({ scores: [] })`.
  if (container && SCOPE_NODES.has(container.name)) {
    return getFunctionName(container, context) === "evaluate";
  }
  if (container?.name !== "ReturnStatement") return false;

  for (let node = container.parent; node; node = node.parent) {
    if (SCOPE_NODES.has(node.name)) {
      return getFunctionName(node, context) === "evaluate";
    }
  }
  return false;
}

function getPropertyName(node: SyntaxNode, context: CompletionContext) {
  const name = node.firstChild;
  if (name?.name !== "PropertyDefinition" && name?.name !== "PropertyName") {
    return null;
  }
  return sliceNode(context, name);
}

function isTypeScriptScoreObject(
  object: SyntaxNode,
  context: CompletionContext,
) {
  const array = unwrapExpressionParent(object.parent);
  const scoreProperty = ARRAY_NODES.has(array?.name ?? "")
    ? unwrapExpressionParent(array?.parent ?? null)
    : null;
  const resultObject = scoreProperty?.parent;
  return Boolean(
    scoreProperty?.name === "Property" &&
    getPropertyName(scoreProperty, context) === "scores" &&
    resultObject &&
    OBJECT_NODES.has(resultObject.name) &&
    isEvaluateReturnObject(resultObject, context),
  );
}

function getTypeScriptObjectPropertyCompletion(
  context: CompletionContext,
  inner: SyntaxNode,
) {
  const current = getCurrentObjectProperty(context, inner);
  if (!current) return null;

  let properties: readonly { label: string; detail: string }[] | null = null;
  if (isEvaluateReturnObject(current.object, context)) {
    properties = TYPESCRIPT_CONTRACT.resultProperties;
  } else if (isTypeScriptScoreObject(current.object, context)) {
    properties = TYPESCRIPT_CONTRACT.scoreProperties;
  }
  if (!properties) return null;

  const usedProperties = new Set<string>();
  for (
    let property = current.object.firstChild;
    property;
    property = property.nextSibling
  ) {
    if (
      current.property &&
      property.from === current.property.from &&
      property.to === current.property.to
    ) {
      continue;
    }
    const name = getPropertyName(property, context);
    if (name) usedProperties.add(name);
  }

  const options = properties
    .filter((property) => !usedProperties.has(property.label))
    .map((property) => ({
      ...property,
      type: "property",
      apply: `${property.label}: `,
    }));
  return options.length > 0
    ? {
        from: context.pos - current.name.length,
        options,
        validFor: TYPESCRIPT_PROPERTY_NAME,
      }
    : null;
}

function getQuotedEnumValueCompletion(
  context: CompletionContext,
  value: SyntaxNode | null,
  values: readonly string[],
  detail: string,
) {
  const partial =
    value && value.from <= context.pos
      ? context.state.doc.sliceString(value.from, context.pos)
      : "";
  const quote = partial.startsWith("'") ? "'" : '"';
  const from = partial ? (value?.from ?? context.pos) : context.pos;
  const hasClosingQuote =
    value?.name === "String" &&
    value.to > context.pos &&
    context.state.doc.sliceString(value.to - 1, value.to) === quote;

  return {
    from,
    // Replace through the closing quote's content so accepting mid-value
    // does not leave the old suffix behind ("CA|TEGORY" → "NUMERIC").
    to: hasClosingQuote && value ? value.to - 1 : context.pos,
    options: values.map((value) => ({
      label: `${quote}${value}${quote}`,
      // Keep an auto-inserted closing quote outside the filtered range and
      // reuse it on acceptance, so both empty and partial strings complete.
      ...(hasClosingQuote ? { apply: `${quote}${value}` } : {}),
      type: "enum",
      detail,
    })),
  };
}

function getTypeScriptDataTypeValueCompletion(
  context: CompletionContext,
  inner: SyntaxNode,
) {
  let property: SyntaxNode | null = inner;
  while (
    property &&
    property.name !== "Property" &&
    property.name !== "PatternProperty" &&
    !OBJECT_NODES.has(property.name)
  ) {
    property = property.parent;
  }
  if (
    (property?.name !== "Property" && property?.name !== "PatternProperty") ||
    getPropertyName(property, context) !== "dataType" ||
    !property.parent ||
    !isTypeScriptScoreObject(property.parent, context)
  ) {
    return null;
  }

  for (
    let node: SyntaxNode | null = inner;
    node !== property;
    node = node.parent
  ) {
    if (!node || DATA_TYPE_IGNORED_SYNTAX_NODES.has(node.name)) return null;
  }

  let colon = property.firstChild;
  while (colon && colon.name !== ":") colon = colon.nextSibling;
  if (!colon || context.pos < colon.to) return null;

  return getQuotedEnumValueCompletion(
    context,
    colon.nextSibling,
    TYPESCRIPT_CONTRACT.dataTypeValues,
    "Score.dataType",
  );
}

function getPythonDataTypeValueCompletion(
  context: CompletionContext,
  inner: SyntaxNode,
) {
  let argument = inner;
  while (argument.parent?.name !== "ArgList") {
    if (DATA_TYPE_IGNORED_SYNTAX_NODES.has(argument.name)) return null;
    if (!argument.parent) return null;
    argument = argument.parent;
  }
  if (DATA_TYPE_IGNORED_SYNTAX_NODES.has(argument.name)) return null;

  const argumentList = argument.parent;
  if (!argumentList) return null;
  const call = argumentList.parent;
  const callee = call?.name === "CallExpression" ? call.firstChild : null;
  if (
    callee?.name !== "VariableName" ||
    sliceNode(context, callee) !== "Score"
  ) {
    return null;
  }

  const operator =
    argument.name === "AssignOp"
      ? argument
      : argument.prevSibling?.name === "AssignOp"
        ? argument.prevSibling
        : null;
  const parameter = operator?.prevSibling;
  if (
    parameter?.name !== "VariableName" ||
    sliceNode(context, parameter) !== "data_type"
  ) {
    return null;
  }

  return getQuotedEnumValueCompletion(
    context,
    argument === operator ? null : argument,
    PYTHON_CONTRACT.dataTypeValues,
    "Score.data_type",
  );
}

const COMPLETION_CONFIGS: Record<
  CodeEvalSourceCodeLanguage,
  {
    language: typeof javascriptLanguage;
    // Ordered syntax handlers; the first one returning a result wins.
    handlers: readonly CompletionHandler[];
    // Runs before the string/comment guard: enum values complete in strings.
    dataTypeHandler: CompletionHandler;
  }
> = {
  TYPESCRIPT: {
    language: javascriptLanguage,
    handlers: [
      makePathCompletionHandler(
        buildPathCompletions(
          TYPESCRIPT_CONTRACT.pathProperties,
          TYPESCRIPT_CONTRACT.toolCallProperties,
          "ctx.observation.toolCalls",
        ),
        TYPESCRIPT_PROPERTY_NAME,
      ),
      getTypeScriptReturnTypeCompletion,
      getTypeScriptObjectPropertyCompletion,
    ],
    dataTypeHandler: getTypeScriptDataTypeValueCompletion,
  },
  PYTHON: {
    language: pythonLanguage,
    handlers: [
      makePathCompletionHandler(
        buildPathCompletions(
          PYTHON_CONTRACT.pathProperties,
          PYTHON_CONTRACT.toolCallProperties,
          "ctx.observation.tool_calls",
        ),
        PYTHON_PROPERTY_NAME,
      ),
      getPythonConstructorParameterCompletion,
      getPythonResultConstructorCompletion,
    ],
    dataTypeHandler: getPythonDataTypeValueCompletion,
  },
};

export function getCodeEvalCompletionSource(
  sourceCodeLanguage: CodeEvalSourceCodeLanguage,
): CompletionSource {
  const config = COMPLETION_CONFIGS[sourceCodeLanguage];

  return (context: CompletionContext) => {
    const inner = syntaxTree(context.state).resolveInner(context.pos, -1);

    const dataTypeValue = config.dataTypeHandler(context, inner);
    if (dataTypeValue) return dataTypeValue;

    if (isInsideStringOrComment(inner)) return null;

    for (const handler of config.handlers) {
      const result = handler(context, inner);
      if (result) return result;
    }
    return null;
  };
}

export function getCodeEvalCompletionExtension(
  sourceCodeLanguage: CodeEvalSourceCodeLanguage,
) {
  return [
    COMPLETION_CONFIGS[sourceCodeLanguage].language.data.of({
      autocomplete: getCodeEvalCompletionSource(sourceCodeLanguage),
    }),
    autocompletion({
      activateOnCompletion: (completion) =>
        ENUM_VALUE_PROPERTIES.has(completion.label),
    }),
  ];
}
