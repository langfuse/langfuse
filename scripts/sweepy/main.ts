#!/usr/bin/env -S deno run --config scripts/sweepy/deno.json --allow-read --allow-write --allow-env
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JsxAttribute,
  Node,
  Project,
  PropertySignature,
  QuoteKind,
  SourceFile,
  SyntaxKind,
  TypeAliasDeclaration,
  TypeLiteralNode,
} from "npm:ts-morph@28.0.0";

type Usage = {
  filePath: string;
  line: number;
  value: PropValue;
  attribute: JsxAttribute;
};

type PropValue = string | number;

type ExtractedClassValues =
  | { kind: "single"; variants: [ClassValueVariant] }
  | { kind: "conditional"; variants: ClassValueVariant[] };

type ExtractedPropValues =
  | { kind: "single"; variants: [PropValueVariant] }
  | { kind: "conditional"; variants: PropValueVariant[] };

type ClassValueVariant = {
  conditionText?: string;
  value: string;
};

type PropValueVariant = {
  conditionText?: string;
  value: PropValue;
};

type UnsupportedUsage = {
  filePath: string;
  line: number;
  reason: string;
};

type ReplacementSummary = {
  replacedUsages: number;
  updatedDefinition: boolean;
  unsupportedUsages: UnsupportedUsage[];
};

type CollectedValues = {
  values: PropValue[];
  unsupportedUsages: UnsupportedUsage[];
};

type SaveDecision = "write" | "discard";

type ComponentDoctorContext = {
  componentName: string;
  propsTypeName: string;
  usageRoot: string;
  tsConfigPath: string;
  project: Project;
  definitionFile: SourceFile;
};

type ComponentDoctorSettings = Pick<
  ComponentDoctorContext,
  "componentName" | "propsTypeName" | "usageRoot" | "tsConfigPath"
>;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const defaultPropName = "className";
const maxClassValueVariants = 16;
const otherDefinitionFileOption = "other";
const reactComponentDoctorCommand = "react-component-doctor";
const banner = String.raw`
     _______  _     _  _______  _______  _______  __   __ 
    |       || | _ | ||       ||       ||       ||  | |  |
    |  _____|| || || ||    ___||    ___||    _  ||  |_|  |
    | |_____ |       ||   |___ |   |___ |   |_| ||       |
    |_____  ||       ||    ___||    ___||    ___||_     _|
     _____| ||   _   ||   |___ |   |___ |   |      |   |  
    |_______||__| |__||_______||_______||___|      |___|  

      » Because technical debt doesn't clean itself. «
`;

function printHelp() {
  console.log(`Usage: ./scripts/sweepy/main.ts <command>

Commands:
  ${reactComponentDoctorCommand}  Inspect and refactor React component props interactively`);
}

export function createStringUnionType(values: string[]): string {
  const uniqueValues = [...new Set(values)].sort();
  return uniqueValues.map((value) => JSON.stringify(value)).join(" | ");
}

export function createPropUnionType(values: PropValue[]): string {
  const uniqueValues = [...new Set(values)].sort((left, right) =>
    renderPropValue(left).localeCompare(renderPropValue(right)),
  );
  return uniqueValues.map(renderPropValue).join(" | ");
}

function renderPropValue(value: PropValue): string {
  return typeof value === "number" ? value.toString() : JSON.stringify(value);
}

function renderPropInitializer(value: PropValue): string {
  return typeof value === "number" ? `{${value}}` : JSON.stringify(value);
}

function collectPropUsages(
  sourceFiles: SourceFile[],
  componentName: string,
  propName: string,
): { usages: Usage[]; unsupportedUsages: UnsupportedUsage[] } {
  const usages: Usage[] = [];
  const unsupportedUsages: UnsupportedUsage[] = [];

  for (const sourceFile of sourceFiles) {
    const jsxNodes = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];

    for (const jsxNode of jsxNodes) {
      if (jsxNode.getTagNameNode().getText() !== componentName) continue;

      const attribute = jsxNode
        .getAttributes()
        .find(
          (attr): attr is JsxAttribute =>
            Node.isJsxAttribute(attr) &&
            attr.getNameNode().getText() === propName,
        );

      if (!attribute) continue;

      const initializer = attribute.getInitializer();
      const line = sourceFile.getLineAndColumnAtPos(attribute.getStart()).line;

      if (!initializer) {
        unsupportedUsages.push({
          filePath: sourceFile.getFilePath(),
          line,
          reason: `${propName} has no initializer`,
        });
        continue;
      }

      const extractedValues = extractPropValues(initializer, propName);

      if (typeof extractedValues !== "string") {
        for (const { value } of extractedValues.variants) {
          usages.push({
            filePath: sourceFile.getFilePath(),
            line,
            value,
            attribute,
          });
        }
        continue;
      }

      unsupportedUsages.push({
        filePath: sourceFile.getFilePath(),
        line,
        reason: extractedValues,
      });
    }
  }

  return { usages, unsupportedUsages };
}

function collectDefaultPropValues(
  sourceFile: SourceFile,
  componentName: string,
  propName: string,
): CollectedValues {
  const propsParameter = getComponentPropsParameter(sourceFile, componentName);
  const nameNode = propsParameter?.getNameNode();
  if (!propsParameter || !nameNode || !Node.isObjectBindingPattern(nameNode)) {
    return { values: [], unsupportedUsages: [] };
  }

  const values: PropValue[] = [];
  const unsupportedUsages: UnsupportedUsage[] = [];

  for (const bindingElement of nameNode.getElements()) {
    const propertyName =
      bindingElement.getPropertyNameNode()?.getText() ??
      bindingElement.getNameNode().getText();
    if (propertyName !== propName) continue;

    const initializer = bindingElement.getInitializer();
    if (!initializer) continue;

    const extractedValues = extractPropDefaultValues(initializer, propName);
    if (typeof extractedValues !== "string") {
      values.push(...extractedValues.variants.map((variant) => variant.value));
      continue;
    }

    unsupportedUsages.push({
      filePath: sourceFile.getFilePath(),
      line: sourceFile.getLineAndColumnAtPos(initializer.getStart()).line,
      reason: `unsupported default ${propName}: ${extractedValues}`,
    });
  }

  return { values, unsupportedUsages };
}

function getComponentPropsParameter(
  sourceFile: SourceFile,
  componentName: string,
) {
  const functionDeclaration = sourceFile.getFunction(componentName);
  if (functionDeclaration) return functionDeclaration.getParameters()[0];

  const variableDeclaration = sourceFile.getVariableDeclaration(componentName);
  const initializer = variableDeclaration?.getInitializer();
  if (
    initializer &&
    (Node.isArrowFunction(initializer) ||
      Node.isFunctionExpression(initializer))
  ) {
    return initializer.getParameters()[0];
  }

  return undefined;
}

