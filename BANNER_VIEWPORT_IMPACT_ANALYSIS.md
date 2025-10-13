# Banner Implementation - Viewport Height Impact Analysis

> **Context**: Analysis performed for LFE-7148 - In-app notification for overdue subscription
>
> **Date**: 2025-10-10
>
> **Purpose**: Identify all components using viewport height units that will be affected by adding a banner at the top of the application

## Executive Summary

Adding a banner at the top of the application will primarily affect components using `h-screen`, `h-dvh`, `h-[100vh]` and similar viewport-relative height units. The main impact is in the **root layout component** which uses `h-dvh` for the main content area.

## Search Patterns Used

```bash
# Tailwind classes
h-screen
h-dvh
h-lvh
h-[100vh]
h-[100dvh]
min-h-screen
max-h-screen
max-h-[100vh]

# CSS properties
height: 100vh;

# Calculations
calc(.*vh)

# Fixed positioning (for overlays)
fixed inset-0
```

## Components Analysis

### 🔴 Critical - Must Fix (High Priority)

#### 1. Main Layout (`/web/src/components/layouts/layout.tsx`)

**Lines affected**: 306, 349

```tsx
// Line 306 - Unauthenticated pages
<main className="h-dvh w-full bg-primary-foreground p-3 px-4 py-4 sm:px-6 lg:px-8">

// Line 349 - Main authenticated content area
<SidebarInset className="h-dvh max-w-full md:peer-data-[state=collapsed]:w-[calc(100vw-var(--sidebar-width-icon))] md:peer-data-[state=expanded]:w-[calc(100vw-var(--sidebar-width))]">
```

**Current behavior**: Takes full dynamic viewport height (100dvh)

**With banner**: Would overflow by banner height, causing vertical scrollbar on body or content extending below viewport

**Fix required**:
- Wrap entire layout in flex container with `flex flex-col h-screen` or `h-dvh`
- Banner gets `flex-shrink-0`
- Main content area gets `flex-1 overflow-auto` instead of `h-dvh`

**Impact**: **CRITICAL** - This is the root layout wrapper for ALL authenticated pages

---

### 🟡 Medium Priority - Should Fix

#### 2. SupportDrawer (`/web/src/features/support-chat/SupportDrawer.tsx`)

**Line affected**: 36

```tsx
<div
  className={cn([
    "flex h-dvh w-full min-w-0 flex-col bg-background",
    className,
  ])}
>
```

**Current behavior**: Support drawer takes full viewport height

**With banner**: Would extend beyond visible area by banner height

**Fix required**: Change `h-dvh` → `h-full` (inherit height from flex parent)

**Impact**: **MEDIUM** - Side panel would overflow

---

#### 3. ErrorPage (`/web/src/components/error-page.tsx`)

**Line affected**: 31

```tsx
<div className="flex h-screen flex-col items-center justify-center">
```

**Current behavior**: Error page centers content in full viewport height

**With banner**: Error content would be centered in full viewport, potentially overlapping with banner or extending beyond visible area

**Fix options**:
- Option A: Change `h-screen` → `h-full` for consistency with flex layout
- Option B: Keep `h-screen` if you want errors to always center in full viewport (even with banner visible)

**Impact**: **MEDIUM** - User experience consideration for error states

---

#### 4. Models Settings Page (`/web/src/pages/project/[projectId]/settings/models/[modelId].tsx`)

**Line affected**: 196

```tsx
<div className="flex max-h-[calc(100vh-20rem)] flex-col">
```

**Current behavior**: Limits height to viewport minus 20rem (assuming header/padding)

**With banner**: Calculation doesn't account for banner height

**Fix required**:
- Review if this calculation needs banner height subtracted: `max-h-[calc(100vh-20rem-var(--banner-height))]`
- OR switch to flex-based sizing if possible

**Impact**: **MEDIUM** - Content area may be larger than intended

---

#### 5. Sidebar Component (`/web/src/components/ui/sidebar.tsx`)

**Line affected**: 337

```tsx
"peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))]"
```

**Current behavior**: Sets minimum height based on small viewport height

**With banner**: Calculation doesn't account for banner

**Fix required**: Review if banner height needs to be considered in calculation

**Impact**: **LOW-MEDIUM** - May cause slight layout issues with inset variant

---

#### 6. UpsertModelFormDrawer (`/web/src/features/models/components/UpsertModelFormDrawer.tsx`)

**Line affected**: 226

```tsx
<form className="flex h-full max-h-[100vh] flex-col gap-6 overflow-y-auto p-4 pt-0">
```

**Current behavior**: Form limited to viewport height

**With banner**: Inside a Drawer component which uses fixed positioning

**Fix required**: **NONE** - Fixed positioning is independent of layout flow

**Impact**: **NONE** - This is inside a fixed-position drawer overlay

---

### 🟢 Low/No Impact - No Changes Needed

#### 7. Dialog Component (`/web/src/components/ui/dialog.tsx`)

**Lines**: 25, 38-40

```tsx
// Overlay
className="fixed inset-0 z-50 bg-foreground/40"

// Content variants
size: {
  default: "max-w-lg max-h-[85vh]",
  lg: "max-w-4xl max-h-[85vh]",
  xl: "max-w-7xl h-[90vh]",
}
```

**Impact**: **NONE** - Fixed positioning covers entire viewport (including banner)
**Behavior**: Will correctly overlay banner (intended behavior for modals)

---

#### 8. Sheet Component (`/web/src/components/ui/sheet.tsx`)

