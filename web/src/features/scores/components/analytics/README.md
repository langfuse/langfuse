# Heatmap Components

Reusable heatmap visualization components for score analytics, built with pure React (no D3.js) for maintainability.

## Features

- ✅ **Pure React** - No D3.js dependency, easy to understand and modify
- ✅ **OKLCH Colors** - Perceptually uniform color scales aligned with dashboard theme
- ✅ **Responsive** - Works on mobile, tablet, and desktop
- ✅ **Accessible** - Keyboard navigation, ARIA labels, screen reader support
- ✅ **Flexible** - Supports numeric heatmaps and confusion matrices
- ✅ **Tooltips** - Built-in Radix UI tooltips
- ✅ **TypeScript** - Fully typed with strict interfaces

## Components

### `<Heatmap>`

Main heatmap component that renders a grid of cells with optional labels and tooltips.

### `<HeatmapLegend>`

Color scale legend showing the mapping from values to colors.

### `<HeatmapCellComponent>`

Individual cell component (used internally by Heatmap).

## Usage

### Numeric Heatmap (Score Comparison)

```tsx
import { Heatmap, HeatmapLegend } from '@/src/features/scores/components/analytics';
import {
  generateNumericHeatmapData,
  fillMissingBins,
} from '@/src/features/scores/lib/heatmap-utils';

// From ClickHouse query
const clickhouseResults = [
  { bin_x: 0, bin_y: 0, count: 45, min1: 0, max1: 1, min2: 0, max2: 1 },
  { bin_x: 0, bin_y: 1, count: 12, min1: 0, max1: 1, min2: 0, max2: 1 },
  // ...
];

// Preprocess data
const { cells, rowLabels, colLabels } = generateNumericHeatmapData({
  data: clickhouseResults,
  nBins: 10,
  colorVariant: 'chart1', // Use chart1 for first score
  showPercentages: false,
  showCounts: true,
});

// Render
<div>
  <Heatmap
    data={cells}
    rows={10}
    cols={10}
    rowLabels={rowLabels}
    colLabels={colLabels}
    xAxisLabel="Score 2: factuality (ANNOTATION)"
    yAxisLabel="Score 1: factuality (API)"
    renderTooltip={(cell) => (
      <div className="space-y-1">
        <p className="font-semibold">Count: {cell.value}</p>
        <p className="text-xs">
          Score 1: {cell.metadata.yRange[0].toFixed(2)} - {cell.metadata.yRange[1].toFixed(2)}
        </p>
        <p className="text-xs">
          Score 2: {cell.metadata.xRange[0].toFixed(2)} - {cell.metadata.xRange[1].toFixed(2)}
        </p>
        <p className="text-xs">
          {cell.metadata.percentage.toFixed(1)}% of total
        </p>
      </div>
    )}
    onCellClick={(cell) => {
      console.log('Navigate to traces with scores in this bin', cell);
    }}
  />

  <HeatmapLegend
    min={0}
    max={Math.max(...cells.map(c => c.value))}
    variant="chart1"
    title="Count"
  />
</div>
```

### Confusion Matrix (Categorical Scores)

```tsx
import { Heatmap } from '@/src/features/scores/components/analytics';
import { generateConfusionMatrixData } from '@/src/features/scores/lib/heatmap-utils';

// From ClickHouse query
const confusionData = [
  { row_category: 'good', col_category: 'good', count: 450 },
  { row_category: 'good', col_category: 'bad', count: 50 },
  { row_category: 'bad', col_category: 'good', count: 30 },
  { row_category: 'bad', col_category: 'bad', count: 470 },
];

// Preprocess
const { cells, rowLabels, colLabels, rows, cols } = generateConfusionMatrixData({
  data: confusionData,
  colorVariant: 'chart2', // Use chart2 for second score
  highlightDiagonal: true, // Emphasize agreement cells
  showPercentages: true,
  showCounts: true,
});

// Render
<Heatmap
  data={cells}
  rows={rows}
  cols={cols}
  rowLabels={rowLabels}
  colLabels={colLabels}
  xAxisLabel="Score 2 (Human)"
  yAxisLabel="Score 1 (LLM)"
  renderTooltip={(cell) => (
    <div>
      <p className="font-semibold">
        {cell.metadata.rowCategory} → {cell.metadata.colCategory}
      </p>
      <p>Count: {cell.value} ({cell.metadata.percentage.toFixed(1)}%)</p>
      {cell.metadata.isDiagonal && <p className="text-xs">✓ Agreement</p>}
    </div>
  )}
/>
```

