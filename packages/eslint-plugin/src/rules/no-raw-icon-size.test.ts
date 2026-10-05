import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-raw-icon-size.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

ruleTester.run("no-raw-icon-size", rule, {
  valid: [
    // Icon size scale token is allowed.
    `import { Info } from "lucide-react";
     const x = <Info className="icon-base" />;`,
    `import { Info } from "lucide-react";
     const x = <Info className="icon-sm" />;`,
    `import { Info } from "lucide-react";
     const x = <Info className="icon-lg" />;`,
    `import { Info } from "lucide-react";
     const x = <Info className="icon-xl" />;`,
    // Non-numeric dimension utilities are not icon sizes.
    `import { Info } from "lucide-react";
     const x = <Info className="size-full h-auto" />;`,
    // Illustrations at 40px and above keep raw sizes.
    `import { Info } from "lucide-react";
     const x = <Info className="size-10" />;`,
    `import { Info } from "lucide-react";
     const x = <Info className="h-10 w-10" />;`,
    `import { Info } from "lucide-react";
     const x = <Info className="h-16 w-16 text-muted-foreground" />;`,
    `import { Info } from "lucide-react";
     const x = <Info className="size-[40px]" />;`,
    `import { Info } from "lucide-react";
     const x = <Info className="size-[2.5rem]" />;`,
    `import { Info } from "lucide-react";
     const x = <Info size={40} />;`,
    `import { Info } from "lucide-react";
     const x = <Info size="64" />;`,
    `const x = <div className="[&_svg]:size-10" />;`,
    // Non-lucide element with the same raw classes is not reported.
    `import { Info } from "lucide-react";
     const x = <div className="h-4 w-4" />;`,
    // className expression that is neither a literal, template literal, nor
    // a cn(...) call is left alone.
    `import { Info } from "lucide-react";
     const x = <Info className={someVar} />;`,
    // Empty expression container does not crash the rule.
    `import { Info } from "lucide-react";
     const x = <Info size={} />;`,
    `import { Info } from "lucide-react";
     const x = <Info className={} />;`,
    // A boolean className attribute (no value) is not a forbidden size.
    `import { Info } from "lucide-react";
     const x = <Info className />;`,
    // Files listed in `exceptions` are skipped entirely.
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="h-4 w-4" strokeWidth={1.5} />;`,
      filename: "src/components/legacy/Foo.tsx",
      options: [{ exceptions: ["components/legacy/"] }],
    },
    // Non-numeric size string and non-string/number size literal are not
    // on the banned list.
    `import { Info } from "lucide-react";
     const x = <Info size="1em" />;`,
    `import { Info } from "lucide-react";
     const x = <Info size={true} />;`,
    // Non-literal size expression is not a forbidden size.
    `import { Info } from "lucide-react";
     const x = <Info size={someVar} />;`,
    // An import of the same name from a different module is not a
    // lucide-react icon.
    `import { Info } from "other-icons";
     const x = <Info className="h-4 w-4" />;`,
    // A namespace import produces a JSXMemberExpression tag name, which is
    // never tracked as a lucide-react local name.
    `import * as Icons from "lucide-react";
     const x = <Icons.Info className="h-4 w-4" />;`,
    // A boolean attribute (no value) is not a forbidden size.
    `import { Info } from "lucide-react";
     const x = <Info size />;`,
    // A JSXElement attribute value is neither a literal nor an expression
    // container.
    `import { Info } from "lucide-react";
     const x = <Info className=<span /> />;`,
    `import { Info } from "lucide-react";
     const x = <Info size=<span /> />;`,
    // Indirect sizing that stays on the scale.
    `import { Info } from "lucide-react";
     const cls = "icon-base shrink-0";
     const x = <Info className={cls} />;`,
    `import { Info } from "lucide-react";
     const iconVariants = cva("icon-base", { variants: { tone: { a: "text-red" } } });
     const x = <Info className={cn(iconVariants({ tone: "a" }))} />;`,
    `const iconClassName = "icon-sm text-muted-foreground";`,
    `const x = <Foo iconClassName="icon-base" />;`,
    `const presentation = { iconClassName: "text-dark-yellow" };`,
    // Container sizes on button variants are not icon sizes.
    `const buttonVariants = cva("", { variants: { size: { icon: "h-8 w-8 [&_svg]:icon-base" } } });`,
    `const x = <button className="h-8 w-8 [&_svg:not([class*='icon-'])]:icon-base" />;`,
    `const x = <div className="[&_svg]:shrink-0 [&>svg]:size-full" />;`,
    // A variable initialised elsewhere (function, parameter) is left alone.
    `import { Info } from "lucide-react";
     function Icon({ cls }) { return <Info className={cls} />; }`,
    `import { Info } from "lucide-react";
     const cls = pick();
     const x = <Info className={cls} />;`,
    // Destructured icon class props are reads, not declarations.
    `const { iconClassName } = getPresentation();`,
    `let iconClass;`,
    // cva arrays, spreads, holes and non-string values are walked or skipped.
    `import { Info } from "lucide-react";
     const iconVariants = cva([, ...rest, "icon-base"], { variants: { tone: { a: ["text-red"] } }, defaultVariants: defaults });
     const x = <Info className={iconVariants()} />;`,
    // Non-class values and computed or numeric keys are not class holders.
    `const presentation = { iconClassName: theme.icon, [key]: "h-4 w-4", 1: "h-4 w-4" };`,
    // Calls that do not resolve to cva are left alone.
    `import { Info } from "lucide-react";
     const make = () => "icon-base";
     const x = <Info className={make()} />;`,
    `import { Info } from "lucide-react";
     const x = <Info className={clsx("h-4 w-4")} />;`,
    "const x = <div className={`[&_svg]:icon-base ${y}`} />;",
    // Cyclic consts and member-call or spread class expressions are left alone.
    `import { Info } from "lucide-react";
     const a = cn(b, "shrink-0");
     const b = cn(...rest, a);
     const x = <Info className={a} />;`,
    `import { Info } from "lucide-react";
     const x = <Info className={styles.icon()} />;`,
    `import { Info } from "lucide-react";
     const x = <Info className={props.cls} />;`,
  ],
  invalid: [
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="h-4 w-4" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="size-3.5" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info size={16} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Every raw size is off the scale, not only 12/14/16.
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="h-5 w-5" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info size={20} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="md:size-6" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Retired scale names.
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="icon-md" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Sizes below 40px are not illustrations.
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="h-9 w-9" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="size-9" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="h-px" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="size-[39px]" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="size-[2rem]" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Arbitrary values that are not a px or rem length are not on the scale.
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="size-[var(--x)]" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info size={36} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info size={39} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Raw size on one branch of a conditional or a logical expression.
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className={open ? "icon-base" : "size-3"} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className={cn("shrink-0", open && "h-4 w-4")} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Custom stroke width.
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className="icon-base" strokeWidth={1.5} />;`,
      errors: [{ messageId: "strokeWidth" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const x = <Info strokeWidth={2} />;`,
      errors: [{ messageId: "strokeWidth" }],
    },
    // Aliased import.
    {
      code: `import { Info as InfoIcon } from "lucide-react";
             const x = <InfoIcon className="w-3" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Raw size inside a cn(...) call.
    {
      code: `import { Info } from "lucide-react";
             const x = <Info className={cn("flex", "h-4 w-4")} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // String-valued size prop without braces.
    {
      code: `import { Info } from "lucide-react";
             const x = <Info size="16" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Raw size inside a template literal.
    {
      code:
        'import { Info } from "lucide-react";\n' +
        "             const x = <Info className={`flex ${y} h-4`} />;",
      errors: [{ messageId: "unexpected" }],
    },
    // Spread and namespaced attributes are skipped; the className attribute
    // after them is still checked.
    {
      code: `import { Info } from "lucide-react";
             const x = <Info {...rest} xml:lang="en" className="h-4 w-4" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Raw size reaches the icon through a const.
    {
      code: `import { Info } from "lucide-react";
             const cls = "h-3.5 w-3.5 flex-none";
             const x = <Info className={cls} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const cls = cn("shrink-0", small ? "h-3 w-3" : "icon-base");
             const x = <Info className={cls} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Raw size in a cva base or variant used on the icon.
    {
      code: `import { Info } from "lucide-react";
             const variants = cva("h-4 w-4", { variants: { tone: { a: "text-red" } } });
             const x = <Info className={cn("shrink-0", variants({ tone: "a" }))} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const variants = cva("shrink-0", { variants: { size: { sm: "size-3", md: "icon-base" } } });
             const x = <Info className={variants({ size: "sm" })} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Icon-named holders are reported once, at the declaration.
    {
      code: `import { Info } from "lucide-react";
             const iconClass = cn("shrink-0", small ? "h-3 w-3" : "h-4 w-4");
             const x = <Info className={iconClass} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const iconVariants = cva("h-4 w-4", { variants: {} });
             const x = <Info className={iconVariants()} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `import { Info } from "lucide-react";
             const variants = cva(["h-4", "w-4"]);
             const x = <Info className={variants()} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const presentation = { "iconClassName": "h-4 w-4" };`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const iconClassName = "h-4 w-4";`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const presentation = { iconClassName: "h-4 w-4 text-red" };`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const x = <Foo iconClassName="h-4 w-4" />;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const x = <Foo leftIconClassName={cn("h-4", open && "w-4")} />;`,
      errors: [{ messageId: "unexpected" }],
    },
    // Raw sizes behind an svg selector variant, in any file.
    {
      code: `const x = <button className="h-8 [&_svg]:size-4" />;`,
      errors: [{ messageId: "svgSelector" }],
    },
    {
      code: `const x = <span className="[&>svg]:h-3.5 [&>svg]:w-3.5" />;`,
      errors: [{ messageId: "svgSelector" }],
    },
    {
      code: `const buttonVariants = cva("", { variants: { size: { sm: "h-7 [&_svg:not([class*='icon-'])]:size-4" } } });`,
      errors: [{ messageId: "svgSelector" }],
    },
    {
      code: "const x = <div className={`flex [&_svg]:h-4 ${y}`} />;",
      errors: [{ messageId: "svgSelector" }],
    },
    {
      code: `const x = <div className="[&_svg]:icon-md" />;`,
      errors: [{ messageId: "svgSelector" }],
    },
  ],
});

const requireSize = [{ requireSize: true }] as const;

ruleTester.run("no-raw-icon-size requireSize", rule, {
  valid: [
    {
      code: `import { Info } from "lucide-react";
       const x = <Info className="icon-base mr-2" />;`,
      options: requireSize,
    },
    {
      code: `import { Info } from "lucide-react";
       const x = <Info className={cn("text-muted-foreground", open ? "icon-sm" : "icon-lg")} />;`,
      options: requireSize,
    },
    // Illustrations and container-driven sizes are explicit.
    {
      code: `import { Info } from "lucide-react";
       const x = <><Info className="h-12 w-12" /><Info className="size-full" /><Info size={48} /></>;`,
      options: requireSize,
    },
    // Values that cannot be resolved statically are left alone.
    {
      code: `import { Info } from "lucide-react";
       const x = <><Info className={className} /><Info {...props} /><Info className={cn("mr-2", className)} /></>;`,
      options: requireSize,
    },
    // Imported components named *Icon are not treated as icons.
    {
      code: `import { ItemTypeIcon } from "./ItemTypeIcon";
       const x = <ItemTypeIcon type="SPAN" />;`,
      options: requireSize,
    },
    {
      code: `const StatusIcon = ({ status }) => <span>{status}</span>;
       const x = <StatusIcon status="ok" />;`,
      options: requireSize,
    },
    {
      code: `const x = <SelectPrimitive.Icon asChild><span /></SelectPrimitive.Icon>;`,
      options: requireSize,
    },
    {
      code: `const Row = ({ icon: Icon }) => <Icon className="icon-base" />;`,
      options: requireSize,
    },
    // Without the option, a bare icon is allowed.
    `import { Info } from "lucide-react";
     const x = <Info />;`,
  ],
  invalid: [
    {
      code: `import { Info } from "lucide-react";
       const x = <Info />;`,
      options: requireSize,
      errors: [{ messageId: "missingSize" }],
    },
    {
      code: `import { Info } from "lucide-react";
       const x = <Info className={cn("mr-2", active && "text-primary")} />;`,
      options: requireSize,
      errors: [{ messageId: "missingSize" }],
    },
    {
      code: `import { Info } from "lucide-react";
       const x = <Info className={open ? "icon-sm" : "mr-2"} />;`,
      options: requireSize,
      errors: [{ messageId: "missingSize" }],
    },
    // Icon components passed in as props.
    {
      code: `const Row = ({ icon: Icon }) => <Icon className="shrink-0" />;`,
      options: requireSize,
      errors: [{ messageId: "missingSize" }],
    },
    {
      code: `function Badge({ trailingIcon: TrailingIcon }) { return <TrailingIcon className="size-3" />; }`,
      options: requireSize,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const x = items.map((item) => <item.icon />);`,
      options: requireSize,
      errors: [{ messageId: "missingSize" }],
    },
    {
      code: `import { SiGithub } from "react-icons/si";
       const x = <SiGithub />;`,
      options: requireSize,
      errors: [{ messageId: "missingSize" }],
    },
    // A raw size is reported once, not also as missing.
    {
      code: `import { Info } from "lucide-react";
       const x = <Info className="h-4 w-4" />;`,
      options: requireSize,
      errors: [{ messageId: "unexpected" }],
    },
  ],
});