function extractClassValues(initializer: Node): ExtractedClassValues | string {
  if (Node.isStringLiteral(initializer)) {
    return {
      kind: "single",
      variants: [{ value: initializer.getLiteralText() }],
    };
  }

  if (!Node.isJsxExpression(initializer)) {
    return `unsupported initializer: ${initializer.getKindName()}`;
  }

  const expression = initializer.getExpression();
  if (!expression) return "className has empty expression initializer";

  const extractedValues = extractClassExpressionVariants(expression);
  if (typeof extractedValues === "string") {
    return `unsupported expression: ${extractedValues}`;
  }

  return extractedValues;
}

function extractPropValues(
  initializer: Node,
  propName: string,
): ExtractedPropValues | string {
  if (propName === defaultPropName) return extractClassValues(initializer);

  if (Node.isStringLiteral(initializer)) {
    return {
      kind: "single",
      variants: [{ value: initializer.getLiteralText() }],
    };
  }

  if (!Node.isJsxExpression(initializer)) {
    return `unsupported initializer: ${initializer.getKindName()}`;
  }

  const expression = initializer.getExpression();
  if (!expression) return `${propName} has empty expression initializer`;

  const extractedValues = extractPropExpressionVariants(expression);
  if (typeof extractedValues === "string") {
    return `unsupported expression: ${extractedValues}`;
  }

  return extractedValues;
}

function extractPropDefaultValues(
  expression: Node,
  propName: string,
): ExtractedPropValues | string {
  if (propName === defaultPropName) {
    const extractedValues = extractClassExpressionVariants(expression);
    if (typeof extractedValues === "string") {
      return `unsupported expression: ${extractedValues}`;
    }

    return extractedValues;
  }

  const extractedValues = extractPropExpressionVariants(expression);
  if (typeof extractedValues === "string") {
    return `unsupported expression: ${extractedValues}`;
  }

  return extractedValues;
}

function extractPropExpressionVariants(
  expression: Node,
): ExtractedPropValues | string {
  const literalValue = getStaticPropValue(expression);
  if (literalValue !== undefined) {
    return { kind: "single", variants: [{ value: literalValue }] };
  }

  if (Node.isParenthesizedExpression(expression)) {
    return extractPropExpressionVariants(expression.getExpression());
  }

  if (!Node.isConditionalExpression(expression)) {
    return expression.getKindName();
  }

  const conditionText = expression.getCondition().getText();
  const trueValues = extractPropExpressionVariants(expression.getWhenTrue());
  if (typeof trueValues === "string") return trueValues;

  const falseValues = extractPropExpressionVariants(expression.getWhenFalse());
  if (typeof falseValues === "string") return falseValues;

  return toExtractedPropValues([
    ...trueValues.variants.map((variant) => ({
      conditionText: combineConditions(conditionText, variant.conditionText),
      value: variant.value,
    })),
    ...falseValues.variants.map((variant) => ({
      conditionText: combineConditions(
        `!(${conditionText})`,
        variant.conditionText,
      ),
      value: variant.value,
    })),
  ]);
}

function getStaticPropValue(expression: Node): PropValue | undefined {
  if (
    Node.isStringLiteral(expression) ||
    Node.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.getLiteralText();
  }

  if (Node.isNumericLiteral(expression)) return Number(expression.getText());

  return undefined;
}

function toExtractedPropValues(
  variants: PropValueVariant[],
): ExtractedPropValues {
  if (variants.length === 1 && !variants[0].conditionText) {
    return { kind: "single", variants: [variants[0]] };
  }

  return { kind: "conditional", variants };
}

function extractCnClassValues(
  callExpression: Node,
): ExtractedClassValues | string {
  if (!Node.isCallExpression(callExpression)) {
    return "unsupported cn expression";
  }

  return extractClassFragments(
    callExpression.getArguments(),
    "unsupported cn argument",
  );
}

function extractClassExpressionVariants(
  expression: Node,
): ExtractedClassValues | string {
  if (Node.isCallExpression(expression)) {
    if (expression.getExpression().getText() !== "cn") {
      return `unsupported call expression: ${expression.getExpression().getText()}`;
    }

    return extractCnClassValues(expression);
  }

  const extractedValues = extractClassFragment(expression);
  if (typeof extractedValues === "string") return extractedValues;

  return toExtractedClassValues(extractedValues);
}

function extractClassFragments(
  fragments: Node[],
  unsupportedPrefix: string,
): ExtractedClassValues | string {
  let variants: ClassValueVariant[] = [{ value: "" }];

  for (const fragment of fragments) {
    const extractedFragment = extractClassFragment(fragment);
    if (typeof extractedFragment === "string") {
      return `${unsupportedPrefix}: ${extractedFragment}`;
    }

    variants = combineClassValueVariants(variants, extractedFragment);
    if (variants.length > maxClassValueVariants) {
      return `unsupported expression: more than ${maxClassValueVariants} class variants`;
    }
  }

  return toExtractedClassValues(
    variants.map((variant) => ({
      ...variant,
      value: joinClassValues([variant.value]),
    })),
  );
}

function extractClassFragment(expression: Node): ClassValueVariant[] | string {
  const literalValue = getStaticClassFragmentValue(expression);
  if (literalValue !== undefined) return [{ value: literalValue }];

  if (Node.isParenthesizedExpression(expression)) {
    return extractClassFragment(expression.getExpression());
  }

  if (Node.isConditionalExpression(expression)) {
    return extractConditionalClassFragment(expression);
  }

  if (Node.isBinaryExpression(expression)) {
    return extractBinaryClassFragment(expression);
  }

  if (Node.isTemplateExpression(expression)) {
    return extractTemplateClassFragment(expression);
  }

  return expression.getKindName();
}

function extractConditionalClassFragment(
  expression: Node,
): ClassValueVariant[] | string {
  if (!Node.isConditionalExpression(expression)) {
    return expression.getKindName();
  }

  const conditionText = expression.getCondition().getText();
  const trueVariants = extractClassFragment(expression.getWhenTrue());
  if (typeof trueVariants === "string") return trueVariants;

  const falseVariants = extractClassFragment(expression.getWhenFalse());
  if (typeof falseVariants === "string") return falseVariants;

  return [
    ...trueVariants.map((variant) => ({
      conditionText: combineConditions(conditionText, variant.conditionText),
      value: variant.value,
    })),
    ...falseVariants.map((variant) => ({
      conditionText: combineConditions(
        `!(${conditionText})`,
        variant.conditionText,
      ),
      value: variant.value,
    })),
  ];
}

function extractBinaryClassFragment(
  expression: Node,
): ClassValueVariant[] | string {
  if (!Node.isBinaryExpression(expression)) return expression.getKindName();

  if (
    expression.getOperatorToken().getKind() !==
    SyntaxKind.AmpersandAmpersandToken
  ) {
    return expression.getKindName();
  }

  const left = expression.getLeft();
  const right = expression.getRight();
  const rightLiteralValue = getStaticClassFragmentValue(right);

  if (rightLiteralValue !== undefined) {
    return [
      { conditionText: left.getText(), value: rightLiteralValue },
      { conditionText: `!(${left.getText()})`, value: "" },
    ];
  }

  return expression.getKindName();
}

