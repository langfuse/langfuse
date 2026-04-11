# React View Transitions Skill

An agent skill for implementing smooth, native-feeling animations using React's View Transition API.

## What This Skill Covers

- **`<ViewTransition>` component** — animation triggers (enter, exit, update, share), placement rules, View Transition Classes
- **`addTransitionType`** — tagging transitions for directional or context-specific animations
- **Shared element transitions** — morphing elements across different views
- **View Transition Events** — imperative JavaScript animations via the Web Animations API
- **CSS pseudo-elements** — `::view-transition-old`, `::view-transition-new`, `::view-transition-group`
- **Next.js integration** — `experimental.viewTransition`, the `transitionTypes` prop on `next/link`, App Router patterns
- **Accessibility** — `prefers-reduced-motion` handling
- **Ready-to-use CSS recipes** — fade, slide, scale, directional navigation

## Skill Structure

```
react-view-transitions/
├── SKILL.md                      # Core skill (always loaded)
├── AGENTS.md                     # Full compiled document (all references expanded)
└── references/
    ├── implementation.md         # Step-by-step implementation workflow
    ├── patterns.md               # Real-world patterns, events API, troubleshooting
    ├── nextjs.md                 # Next.js-specific patterns
    └── css-recipes.md            # Copy-paste CSS animations
```

## Installation

Install via [skills.sh](https://skills.sh):

```bash
npx skills install https://github.com/vercel-labs/react-view-transitions-skill
```

## Resources

- [React `<ViewTransition>` docs](https://react.dev/reference/react/ViewTransition)
- [React `addTransitionType` docs](https://react.dev/reference/react/addTransitionType)
- [Next.js `viewTransition` config](https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition)
- [Next.js App Router Playground (view transitions)](https://github.com/vercel/next-app-router-playground/tree/main/app/view-transitions) — Vercel's reference implementation
