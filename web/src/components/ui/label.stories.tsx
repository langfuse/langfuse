import { useForm } from "react-hook-form";
import { expect, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { Form, FormControl, FormField, FormItem, FormLabel } from "./form";
import { Input } from "./input";
import { Label } from "./label";

const meta = preview.meta({
  component: Label,
});

export const Default = meta.story({
  args: { children: "Email" },
});

/**
 * A stacked field declares the gap between its label and its control with
 * `space-y-*`, which Tailwind v4 applies as a bottom margin on every child but
 * the last. A vertical margin on an *inline* box is dropped, and `<label>` is
 * inline by default — so the label has to be block-level for the declared
 * spacing to reach the control at all. Both shapes below are load-bearing:
 * `FormLabel` covers the react-hook-form fields, and the bare `Label` covers
 * the hand-rolled stacks that do not go through `FormItem`.
 *
 * This cannot be caught by a jsdom client test: jsdom has no layout engine, so
 * it reports neither the computed `display` nor a real gap.
 */
export const StackedFieldSpacing = meta.story({
  name: "(Test) Stacked Field Spacing",
  render: () => {
    const form = useForm<{ email: string }>({ defaultValues: { email: "" } });

    return (
      <div className="w-80 space-y-8">
        <Form {...form}>
          <form>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="you@example.com" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>

        <div className="space-y-2">
          <Label htmlFor="workspace">Workspace</Label>
          <Input id="workspace" placeholder="acme" />
        </div>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const name of ["Email", "Workspace"]) {
      const label = canvas.getByText(name);
      const control = canvas.getByLabelText(name);

      expect(getComputedStyle(label).display).not.toBe("inline");

      const gap =
        control.getBoundingClientRect().top -
        label.getBoundingClientRect().bottom;
      expect(Math.round(gap)).toBe(8);
    }
  },
});