function extractTemplateClassFragment(
  expression: Node,
): ClassValueVariant[] | string {
  if (!Node.isTemplateExpression(expression)) return expression.getKindName();

  let variants: ClassValueVariant[] = [
    {
      value: expression.getHead().getLiteralText(),
    },
  ];

  for (const span of expression.getTemplateSpans()) {
    const extractedExpression = extractClassFragment(span.getExpression());
    if (typeof extractedExpression === "string") return extractedExpression;

    variants = concatenateClassValueVariants(variants, extractedExpression);
    variants = concatenateClassValueVariants(variants, [
      {
        value: span.getLiteral().getLiteralText(),
      },
    ]);

    if (variants.length > maxClassValueVariants) {
      return `more than ${maxClassValueVariants} class variants`;
    }
  }

  return variants;
}

function combineClassValueVariants(
  leftVariants: ClassValueVariant[],
  rightVariants: ClassValueVariant[],
): ClassValueVariant[] {
  return leftVariants.flatMap((leftVariant) =>
    rightVariants.map((rightVariant) => ({
      conditionText: combineConditions(
        leftVariant.conditionText,
        rightVariant.conditionText,
      ),
      value: joinClassValues([leftVariant.value, rightVariant.value]),
    })),
  );
}

function concatenateClassValueVariants(
  leftVariants: ClassValueVariant[],
  rightVariants: ClassValueVariant[],
): ClassValueVariant[] {
  return leftVariants.flatMap((leftVariant) =>
    rightVariants.map((rightVariant) => ({
      conditionText: combineConditions(
        leftVariant.conditionText,
        rightVariant.conditionText,
      ),
      value: `${leftVariant.value}${rightVariant.value}`,
    })),
  );
}

function combineConditions(
  leftCondition?: string,
  rightCondition?: string,
): string | undefined {
  if (!leftCondition) return rightCondition;
  if (!rightCondition) return leftCondition;
  return `(${leftCondition}) && (${rightCondition})`;
}

function getStaticClassFragmentValue(expression: Node): string | undefined {
  if (
    Node.isStringLiteral(expression) ||
    Node.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.getLiteralText();
  }

  if (
    expression.getKind() === SyntaxKind.NullKeyword ||
    (Node.isIdentifier(expression) && expression.getText() === "undefined")
  ) {
    return "";
  }

  return undefined;
}

function toExtractedClassValues(
  variants: ClassValueVariant[],
): ExtractedClassValues {
  const normalizedVariants = variants.map((variant) => ({
    ...variant,
    value: joinClassValues([variant.value]),
  }));

  if (normalizedVariants.length === 1 && !normalizedVariants[0].conditionText) {
    return { kind: "single", variants: [normalizedVariants[0]] };
  }

  return { kind: "conditional", variants: normalizedVariants };
}

function joinClassValues(values: string[]): string {
  return values
    .flatMap((value) => value.split(/\s+/))
    .filter(Boolean)
    .join(" ");
}

function rewriteStrictPropType(
  sourceFile: SourceFile,
  componentName: string,
  propsTypeName: string,
  propName: string,
  values: PropValue[],
) {
  const typeAliasDeclaration =
    sourceFile.getTypeAlias(propsTypeName) ??
    convertInterfaceToTypeAlias(sourceFile, propsTypeName) ??
    extractInlinePropsType(sourceFile, componentName, propsTypeName);

  ensurePropOnTypeAlias(
    typeAliasDeclaration,
    propName,
    createPropUnionType(values),
  );
}

function rewriteSupportedPropExpressionUsages(
  sourceFiles: SourceFile[],
  componentName: string,
  propName: string,
) {
  for (const sourceFile of sourceFiles) {
    const jsxNodes = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];

    for (const jsxNode of jsxNodes) {
      if (
        jsxNode.wasForgotten() ||
        jsxNode.getTagNameNode().getText() !== componentName
      ) {
        continue;
      }

      const attribute = jsxNode
        .getAttributes()
        .find(
          (attr): attr is JsxAttribute =>
            Node.isJsxAttribute(attr) &&
            attr.getNameNode().getText() === propName,
        );
      if (!attribute) continue;

      const initializer = attribute.getInitializer();
      if (!initializer || Node.isStringLiteral(initializer)) continue;

      const extractedValues = extractPropValues(initializer, propName);
      if (typeof extractedValues === "string") continue;

      if (extractedValues.kind === "single") {
        attribute.setInitializer(
          renderPropInitializer(extractedValues.variants[0].value),
        );
        continue;
      }

      rewriteConditionalPropValue(attribute, extractedValues);
    }
  }
}

function replaceStaticPropValueUsages(
  sourceFiles: SourceFile[],
  componentName: string,
  fromPropName: string,
  fromValue: PropValue,
  toPropName: string,
  toValue: PropValue,
): ReplacementSummary {
  const unsupportedUsages: UnsupportedUsage[] = [];
  let replacedUsages = 0;

  for (const sourceFile of sourceFiles) {
    const jsxNodes = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];

    for (const jsxNode of jsxNodes) {
      if (
        jsxNode.wasForgotten() ||
        jsxNode.getTagNameNode().getText() !== componentName
      ) {
        continue;
      }

      const attributes = jsxNode.getAttributes();
      const fromAttribute = attributes.find(
        (attr): attr is JsxAttribute =>
          Node.isJsxAttribute(attr) &&
          attr.getNameNode().getText() === fromPropName,
      );
      if (!fromAttribute) continue;

      const line = sourceFile.getLineAndColumnAtPos(
        fromAttribute.getStart(),
      ).line;
      const initializer = fromAttribute.getInitializer();
      if (!initializer) {
        unsupportedUsages.push({
          filePath: sourceFile.getFilePath(),
          line,
          reason: `${fromPropName} has no initializer`,
        });
        continue;
      }

      const extractedValues = extractPropValues(initializer, fromPropName);
      if (typeof extractedValues === "string") {
        unsupportedUsages.push({
          filePath: sourceFile.getFilePath(),
          line,
          reason: `${fromPropName} ${extractedValues}`,
        });
        continue;
      }

      if (
        !isSingleMatchingPropValue(extractedValues, fromPropName, fromValue)
      ) {
        continue;
      }

      const toAttribute = attributes.find(
        (attr): attr is JsxAttribute =>
          Node.isJsxAttribute(attr) &&
          attr.getNameNode().getText() === toPropName,
      );
      if (toAttribute) {
        const toInitializer = toAttribute.getInitializer();
        const toExtractedValues = toInitializer
          ? extractPropValues(toInitializer, toPropName)
          : `${toPropName} has no initializer`;

        if (
          typeof toExtractedValues === "string" ||
          !isSingleMatchingPropValue(toExtractedValues, toPropName, toValue)
        ) {
          unsupportedUsages.push({
            filePath: sourceFile.getFilePath(),
            line,
            reason: `${toPropName} already exists with a different value`,
          });
          continue;
        }

        fromAttribute.remove();
        replacedUsages += 1;
        continue;
      }

      jsxNode.addAttribute({
        name: toPropName,
        initializer: renderPropInitializer(toValue),
      });
      fromAttribute.remove();
      replacedUsages += 1;
    }
  }

  return { replacedUsages, updatedDefinition: false, unsupportedUsages };
}

