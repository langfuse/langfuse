// Stand-in for web/.storybook/preview.tsx when design-sync compiles story files
// into previews (wired by .design-sync/overrides/story-imports.mjs). The stories
// use Storybook 10 CSF factories - `preview.meta({...}).story({...})` and
// `story.extend({...})` - which the converter's inert @storybook stubs can't run.
// This flattens each factory story into a plain CSF3 object (args/argTypes/
// parameters/decorators merged meta-first, render/component inherited), which is
// what the preview generator composes. The real preview's decorator chain is
// supplied separately by cfg.provider (LangfuseProvider); story-level
// `globals.theme: "dark"` is honored with a `.dark` wrapper, since globals.css
// scopes the dark tokens and the `dark:` variant to `.dark` / `.dark *`.
// `parameters.layout: "fullscreen"` drops the card's body padding on `?story=`
// captures, matching Storybook's unpadded fullscreen canvas.
import * as React from "react";

const arr = (d: unknown): any[] => (d == null ? [] : ([] as any[]).concat(d));

const preview = {
  meta(metaInput: Input) {
    // makeStory already folds these into each story; the generator would apply them again
    const { decorators: _decorators, ...metaFields } = metaInput;
    return {
      input: metaInput,
      ...metaFields,
      story: (input: Input = {}) =>
        makeStory(
          metaInput,
          typeof input === "function" ? { render: input } : input,
        ),
    };
  },
};

export default preview;

/** FullscreenFrame drops the card's body padding while a single `?story=` capture renders */
function FullscreenFrame(Story: React.ComponentType) {
  React.useLayoutEffect(() => {
    if (!isSingleStoryCapture()) return;
    const body = document.body;
    const prev = body.style.padding;
    body.style.padding = "0";
    return () => {
      body.style.padding = prev;
    };
  }, []);
  return <Story />;
}

const darkDecorator = (Story: any) => (
  <div className="dark bg-background text-foreground">
    <Story />
  </div>
);

function makeStory(meta: Input, input: Input): any {
  const m = mergeInput(meta, input);
  const story: any = {
    ...m,
    render: input.render ?? meta.render,
    component: input.component ?? meta.component,
    decorators: storyDecorators(m),
    input,
    extend: (more: Input) => makeStory(meta, mergeInput(input, more)),
  };
  story.composed = story;
  return story;
}

function mergeInput(base: Input, more: Input): Input {
  return {
    ...base,
    ...more,
    args: { ...(base.args ?? {}), ...(more.args ?? {}) },
    argTypes: { ...(base.argTypes ?? {}), ...(more.argTypes ?? {}) },
    parameters: { ...(base.parameters ?? {}), ...(more.parameters ?? {}) },
    globals: { ...(base.globals ?? {}), ...(more.globals ?? {}) },
    // Storybook composes extended decorators innermost-last; base first here
    // because the generator applies the list inner -> outer.
    decorators: [...arr(more.decorators), ...arr(base.decorators)],
    beforeEach: [...arr(base.beforeEach), ...arr(more.beforeEach)],
  };
}

/** storyDecorators appends the dark-theme, fullscreen and beforeEach wrappers a story asks for */
function storyDecorators(m: Input): any[] {
  const decorators = [...m.decorators];
  if (m.globals?.theme === "dark") decorators.push(darkDecorator);
  if (m.parameters?.layout === "fullscreen") decorators.push(FullscreenFrame);
  if (m.beforeEach.length > 0)
    decorators.push(beforeEachDecorator(m.beforeEach));
  return decorators;
}

/** beforeEachDecorator runs the meta and story `beforeEach` hooks once before the story first renders */
function beforeEachDecorator(hooks: Array<() => unknown>) {
  return function BeforeEach(Story: React.ComponentType) {
    const [cleanups] = React.useState(() => hooks.map((hook) => hook()));
    React.useEffect(() => () => cleanups.forEach(runCleanup), [cleanups]);
    return <Story />;
  };
}

/** runCleanup calls a `beforeEach` return value when it is a cleanup function */
function runCleanup(cleanup: unknown) {
  if (typeof cleanup === "function") cleanup();
}

function isSingleStoryCapture(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("story");
  } catch {
    return false;
  }
}

type Input = Record<string, any>;