**Line**: 24, 41-43

```tsx
className="fixed inset-0 z-50 bg-black/80"

left: "inset-y-0 left-0 h-full w-3/4"
right: "inset-y-0 right-0 h-full w-3/4"
```

**Impact**: **NONE** - Fixed positioning independent of layout

---

#### 9. Drawer Component (`/web/src/components/ui/drawer.tsx`)

**Line**: 89, 27

```tsx
className="fixed inset-0 z-50 bg-primary/20"

"fixed inset-x-0 z-50 flex h-auto flex-col rounded-t-lg border bg-background md:inset-x-auto md:right-0"
```

**Impact**: **NONE** - Fixed positioning independent of layout

---

#### 10. NewDatasetItemFromExistingObject (`/web/src/features/datasets/components/NewDatasetItemFromExistingObject.tsx`)

**Line**: 158

```tsx
<DialogContent className="h-[calc(100vh-5rem)] max-h-none w-[calc(100vw-5rem)] max-w-none">
```

**Impact**: **NONE** - Inside Dialog with fixed positioning

---

#### 11. Onboarding Components (9 files in `/web/src/components/onboarding/`)

All use `SplashScreen` component which doesn't use viewport heights directly.

**Files**:
- AnnotationQueuesOnboarding.tsx
- DatasetItemsOnboarding.tsx
- DatasetsOnboarding.tsx
- EvaluatorsOnboarding.tsx
- PromptsOnboarding.tsx
- ScoresOnboarding.tsx
- SessionsOnboarding.tsx
- TracesOnboarding.tsx
- UsersOnboarding.tsx

**Impact**: **NONE** - Renders with scrollable content, no viewport height dependencies

---

## Implementation Plan

### Phase 1: Core Layout Changes (Critical)

**File**: `/web/src/components/layouts/layout.tsx`

1. Add banner component at the root level
2. Wrap content in flex container
3. Update height classes:

```tsx
// Before
<SidebarInset className="h-dvh max-w-full ...">

// After
<div className="flex flex-col h-dvh">
  <PaymentBanner /> {/* flex-shrink-0 */}
  <SidebarInset className="flex-1 overflow-auto max-w-full ...">
</div>
```

**OR** implement in `_app.tsx`:

```tsx
// In _app.tsx Layout wrapper
<div className="flex flex-col h-screen">
  <PaymentBanner />
  <div className="flex-1 overflow-auto">
    <Layout>
      <Component {...pageProps} />
    </Layout>
  </div>
</div>
```

### Phase 2: Component Updates (Medium Priority)

1. **SupportDrawer.tsx** (Line 36):
   ```tsx
   // Before: "flex h-dvh w-full min-w-0 flex-col bg-background"
   // After:  "flex h-full w-full min-w-0 flex-col bg-background"
   ```

2. **error-page.tsx** (Line 31):
   ```tsx
   // Option A: "flex h-full flex-col items-center justify-center"
   // Option B: Keep "flex h-screen flex-col items-center justify-center"
   ```

3. **Models Settings Page** (Line 196):
   - Review calculation: `max-h-[calc(100vh-20rem)]`
   - Test if banner causes overflow
   - Adjust if needed

4. **Sidebar Component** (Line 337):
   - Review: `min-h-[calc(100svh-theme(spacing.4))]`
   - Test with banner
   - Adjust if needed

### Phase 3: Testing Checklist

- [ ] Authenticated pages render correctly with banner
- [ ] Unauthenticated pages render correctly (no banner)
- [ ] Support drawer height is correct
- [ ] Error pages display correctly
- [ ] All modal/dialog components overlay correctly (including banner)
- [ ] Sheet components work correctly
- [ ] Drawer components work correctly
- [ ] Onboarding flows work correctly
- [ ] Models settings page scrolling works correctly
- [ ] Sidebar variant heights are correct
- [ ] Mobile responsive behavior
- [ ] Banner dismiss/show transitions don't break layout
- [ ] Different banner heights (if variable) don't break layout

## Key Decisions Needed

1. **Where to implement flex wrapper?**
   - Option A: In `layout.tsx` (Lines 335-356)
   - Option B: In `_app.tsx` wrapping `<Layout>`
   - **Recommendation**: `layout.tsx` for better encapsulation

2. **Error page behavior?**
   - Option A: Change to `h-full` (respects banner, centers within available space)
   - Option B: Keep `h-screen` (ignores banner, centers in full viewport)
   - **Recommendation**: Option A for consistency

3. **Banner height handling?**
   - Option A: Fixed height (simpler)
   - Option B: CSS custom property `--banner-height` (more flexible)
   - **Recommendation**: Start with fixed, add CSS var if needed

## Notes for Implementation

- All fixed-position overlays (Dialog, Sheet, Drawer) will automatically cover the banner too - this is intended behavior
- The `h-dvh` class uses dynamic viewport height which accounts for mobile browser chrome, keep using it for the wrapper
- Test thoroughly on mobile devices as viewport height behavior differs
- Consider adding a CSS custom property for banner height if calculations are needed elsewhere
- The SupportDrawer uses ResizablePanel which should handle the height change gracefully

## Related Linear Ticket

**LFE-7148**: In-app notification for overdue subscription

Original plan includes:
- Store `subscriptionStatus` in `cloudConfig.stripe`
- Update webhooks to track status
- Create `PaymentBanner` component
- Add tRPC endpoint `getPaymentStatus`
- Show banner globally (not just billing settings)
- Banner dismissible for 24h via localStorage