function liftStaticPropValueToWrapperUsages(
  sourceFiles: SourceFile[],
  componentName: string,
  fromPropName: string,
  fromValue: PropValue,
  wrapperName: string,
): ReplacementSummary {
  const unsupportedUsages: UnsupportedUsage[] = [];
  let replacedUsages = 0;

  for (const sourceFile of sourceFiles) {
    const jsxNodes = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];

    for (const jsxNode of jsxNodes) {
      if (
        jsxNode.wasForgotten() ||
        jsxNode.getTagNameNode().getText() !== componentName
      ) {
        continue;
      }

      const fromAttribute = jsxNode
        .getAttributes()
        .find(
          (attr): attr is JsxAttribute =>
            Node.isJsxAttribute(attr) &&
            attr.getNameNode().getText() === fromPropName,
        );
      if (!fromAttribute) continue;

      const line = sourceFile.getLineAndColumnAtPos(
        fromAttribute.getStart(),
      ).line;
      const initializer = fromAttribute.getInitializer();
      if (!initializer) {
        unsupportedUsages.push({
          filePath: sourceFile.getFilePath(),
          line,
          reason: `${fromPropName} has no initializer`,
        });
        continue;
      }

      const extractedValues = extractPropValues(initializer, fromPropName);
      if (typeof extractedValues === "string") {
        unsupportedUsages.push({
          filePath: sourceFile.getFilePath(),
          line,
          reason: `${fromPropName} ${extractedValues}`,
        });
        continue;
      }

      if (
        !isSingleMatchingPropValue(extractedValues, fromPropName, fromValue)
      ) {
        continue;
      }

      fromAttribute.remove();
      const wrapperAttributeText = `${fromPropName}=${renderPropInitializer(
        fromValue,
      )}`;

      if (Node.isJsxSelfClosingElement(jsxNode)) {
        const componentText = jsxNode.getText();
        jsxNode.replaceWithText(
          `<${wrapperName} ${wrapperAttributeText}>${componentText}</${wrapperName}>`,
        );
        replacedUsages += 1;
        continue;
      }

      const jsxElement = jsxNode.getParent();
      if (!Node.isJsxElement(jsxElement)) {
        unsupportedUsages.push({
          filePath: sourceFile.getFilePath(),
          line,
          reason: `could not find full ${componentName} JSX element`,
        });
        continue;
      }

      const componentText = jsxElement.getText();
      jsxElement.replaceWithText(
        `<${wrapperName} ${wrapperAttributeText}>${componentText}</${wrapperName}>`,
      );
      replacedUsages += 1;
    }
  }

  return { replacedUsages, updatedDefinition: false, unsupportedUsages };
}

function replaceStaticPropValueDefinition(
  sourceFile: SourceFile,
  propsTypeName: string,
  fromPropName: string,
  fromValue: PropValue,
  toPropName: string,
  toValue: PropValue,
): ReplacementSummary {
  const unsupportedUsages: UnsupportedUsage[] = [];
  let updatedDefinition = false;

  convertInterfaceToTypeAlias(sourceFile, propsTypeName);

  const fromProperty = getPropsProperty(
    sourceFile,
    propsTypeName,
    fromPropName,
  );
  if (!fromProperty) {
    unsupportedUsages.push({
      filePath: sourceFile.getFilePath(),
      line: 1,
      reason: `could not find ${propsTypeName}.${fromPropName}`,
    });
  } else {
    const fromValues = getStrictPropTypeValues(fromProperty);
    if (!fromValues) {
      unsupportedUsages.push({
        filePath: sourceFile.getFilePath(),
        line: sourceFile.getLineAndColumnAtPos(fromProperty.getStart()).line,
        reason: `unsupported ${propsTypeName}.${fromPropName} type`,
      });
    } else {
      const nextFromValues = fromValues.filter(
        (value) => !isMatchingPropValue(fromPropName, value, fromValue),
      );
      if (nextFromValues.length !== fromValues.length) {
        if (nextFromValues.length === 0) {
          fromProperty.remove();
        } else {
          fromProperty.setType(createPropUnionType(nextFromValues));
        }
        updatedDefinition = true;
      }
    }
  }

  const toProperty = getPropsProperty(sourceFile, propsTypeName, toPropName);
  if (!toProperty) {
    unsupportedUsages.push({
      filePath: sourceFile.getFilePath(),
      line: 1,
      reason: `could not find ${propsTypeName}.${toPropName}`,
    });
  } else {
    const toValues = getStrictPropTypeValues(toProperty);
    if (!toValues) {
      unsupportedUsages.push({
        filePath: sourceFile.getFilePath(),
        line: sourceFile.getLineAndColumnAtPos(toProperty.getStart()).line,
        reason: `unsupported ${propsTypeName}.${toPropName} type`,
      });
    } else if (
      !toValues.some((value) => isMatchingPropValue(toPropName, value, toValue))
    ) {
      toProperty.setType(createPropUnionType([...toValues, toValue]));
      updatedDefinition = true;
    }
  }

  return { replacedUsages: 0, updatedDefinition, unsupportedUsages };
}

function removeStaticPropValueFromDefinition(
  sourceFile: SourceFile,
  propsTypeName: string,
  fromPropName: string,
  fromValue: PropValue,
): ReplacementSummary {
  const unsupportedUsages: UnsupportedUsage[] = [];
  let updatedDefinition = false;

  convertInterfaceToTypeAlias(sourceFile, propsTypeName);

  const fromProperty = getPropsProperty(
    sourceFile,
    propsTypeName,
    fromPropName,
  );
  if (!fromProperty) {
    unsupportedUsages.push({
      filePath: sourceFile.getFilePath(),
      line: 1,
      reason: `could not find ${propsTypeName}.${fromPropName}`,
    });
  } else {
    const fromValues = getStrictPropTypeValues(fromProperty);
    if (!fromValues) {
      unsupportedUsages.push({
        filePath: sourceFile.getFilePath(),
        line: sourceFile.getLineAndColumnAtPos(fromProperty.getStart()).line,
        reason: `unsupported ${propsTypeName}.${fromPropName} type`,
      });
    } else {
      const nextFromValues = fromValues.filter(
        (value) => !isMatchingPropValue(fromPropName, value, fromValue),
      );
      if (nextFromValues.length !== fromValues.length) {
        if (nextFromValues.length === 0) {
          fromProperty.remove();
        } else {
          fromProperty.setType(createPropUnionType(nextFromValues));
        }
        updatedDefinition = true;
      }
    }
  }

  return { replacedUsages: 0, updatedDefinition, unsupportedUsages };
}

