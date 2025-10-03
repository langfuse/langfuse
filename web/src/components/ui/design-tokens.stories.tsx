import type { Meta, StoryObj } from "@storybook/nextjs";

/**
 * # Design Tokens
 *
 * Langfuse uses CSS custom properties (CSS variables) defined in `globals.css` for theming.
 * The design system supports automatic light/dark mode switching.
 *
 * ## Color System
 *
 * ### Semantic Colors
 * Colors are defined semantically and automatically adapt to light/dark mode:
 * - `background` / `foreground` - Base page colors
 * - `primary` / `primary-foreground` - Primary actions and emphasis
 * - `secondary` / `secondary-foreground` - Secondary UI elements
 * - `tertiary` / `tertiary-foreground` - Tertiary actions
 * - `destructive` / `destructive-foreground` - Destructive actions (delete, etc.)
 * - `muted` / `muted-foreground` - Muted backgrounds and text
 * - `accent` / `accent-foreground` - Accent highlights
 *
 * ### Component-Specific Colors
 * - `card` / `card-foreground` - Card backgrounds
 * - `popover` / `popover-foreground` - Popover backgrounds
 * - `header` / `header-foreground` - Header backgrounds
 * - `sidebar` - Sidebar with multiple variants (background, primary, accent, border, ring)
 *
 * ### Utility Colors
 * - `border` - Default border color
 * - `input` - Input border color
 * - `ring` - Focus ring color
 *
 * ### Brand Colors
 * - `primary-accent` - Langfuse brand purple
 * - `hover-primary-accent` - Hover state for brand purple
 *
 * ### Data Visualization
 * Status colors with light/dark variants:
 * - `light-red` / `dark-red` - Error states
 * - `light-yellow` / `dark-yellow` - Warning states
 * - `light-green` / `dark-green` - Success states
 * - `light-blue` / `dark-blue` - Info states
 *
 * Muted colors for secondary data visualization:
 * - `muted-green`, `muted-magenta`, `muted-blue`, `muted-gray`
 *
 * Chart colors:
 * - `chart-1` through `chart-4` - Chart series colors
 * - `chart-grid` - Chart grid lines
 *
 * ## Typography
 *
 * Custom font sizes (smaller than Tailwind defaults for compact UI):
 * - `xs`: 0.7rem
 * - `sm`: 0.825rem
 * - `base`: 0.9rem (default)
 * - `lg`: 1.1rem
 * - `xl`: 1.2rem
 * - `2xl`: 1.3rem
 * - `3xl`: 1.5rem
 *
 * Tremor-specific typography:
 * - `tremor-label`: 0.7rem - Small labels
 * - `tremor-default`: 0.825rem - Default text
 * - `tremor-title`: 0.9rem - Titles
 * - `tremor-metric`: 1.5rem - Large metrics
 *
 * ## Spacing & Layout
 *
 * ### Border Radius
 * - Base: `--radius` (0.5rem)
 * - `lg`: var(--radius)
 * - `md`: calc(var(--radius) - 2px)
 * - `sm`: calc(var(--radius) - 4px)
 *
 * Tremor variants:
 * - `tremor-small`: 0.375rem
 * - `tremor-default`: 0.5rem
 * - `tremor-full`: 9999px (fully rounded)
 *
 * ## Usage
 *
 * Colors are accessed via Tailwind utility classes:
 * ```tsx
 * <div className="bg-background text-foreground">
 * <button className="bg-primary text-primary-foreground">
 * <span className="text-muted-foreground">
 * ```
 *
 * Or via CSS variables:
 * ```css
 * background: hsl(var(--background));
 * color: hsl(var(--foreground));
 * ```
 */
