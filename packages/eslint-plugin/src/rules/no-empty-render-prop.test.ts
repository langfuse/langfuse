import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";

import rule from "./no-empty-render-prop.js";

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

const emptyRenderProp = { messageId: "emptyRenderProp" as const };

ruleTester.run("no-empty-render-prop", rule, {
  valid: [
    `const value = () => null;`,
    `const Component = () => <DialogController renderDialog={() => <Dialog />} />;`,
    `const Component = () => <DialogController>{() => <button type="button" />}</DialogController>;`,
    `const Component = () => <DialogController>{function render(control) { return <button type="button" onClick={control.openDialog} />; }}</DialogController>;`,
    `const Component = () => <Form onSubmit={() => null} />;`,
    `const Component = () => <Form renderItem={items[0]} />;`,
    `const Component = () => <Form>{renderNothing}</Form>;`,
    `const Component = ({ show }) => <List renderItem={() => (show ? <Row /> : null)} />;`,
    `const Component = () => <List renderItem={() => { log(); return null; }} />;`,
    `const Component = () => <List renderItem={() => { if (ready) return <Row />; return null; }} />;`,
    `const Component = () => <List renderItem={() => ready} />;`,
    `const Component = () => <List renderItem={() => "no"} />;`,
    `const Component = () => <List renderItem={() => !ready} />;`,
    `const Component = () => <List renderItem={() => false || <Row />} />;`,
    `const Component = () => <List renderItem={() => null || <Row />} />;`,
    `const Component = () => <List renderItem={() => ready && null} />;`,
    `const Component = () => <List renderItem={() => (null, <Row />)} />;`,
    `const Component = () => <Foo renderFooter />;`,
    `const Component = () => <Foo renderFooter={<Footer />} />;`,
    `const Component = () => <Foo><Bar /></Foo>;`,
    `const Component = () => <Foo>{null}</Foo>;`,
    `const Component = () => <Foo>{/* note */}</Foo>;`,
    `const Component = () => <List renderItem={() => { throw new Error("nope"); }} />;`,
    `const Component = () => <List render:item={() => null} />;`,
    `const Component = () => <Foo>{condition ? () => null : () => <Bar />}</Foo>;`,
    {
      code: `const Component = () => <Panel suffix={() => <span />} renderBody={() => null} />;`,
      options: [{ attributeNamePattern: "^suffix$" }],
    },
    {
      code: `const Component = () => <Panel children={() => <Body />} />;`,
      options: [{ attributeNamePattern: "^suffix$" }],
    },
  ],
  invalid: [
    {
      code: `const Component = () => <DialogController>{() => null}</DialogController>;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <DialogController>{() => undefined}</DialogController>;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <DialogController>{() => false}</DialogController>;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <DialogController>{() => {}}</DialogController>;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <DialogController>{() => { return null; }}</DialogController>;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <DialogController>{() => { return; }}</DialogController>;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <DialogController>{function () { return null; }}</DialogController>;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form children={() => null} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form renderFooter={() => null} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form renderFooter={() => void 0} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form renderFooter={() => (null as null)} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form renderFooter={() => null!} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form renderFooter={() => null ?? false} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form renderFooter={() => (ready ? null : undefined)} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form renderFooter={() => null && <Footer />} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form renderFooter={() => false || null} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form renderFooter={() => (0, null)} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => (
        <Form renderFooter={() => {
          if (hidden) return null;
          else return false;
        }} />
      );`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => (
        <Form renderFooter={() => {
          if (hidden) {
            return undefined;
          }
        }} />
      );`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form renderFooter={() => { ; return null; }} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Panel suffix={() => null} />;`,
      options: [{ attributeNamePattern: "^suffix$" }],
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <DialogController>{() => null}</DialogController>;`,
      options: [{ attributeNamePattern: "^suffix$" }],
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form renderFooter={() => null} />;`,
      options: [{ attributeNamePattern: "[" }],
      errors: [emptyRenderProp],
    },
  ],
});