### Comparing Two Scores (Use Different Colors)

When comparing two different score types, use different color variants:

```tsx
// Score 1 heatmap
<Heatmap
  data={score1Cells}
  colorVariant="chart1"  // Orange-ish
  // ...
/>

// Score 2 heatmap
<Heatmap
  data={score2Cells}
  colorVariant="chart2"  // Magenta-ish
  // ...
/>
```

Available color variants: `chart1`, `chart2`, `chart3`, `chart4`, `chart5`

## Color System

The heatmap uses **OKLCH color space** for perceptually uniform color gradients:

- **Mono-color scale**: Each heatmap uses a single hue with varying lightness
- **Aligned with dashboard**: Colors match the existing chart colors in global.css
- **Multiple variants**: 5 color variants available for comparing multiple scores
- **Accessible contrast**: Automatic black/white text color based on background lightness

### Color Variants

- `chart1`: Orange-ish (oklch(66.2% 0.225 25.9))
- `chart2`: Magenta-ish (oklch(60.4% 0.26 302))
- `chart3`: Blue-ish (oklch(69.6% 0.165 251))
- `chart4`: Light blue-ish (oklch(80.2% 0.134 225))
- `chart5`: Green-ish (oklch(90.7% 0.231 133))

## Utilities

### `generateNumericHeatmapData()`

Converts ClickHouse binned data into heatmap cells for numeric scores.

**Parameters:**
- `data`: Array of bin objects from ClickHouse
- `nBins`: Number of bins (usually 10)
- `colorVariant`: Which color scale to use
- `showPercentages`: Show percentage in cells
- `showCounts`: Show count in cells

**Returns:** `{ cells, rowLabels, colLabels }`

### `generateConfusionMatrixData()`

Converts categorical data into confusion matrix cells.

**Parameters:**
- `data`: Array of category pairs with counts
- `colorVariant`: Which color scale to use
- `highlightDiagonal`: Use different color for diagonal (agreement)
- `showPercentages`: Show percentage in cells
- `showCounts`: Show count in cells

**Returns:** `{ cells, rowLabels, colLabels, rows, cols }`

### `fillMissingBins()`

Fills in bins with zero count (in case ClickHouse omits them).

## Accessibility

- ✅ **Keyboard navigation**: Tab through cells, Enter/Space to click
- ✅ **Screen readers**: ARIA labels on all interactive elements
- ✅ **Focus indicators**: Visible focus ring with focus-visible
- ✅ **Color contrast**: Automatic text color based on background
- ✅ **Semantic HTML**: Proper roles (grid, button) and labels

## Performance

- **10×10 grid (100 cells)**: Instant rendering (<16ms)
- **20×20 grid (400 cells)**: Fast (<50ms)
- **Optimizations**: useMemo for cell lookup map, efficient CSS Grid layout

For larger grids, consider:
- Virtual scrolling
- Pagination
- Aggregation/downsampling

## Responsive Design

- **Mobile (<640px)**: Min 24px cells, horizontal scroll, compact labels
- **Tablet (640-1024px)**: Moderate sizing, readable labels
- **Desktop (>1024px)**: Full size cells (up to 600px container width)

## Browser Support

Works in all modern browsers that support:
- CSS Grid
- CSS Custom Properties (for OKLCH colors)
- ES2020+

## Testing

Unit tests are located in:
- `web/src/__tests__/heatmap-utils.test.ts` (utilities)
- `web/src/__tests__/Heatmap.test.tsx` (components)

Run tests:
```bash
pnpm --filter=web run test -- --testPathPattern="heatmap"
```

## Future Enhancements (Out of Scope for MVP)

- ❌ Arrow key navigation between cells
- ❌ Zoom/pan for large grids
- ❌ Export as image
- ❌ Animated transitions
- ❌ Cell annotations/icons
- ❌ Mini-map for navigation