function getPropsProperty(
  sourceFile: SourceFile,
  propsTypeName: string,
  propName: string,
): PropertySignature | undefined {
  const interfaceDeclaration = sourceFile.getInterface(propsTypeName);
  if (interfaceDeclaration) return interfaceDeclaration.getProperty(propName);

  const typeAliasDeclaration = sourceFile.getTypeAlias(propsTypeName);
  const typeNode = typeAliasDeclaration?.getTypeNode();
  if (typeNode && Node.isTypeLiteral(typeNode)) {
    return typeNode.getProperty(propName);
  }

  if (typeNode && Node.isIntersectionTypeNode(typeNode)) {
    return typeNode
      .getTypeNodes()
      .find((node): node is TypeLiteralNode => Node.isTypeLiteral(node))
      ?.getProperty(propName);
  }

  return undefined;
}

function getPropsProperties(
  sourceFile: SourceFile,
  propsTypeName: string,
): PropertySignature[] {
  const interfaceDeclaration = sourceFile.getInterface(propsTypeName);
  if (interfaceDeclaration) return interfaceDeclaration.getProperties();

  const typeAliasDeclaration = sourceFile.getTypeAlias(propsTypeName);
  const typeNode = typeAliasDeclaration?.getTypeNode();
  if (typeNode && Node.isTypeLiteral(typeNode)) return typeNode.getProperties();

  if (typeNode && Node.isIntersectionTypeNode(typeNode)) {
    return typeNode
      .getTypeNodes()
      .filter((node): node is TypeLiteralNode => Node.isTypeLiteral(node))
      .flatMap((node) => node.getProperties());
  }

  return [];
}

function getStrictPropTypeValues(
  property: PropertySignature,
): PropValue[] | undefined {
  const typeNode = property.getTypeNode();
  if (!typeNode) return undefined;

  const typeNodes = Node.isUnionTypeNode(typeNode)
    ? typeNode.getTypeNodes()
    : [typeNode];

  const values = typeNodes.map(getStrictPropTypeValue);
  if (values.some((value) => value === undefined)) return undefined;

  return values as PropValue[];
}

function getStrictPropTypeValue(typeNode: Node): PropValue | undefined {
  if (!Node.isLiteralTypeNode(typeNode)) return undefined;

  const literal = typeNode.getLiteral();
  if (Node.isStringLiteral(literal)) return literal.getLiteralText();
  if (Node.isNumericLiteral(literal)) return Number(literal.getText());

  return undefined;
}

function isSingleMatchingPropValue(
  extractedValues: ExtractedPropValues,
  propName: string,
  value: PropValue,
): boolean {
  if (extractedValues.kind !== "single") return false;

  return isMatchingPropValue(
    propName,
    extractedValues.variants[0].value,
    value,
  );
}

function isMatchingPropValue(
  propName: string,
  extractedValue: PropValue,
  value: PropValue,
): boolean {
  if (propName === defaultPropName) {
    return (
      typeof extractedValue === "string" &&
      typeof value === "string" &&
      joinClassValues([extractedValue]) === joinClassValues([value])
    );
  }

  return extractedValue === value;
}

function rewriteConditionalPropValue(
  attribute: JsxAttribute,
  extractedValues: Extract<ExtractedPropValues, { kind: "conditional" }>,
) {
  const renderedVariants = extractedValues.variants.map((variant) => {
    return {
      conditionText: variant.conditionText,
      text: renderPropValue(variant.value),
    };
  });
  const fallbackVariant = renderedVariants.at(-1);
  if (!fallbackVariant) return;

  const conditionalText = renderedVariants
    .slice(0, -1)
    .reduceRight(
      (fallbackText, variant) =>
        `${
          variant.conditionText ?? "true"
        } ? ${variant.text} : ${fallbackText}`,
      fallbackVariant.text,
    );
  attribute.setInitializer(`{${conditionalText}}`);
}

function ensurePropOnTypeAlias(
  typeAliasDeclaration: TypeAliasDeclaration,
  propName: string,
  type: string,
) {
  const typeNode = typeAliasDeclaration.getTypeNodeOrThrow();

  if (Node.isTypeLiteral(typeNode)) {
    ensurePropOnTypeLiteral(typeNode, propName, type);
    return;
  }

  if (Node.isIntersectionTypeNode(typeNode)) {
    const typeLiteral = typeNode
      .getTypeNodes()
      .find((node): node is TypeLiteralNode => Node.isTypeLiteral(node));

    if (typeLiteral) {
      ensurePropOnTypeLiteral(typeLiteral, propName, type);
      omitInheritedLoosePropFromIntersection(typeNode, propName);
      return;
    }
  }

  typeAliasDeclaration.setType(
    `${omitLooseProp(
      typeNode.getText(),
      propName,
    )} & { ${propName}?: ${type} }`,
  );
}

function extractInlinePropsType(
  sourceFile: SourceFile,
  componentName: string,
  propsTypeName: string,
): TypeAliasDeclaration {
  const functionDeclaration = sourceFile.getFunction(componentName);
  if (functionDeclaration) {
    const propsParameter = functionDeclaration.getParameters()[0];
    const propsType = propsParameter?.getTypeNode();
    if (!propsParameter || !propsType || !Node.isTypeLiteral(propsType)) {
      throw new Error(
        `Could not find interface ${propsTypeName}, type ${propsTypeName}, or inline object props on ${componentName}`,
      );
    }

    const statementIndex = sourceFile
      .getStatements()
      .findIndex((statement) => statement === functionDeclaration);
    if (statementIndex === -1) {
      throw new Error(`Could not find ${componentName} statement position`);
    }

    const typeAliasDeclaration = sourceFile.insertTypeAlias(statementIndex, {
      name: propsTypeName,
      type: propsType.getText(),
    });
    propsParameter.setType(propsTypeName);

    return typeAliasDeclaration;
  }

  const variableDeclaration = sourceFile.getVariableDeclaration(componentName);
  const initializer = variableDeclaration?.getInitializer();
  if (
    !variableDeclaration ||
    !initializer ||
    (!Node.isArrowFunction(initializer) &&
      !Node.isFunctionExpression(initializer))
  ) {
    throw new Error(
      `Could not find interface, type, function, or variable component ${componentName} with inline props`,
    );
  }

  const propsParameter = initializer.getParameters()[0];
  const propsType = propsParameter?.getTypeNode();
  if (!propsParameter || !propsType || !Node.isTypeLiteral(propsType)) {
    throw new Error(
      `Could not find interface ${propsTypeName}, type ${propsTypeName}, or inline object props on ${componentName}`,
    );
  }

  const variableStatement = variableDeclaration.getFirstAncestorByKindOrThrow(
    SyntaxKind.VariableStatement,
  );
  const statementIndex = sourceFile
    .getStatements()
    .findIndex((statement) => statement === variableStatement);
  if (statementIndex === -1) {
    throw new Error(`Could not find ${componentName} statement position`);
  }

  const typeAliasDeclaration = sourceFile.insertTypeAlias(statementIndex, {
    name: propsTypeName,
    type: propsType.getText(),
  });
  propsParameter.setType(propsTypeName);

  return typeAliasDeclaration;
}

