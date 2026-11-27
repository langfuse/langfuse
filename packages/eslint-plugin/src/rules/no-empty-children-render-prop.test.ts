import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";

import rule from "./no-empty-children-render-prop.js";

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

ruleTester.run("no-empty-children-render-prop", rule, {
  valid: [
    `const value = () => null;`,
    `const Component = () => <DialogController renderDialog={() => <Dialog />} />;`,
    `const Component = () => <DialogController>{() => <button type="button" />}</DialogController>;`,
    `const Component = () => <DialogController>{function render(control) { return <button type="button" onClick={control.openDialog} />; }}</DialogController>;`,
    `const Component = () => <Form onSubmit={() => null} />;`,
    `const Component = () => <Form renderItem={items[0]} />;`,
    `const Component = () => <Form>{renderNothing}</Form>;`,
    `const Component = ({ show }) => <List>{() => (show ? <Row /> : null)}</List>;`,
    `const Component = () => <List>{() => { log(); return null; }}</List>;`,
    `const Component = () => <List>{() => { if (ready) return <Row />; return null; }}</List>;`,
    `const Component = () => <List>{() => ready}</List>;`,
    `const Component = () => <List>{() => "no"}</List>;`,
    `const Component = () => <List>{() => !ready}</List>;`,
    `const Component = () => <List>{() => false || <Row />}</List>;`,
    `const Component = () => <List>{() => null || <Row />}</List>;`,
    `const Component = () => <List>{() => ready && null}</List>;`,
    `const Component = () => <List>{() => (null, <Row />)}</List>;`,
    `const Component = () => <Foo renderFooter={() => null} />;`,
    `const Component = () => <Foo suffix={() => null} />;`,
    `const Component = () => <List children:item={() => null} />;`,
    `const Component = () => <Foo children="text" />;`,
    `const Component = () => <Foo children={<Body />} />;`,
    `const Component = () => <Foo><Bar /></Foo>;`,
    `const Component = () => <Foo>{null}</Foo>;`,
    `const Component = () => <Foo>{/* note */}</Foo>;`,
    `const Component = () => <List>{() => { throw new Error("nope"); }}</List>;`,
    `const Component = () => <List render:item={() => null} />;`,
    `const Component = () => <Foo>{condition ? () => null : () => <Bar />}</Foo>;`,
    `const Component = () => <Panel children={() => <Body />} />;`,
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
      code: `const Component = () => <Form children={() => void 0} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form children={() => (null as null)} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form children={() => null!} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form children={() => null ?? false} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form children={() => (ready ? null : undefined)} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form children={() => null && <Footer />} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form children={() => false || null} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form children={() => (0, null)} />;`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => (
        <Form children={() => {
          if (hidden) return null;
          else return false;
        }} />
      );`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => (
        <Form children={() => {
          if (hidden) {
            return undefined;
          }
        }} />
      );`,
      errors: [emptyRenderProp],
    },
    {
      code: `const Component = () => <Form children={() => { ; return null; }} />;`,
      errors: [emptyRenderProp],
    },
  ],
});