const meta = {
  title: "Design/Tokens",
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ColorSwatch = ({
  name,
  variable,
}: {
  name: string;
  variable: string;
}) => (
  <div className="flex items-center gap-3 rounded border p-3">
    <div
      className="h-12 w-12 flex-shrink-0 rounded border"
      style={{ background: `hsl(var(${variable}))` }}
    />
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium">{name}</div>
      <div className="truncate font-mono text-xs text-muted-foreground">
        {variable}
      </div>
    </div>
  </div>
);

export const Colors: Story = {
  render: () => (
    <div className="space-y-8 p-8">
      <div>
        <h2 className="mb-4 text-2xl font-bold">Semantic Colors</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ColorSwatch name="Background" variable="--background" />
          <ColorSwatch name="Foreground" variable="--foreground" />
          <ColorSwatch name="Primary" variable="--primary" />
          <ColorSwatch
            name="Primary Foreground"
            variable="--primary-foreground"
          />
          <ColorSwatch name="Secondary" variable="--secondary" />
          <ColorSwatch
            name="Secondary Foreground"
            variable="--secondary-foreground"
          />
          <ColorSwatch name="Tertiary" variable="--tertiary" />
          <ColorSwatch
            name="Tertiary Foreground"
            variable="--tertiary-foreground"
          />
          <ColorSwatch name="Destructive" variable="--destructive" />
          <ColorSwatch
            name="Destructive Foreground"
            variable="--destructive-foreground"
          />
          <ColorSwatch name="Muted" variable="--muted" />
          <ColorSwatch name="Muted Foreground" variable="--muted-foreground" />
          <ColorSwatch name="Accent" variable="--accent" />
          <ColorSwatch
            name="Accent Foreground"
            variable="--accent-foreground"
          />
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-2xl font-bold">Brand Colors</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ColorSwatch name="Primary Accent" variable="--primary-accent" />
          <ColorSwatch
            name="Hover Primary Accent"
            variable="--hover-primary-accent"
          />
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-2xl font-bold">Component Colors</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ColorSwatch name="Card" variable="--card" />
          <ColorSwatch name="Card Foreground" variable="--card-foreground" />
          <ColorSwatch name="Popover" variable="--popover" />
          <ColorSwatch
            name="Popover Foreground"
            variable="--popover-foreground"
          />
          <ColorSwatch name="Header" variable="--header" />
          <ColorSwatch
            name="Header Foreground"
            variable="--header-foreground"
          />
          <ColorSwatch name="Border" variable="--border" />
          <ColorSwatch name="Input" variable="--input" />
          <ColorSwatch name="Ring" variable="--ring" />
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-2xl font-bold">Status Colors</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <ColorSwatch name="Light Red" variable="--light-red" />
          <ColorSwatch name="Dark Red" variable="--dark-red" />
          <ColorSwatch name="Light Yellow" variable="--light-yellow" />
          <ColorSwatch name="Dark Yellow" variable="--dark-yellow" />
          <ColorSwatch name="Light Green" variable="--light-green" />
          <ColorSwatch name="Dark Green" variable="--dark-green" />
          <ColorSwatch name="Light Blue" variable="--light-blue" />
          <ColorSwatch name="Dark Blue" variable="--dark-blue" />
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-2xl font-bold">Chart Colors</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ColorSwatch name="Chart 1" variable="--chart-1" />
          <ColorSwatch name="Chart 2" variable="--chart-2" />
          <ColorSwatch name="Chart 3" variable="--chart-3" />
          <ColorSwatch name="Chart 4" variable="--chart-4" />
          <ColorSwatch name="Chart Grid" variable="--chart-grid" />
        </div>
      </div>
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div className="space-y-8 p-8">
      <div>
        <h2 className="mb-4 text-2xl font-bold">Font Sizes</h2>
        <div className="space-y-4">
          <div className="flex items-baseline gap-4 border-b pb-2">
            <div className="w-32 font-mono text-sm text-muted-foreground">
              xs (0.7rem)
            </div>
            <div className="text-xs">
              The quick brown fox jumps over the lazy dog
            </div>
          </div>
          <div className="flex items-baseline gap-4 border-b pb-2">
            <div className="w-32 font-mono text-sm text-muted-foreground">
              sm (0.825rem)
            </div>
            <div className="text-sm">
              The quick brown fox jumps over the lazy dog
            </div>
          </div>
          <div className="flex items-baseline gap-4 border-b pb-2">
            <div className="w-32 font-mono text-sm text-muted-foreground">
              base (0.9rem)
            </div>
            <div className="text-base">
              The quick brown fox jumps over the lazy dog
            </div>
          </div>
          <div className="flex items-baseline gap-4 border-b pb-2">
            <div className="w-32 font-mono text-sm text-muted-foreground">
              lg (1.1rem)
            </div>
            <div className="text-lg">
              The quick brown fox jumps over the lazy dog
            </div>
          </div>
          <div className="flex items-baseline gap-4 border-b pb-2">
            <div className="w-32 font-mono text-sm text-muted-foreground">
              xl (1.2rem)
            </div>
            <div className="text-xl">
              The quick brown fox jumps over the lazy dog
            </div>
          </div>
          <div className="flex items-baseline gap-4 border-b pb-2">
            <div className="w-32 font-mono text-sm text-muted-foreground">
              2xl (1.3rem)
            </div>
            <div className="text-2xl">
              The quick brown fox jumps over the lazy dog
            </div>
          </div>
          <div className="flex items-baseline gap-4 border-b pb-2">
            <div className="w-32 font-mono text-sm text-muted-foreground">
              3xl (1.5rem)
            </div>
            <div className="text-3xl">
              The quick brown fox jumps over the lazy dog
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const Spacing: Story = {
  render: () => (
    <div className="space-y-8 p-8">
      <div>
        <h2 className="mb-4 text-2xl font-bold">Border Radius</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <div className="h-24 rounded-sm bg-primary"></div>
            <div className="text-center text-sm">sm</div>
          </div>
          <div className="space-y-2">
            <div className="h-24 rounded-md bg-primary"></div>
            <div className="text-center text-sm">md</div>
          </div>
          <div className="space-y-2">
            <div className="h-24 rounded-lg bg-primary"></div>
            <div className="text-center text-sm">lg (default)</div>
          </div>
          <div className="space-y-2">
            <div className="mx-auto h-24 w-24 rounded-full bg-primary"></div>
            <div className="text-center text-sm">full</div>
          </div>
        </div>
      </div>
    </div>
  ),
};