function convertInterfaceToTypeAlias(
  sourceFile: SourceFile,
  propsTypeName: string,
): TypeAliasDeclaration | undefined {
  const interfaceDeclaration = sourceFile.getInterface(propsTypeName);
  if (!interfaceDeclaration) return undefined;

  const exportKeyword = interfaceDeclaration.isExported() ? "export " : "";
  const typeParameters = interfaceDeclaration
    .getTypeParameters()
    .map((typeParameter) => typeParameter.getText())
    .join(", ");
  const typeParameterText = typeParameters ? `<${typeParameters}>` : "";
  const inheritedTypes = interfaceDeclaration
    .getExtends()
    .map((heritageType) => heritageType.getText());
  const memberText = interfaceDeclaration
    .getMembers()
    .map((member) => member.getText())
    .join("\n");
  const indentedMemberText = memberText
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  const typeLiteral = `{
${indentedMemberText}
}`;
  const typeText = [...inheritedTypes, typeLiteral].join(" & ");

  interfaceDeclaration.replaceWithText(
    `${exportKeyword}type ${propsTypeName}${typeParameterText} = ${typeText};`,
  );

  return sourceFile.getTypeAliasOrThrow(propsTypeName);
}

function ensurePropOnTypeLiteral(
  declaration: TypeLiteralNode,
  propName: string,
  type: string,
) {
  const existingProperty = declaration.getProperty(propName);

  if (existingProperty) {
    existingProperty.setType(type);
    existingProperty.setHasQuestionToken(true);
    return;
  }

  declaration.insertProperty(0, {
    name: propName,
    hasQuestionToken: true,
    type,
  });
}

function omitInheritedLoosePropFromIntersection(
  typeNode: Node,
  propName: string,
) {
  if (!Node.isIntersectionTypeNode(typeNode)) return;

  for (const intersectionPart of typeNode.getTypeNodes()) {
    const text = intersectionPart.getText();
    if (!shouldOmitInheritedProp(text)) continue;

    intersectionPart.replaceWithText(omitLooseProp(text, propName));
  }
}

function omitLooseProp(text: string, propName: string): string {
  if (text.startsWith("Omit<") || !shouldOmitInheritedProp(text)) return text;

  return `Omit<${text}, ${JSON.stringify(propName)}>`;
}

function shouldOmitInheritedProp(text: string): boolean {
  return (
    text.includes("HTMLAttributes") ||
    text.includes("ComponentProps") ||
    text.includes("ComponentPropsWithoutRef") ||
    text.includes("ComponentPropsWithRef")
  );
}

function getChangedFiles(project: Project): string[] {
  return project
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isSaved())
    .map((sourceFile) => path.relative(repoRoot, sourceFile.getFilePath()))
    .sort();
}

function discoverComponentDefinitionFiles(
  project: Project,
  componentName: string,
  searchRoot: string,
): SourceFile[] {
  const resolvedSearchRoot = resolveRepoPath(searchRoot);

  return project
    .getSourceFiles()
    .filter((sourceFile) => {
      const filePath = sourceFile.getFilePath();
      return (
        isWithinPath(filePath, resolvedSearchRoot) &&
        hasComponentDefinition(sourceFile, componentName)
      );
    })
    .sort((left, right) =>
      left.getFilePath().localeCompare(right.getFilePath()),
    );
}

function hasComponentDefinition(
  sourceFile: SourceFile,
  componentName: string,
): boolean {
  return Boolean(
    sourceFile.getFunction(componentName) ??
    sourceFile.getVariableDeclaration(componentName) ??
    sourceFile.getClass(componentName),
  );
}

function isWithinPath(filePath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, filePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

async function selectComponentDefinitionFile(
  project: Project,
  componentName: string,
  searchRoot: string,
): Promise<SourceFile> {
  const candidateFiles = discoverComponentDefinitionFiles(
    project,
    componentName,
    searchRoot,
  );

  if (candidateFiles.length === 1) {
    const definitionFile = candidateFiles[0];
    console.log(
      `Auto-discovered component definition file: ${path.relative(
        repoRoot,
        definitionFile.getFilePath(),
      )}`,
    );
    return definitionFile;
  }

  const definitionFilePath =
    candidateFiles.length === 0
      ? askWithDefault(
          "Component definition file",
          getDefaultDefinitionFilePath(componentName),
        )
      : askToSelectDefinitionFilePath(candidateFiles, componentName);

  const definitionFile = await withStatus(
    "Loading component definition file",
    () =>
      project.addSourceFileAtPathIfExists(resolveRepoPath(definitionFilePath)),
  );
  if (!definitionFile) {
    throw new Error(`Could not read ${definitionFilePath}`);
  }

  return definitionFile;
}

function askToSelectDefinitionFilePath(
  candidateFiles: SourceFile[],
  componentName: string,
): string {
  console.log("\nComponent definition candidates:");
  candidateFiles.forEach((sourceFile, index) => {
    console.log(
      `${index + 1}. ${path.relative(repoRoot, sourceFile.getFilePath())}`,
    );
  });
  console.log(`${candidateFiles.length + 1}. OTHER`);

  while (true) {
    const answer = askWithDefault(
      "Select component definition file (number or other)",
      "1",
    ).toLowerCase();

    const selectedIndex = Number.parseInt(answer, 10) - 1;
    if (
      answer === otherDefinitionFileOption ||
      answer === "o" ||
      selectedIndex === candidateFiles.length
    ) {
      return askWithDefault(
        "Component definition file",
        getDefaultDefinitionFilePath(componentName),
      );
    }

    if (
      Number.isInteger(selectedIndex) &&
      selectedIndex >= 0 &&
      selectedIndex < candidateFiles.length
    ) {
      return path.relative(
        repoRoot,
        candidateFiles[selectedIndex].getFilePath(),
      );
    }

    console.log(
      `Please enter a number from 1 to ${
        candidateFiles.length + 1
      }, or ${otherDefinitionFileOption}.`,
    );
  }
}

function getDefaultDefinitionFilePath(componentName: string): string {
  return `web/src/components/ui/${toKebabCase(componentName)}.tsx`;
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function resolveRepoPath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

async function withStatus<T>(
  message: string,
  action: () => T | Promise<T>,
): Promise<T> {
  console.log(`${message}...`);
  const result = await action();
  console.log(`${message} done.`);
  return result;
}

async function askToSaveChanges(project: Project): Promise<SaveDecision> {
  printChangedFiles(project);

  while (true) {
    const answer = askWithDefault(
      "Next action: write or discard",
      "write",
    ).toLowerCase();

    if (answer === "write" || answer === "w") {
      const changedFileCount = getChangedFiles(project).length;
      await withStatus("Saving files", () => project.save());
      console.log(`Saved ${changedFileCount} file(s).`);
      return "write";
    }
    if (answer === "discard" || answer === "d") {
      console.log("No files were written.");
      return "discard";
    }

    console.log("Please enter write or discard.");
  }
}

function printChangedFiles(project: Project, heading = "\nFiles to edit:") {
  console.log(heading);
  for (const file of getChangedFiles(project)) console.log(`- ${file}`);
}

async function createComponentDoctorContext(
  settings: ComponentDoctorSettings,
): Promise<ComponentDoctorContext> {
  const { componentName, propsTypeName, usageRoot, tsConfigPath } = settings;

  const project = await withStatus(
    "Loading TypeScript project",
    () =>
      new Project({
        tsConfigFilePath: resolveRepoPath(tsConfigPath),
        manipulationSettings: { quoteKind: QuoteKind.Double },
      }),
  );

  await withStatus("Loading usage files", () => {
    project.addSourceFilesAtPaths([
      path.join(resolveRepoPath(usageRoot), "**/*.ts"),
      path.join(resolveRepoPath(usageRoot), "**/*.tsx"),
    ]);
  });

  const definitionFile = await selectComponentDefinitionFile(
    project,
    componentName,
    usageRoot,
  );

  return {
    componentName,
    propsTypeName,
    usageRoot,
    tsConfigPath,
    project,
    definitionFile,
  };
}

function askForComponentDoctorSettings(
  defaults?: Partial<ComponentDoctorSettings>,
): ComponentDoctorSettings {
  const componentName = askWithDefault(
    "Component name",
    defaults?.componentName ?? "Button",
  );
  const propsTypeName = askWithDefault(
    "Props type/interface name",
    defaults?.propsTypeName ?? `${componentName}Props`,
  );
  const usageRoot = askWithDefault(
    "Usage search root",
    defaults?.usageRoot ?? "web/src",
  );
  const tsConfigPath = askWithDefault(
    "TypeScript config path",
    defaults?.tsConfigPath ?? "web/tsconfig.json",
  );

  return { componentName, propsTypeName, usageRoot, tsConfigPath };
}

async function freezeProp(
  context: ComponentDoctorContext,
): Promise<SaveDecision | undefined> {
  const { componentName, propsTypeName, project, definitionFile } = context;
  const propName = askWithDefault("Prop name", defaultPropName);

  const { usages, unsupportedUsages } = await withStatus(
    `Collecting ${componentName} ${propName} usages`,
    () => collectPropUsages(project.getSourceFiles(), componentName, propName),
  );
  const defaultValues = collectDefaultPropValues(
    definitionFile,
    componentName,
    propName,
  );
  const values = [
    ...new Set([
      ...defaultValues.values,
      ...usages.map((usage) => usage.value),
    ]),
  ].sort((left, right) =>
    renderPropValue(left).localeCompare(renderPropValue(right)),
  );

  if (values.length === 0) {
    console.log(`No supported ${propName} usages found for ${componentName}.`);
    return undefined;
  }

  printDiscoverySummary(values, usages, [
    ...unsupportedUsages,
    ...defaultValues.unsupportedUsages,
  ]);

  if (unsupportedUsages.length + defaultValues.unsupportedUsages.length > 0) {
    if (!confirm("Continue and leave unsupported usages unchanged?")) {
      console.log("No files were written.");
      return undefined;
    }
  }

  rewriteStrictPropType(
    definitionFile,
    componentName,
    propsTypeName,
    propName,
    values,
  );
  rewriteSupportedPropExpressionUsages(
    project.getSourceFiles(),
    componentName,
    propName,
  );

  return await askToSaveChanges(project);
}

async function replacePropValue(
  context: ComponentDoctorContext,
): Promise<SaveDecision | undefined> {
  const { componentName, propsTypeName, project, definitionFile } = context;
  const propsProperties = getPropsProperties(definitionFile, propsTypeName);
  if (propsProperties.length === 0) {
    console.log(`Could not find props on ${propsTypeName}.`);
    return undefined;
  }

  const fromProperty = askToSelectProp("From prop", propsProperties);
  const fromPropName = fromProperty.getName();
  const fromValues = getStrictPropTypeValues(fromProperty);
  if (!fromValues) {
    printPropMustBeFrozen(fromPropName);
    return undefined;
  }
  const fromValue = askToSelectOption(
    `From ${fromPropName} value`,
    fromValues,
    renderPropValue,
  );

  const toProperty = askToSelectDifferentProp(
    "To prop",
    propsProperties,
    fromPropName,
  );
  const toPropName = toProperty.getName();
  const toValues = getStrictPropTypeValues(toProperty);
  if (!toValues) {
    printPropMustBeFrozen(toPropName);
    return undefined;
  }
  const toValue = askToSelectOption(
    `To ${toPropName} value`,
    toValues,
    renderPropValue,
  );

  const usageSummary = await withStatus(
    `Replacing ${componentName} ${fromPropName}=${renderPropValue(
      fromValue,
    )} with ${toPropName}=${renderPropValue(toValue)}`,
    () =>
      replaceStaticPropValueUsages(
        project.getSourceFiles(),
        componentName,
        fromPropName,
        fromValue,
        toPropName,
        toValue,
      ),
  );
  const definitionSummary = replaceStaticPropValueDefinition(
    definitionFile,
    propsTypeName,
    fromPropName,
    fromValue,
    toPropName,
    toValue,
  );
  const replacedUsages = usageSummary.replacedUsages;
  const updatedDefinition = definitionSummary.updatedDefinition;
  const unsupportedUsages = [
    ...usageSummary.unsupportedUsages,
    ...definitionSummary.unsupportedUsages,
  ];

  printReplacementSummary(replacedUsages, updatedDefinition, unsupportedUsages);

  if (replacedUsages === 0 && !updatedDefinition) return undefined;

  if (unsupportedUsages.length > 0) {
    if (!confirm("Continue and leave unsupported usages unchanged?")) {
      console.log("No files were written.");
      return "discard";
    }
  }

  return await askToSaveChanges(project);
}

async function liftPropValueToWrapper(
  context: ComponentDoctorContext,
): Promise<SaveDecision | undefined> {
  const { componentName, propsTypeName, project, definitionFile } = context;
  const propsProperties = getPropsProperties(definitionFile, propsTypeName);
  if (propsProperties.length === 0) {
    console.log(`Could not find props on ${propsTypeName}.`);
    return undefined;
  }

  const fromProperty = askToSelectProp("From prop", propsProperties);
  const fromPropName = fromProperty.getName();
  const fromValues = getStrictPropTypeValues(fromProperty);
  if (!fromValues) {
    printPropMustBeFrozen(fromPropName);
    return undefined;
  }
  const fromValue = askToSelectOption(
    `From ${fromPropName} value`,
    fromValues,
    renderPropValue,
  );
  const wrapperName = askWithDefault("Wrapper component/tag", "div");

  const usageSummary = await withStatus(
    `Lifting ${componentName} ${fromPropName}=${renderPropValue(
      fromValue,
    )} to ${wrapperName}`,
    () =>
      liftStaticPropValueToWrapperUsages(
        project.getSourceFiles(),
        componentName,
        fromPropName,
        fromValue,
        wrapperName,
      ),
  );
  const definitionSummary = removeStaticPropValueFromDefinition(
    definitionFile,
    propsTypeName,
    fromPropName,
    fromValue,
  );
  const replacedUsages = usageSummary.replacedUsages;
  const updatedDefinition = definitionSummary.updatedDefinition;
  const unsupportedUsages = [
    ...usageSummary.unsupportedUsages,
    ...definitionSummary.unsupportedUsages,
  ];

  printReplacementSummary(replacedUsages, updatedDefinition, unsupportedUsages);

  if (replacedUsages === 0 && !updatedDefinition) return undefined;

  if (unsupportedUsages.length > 0) {
    if (!confirm("Continue and leave unsupported usages unchanged?")) {
      console.log("No files were written.");
      return "discard";
    }
  }

  return await askToSaveChanges(project);
}

async function reactComponentDoctor() {
  console.log(banner);

  let settings = askForComponentDoctorSettings();
  let context = await createComponentDoctorContext(settings);

  while (true) {
    console.log(`\nComponent: ${context.componentName}`);
    const action = askToSelectOption(
      "Action",
      [
        "freeze prop",
        "replace prop value",
        "lift prop value to wrapper",
        "change component",
        "exit",
      ],
      (value) => value,
    );

    if (action === "exit") return;

    if (action === "change component") {
      settings = askForComponentDoctorSettings(settings);
      context = await createComponentDoctorContext(settings);
      continue;
    }

    const decision =
      action === "freeze prop"
        ? await freezeProp(context)
        : action === "replace prop value"
          ? await replacePropValue(context)
          : await liftPropValueToWrapper(context);

    if (decision === "discard") {
      context = await createComponentDoctorContext(settings);
    }
  }
}

async function main() {
  const [command] = Deno.args;

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    console.log(banner);
    printHelp();
    return;
  }

  if (command === reactComponentDoctorCommand) {
    await reactComponentDoctor();
    return;
  }

  console.error(`Unknown command: ${command}\n`);
  printHelp();
  Deno.exitCode = 1;
}

function printDiscoverySummary(
  values: PropValue[],
  usages: Usage[],
  unsupportedUsages: UnsupportedUsage[],
) {
  console.log("\nDiscovered values:");
  for (const value of values) console.log(`- ${renderPropValue(value)}`);

  console.log(`\nSupported usages: ${usages.length}`);

  if (unsupportedUsages.length > 0) {
    console.log("\nUnsupported usages left unchanged:");
    for (const usage of unsupportedUsages) {
      console.log(
        `- ${path.relative(
          repoRoot,
          usage.filePath,
        )}:${usage.line} ${usage.reason}`,
      );
    }
  }
}

function printReplacementSummary(
  replacedUsages: number,
  updatedDefinition: boolean,
  unsupportedUsages: UnsupportedUsage[],
) {
  console.log(`\nSupported replacements: ${replacedUsages}`);
  console.log(`Definition updated: ${updatedDefinition ? "yes" : "no"}`);

  if (unsupportedUsages.length > 0) {
    console.log("\nUnsupported usages left unchanged:");
    for (const usage of unsupportedUsages) {
      console.log(
        `- ${path.relative(
          repoRoot,
          usage.filePath,
        )}:${usage.line} ${usage.reason}`,
      );
    }
  }
}

function askToSelectProp(
  label: string,
  properties: PropertySignature[],
): PropertySignature {
  return askToSelectOption(label, getUniqueProps(properties), renderPropOption);
}

function askToSelectDifferentProp(
  label: string,
  properties: PropertySignature[],
  selectedPropName: string,
): PropertySignature {
  const options = getUniqueProps(properties).filter(
    (property) => property.getName() !== selectedPropName,
  );
  if (options.length === 0) {
    throw new Error(`No prop other than ${selectedPropName} found.`);
  }

  return askToSelectOption(label, options, renderPropOption);
}

function getUniqueProps(properties: PropertySignature[]): PropertySignature[] {
  const uniqueProperties = new Map<string, PropertySignature>();
  for (const property of properties) {
    const name = property.getName();
    if (!uniqueProperties.has(name)) uniqueProperties.set(name, property);
  }

  return [...uniqueProperties.values()].sort((left, right) =>
    left.getName().localeCompare(right.getName()),
  );
}

function renderPropOption(property: PropertySignature): string {
  return `${property.getName()}: ${
    property.getTypeNode()?.getText() ?? "unknown"
  }`;
}

function printPropMustBeFrozen(propName: string) {
  console.log(
    `${propName} is not frozen to literal values yet. Run the freeze prop action first, then retry replace prop value.`,
  );
}

function askToSelectOption<T>(
  label: string,
  options: T[],
  renderOption: (option: T) => string,
): T {
  if (options.length === 0) {
    throw new Error(`No options available for ${label}.`);
  }

  console.log(`\n${label}:`);
  options.forEach((option, index) => {
    console.log(`${index + 1}. ${renderOption(option)}`);
  });

  while (true) {
    const answer = askWithDefault(
      `Select ${label.toLowerCase()} (number)`,
      "1",
    );
    const selectedIndex = Number.parseInt(answer, 10) - 1;
    if (
      Number.isInteger(selectedIndex) &&
      selectedIndex >= 0 &&
      selectedIndex < options.length
    ) {
      return options[selectedIndex];
    }

    console.log(`Please enter a number from 1 to ${options.length}.`);
  }
}

function askWithDefault(label: string, defaultValue: string): string {
  const answer = prompt(`${label}:`, defaultValue);
  if (answer === null) {
    console.log("\nCancelled.");
    Deno.exit(130);
  }

  const trimmedAnswer = answer.trim();
  return trimmedAnswer || defaultValue;
}

if (import.meta.main) {
  await main();
}
