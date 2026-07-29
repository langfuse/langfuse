# Preview PR banner strip — round 2 (restyle)

Feedback applied: removed the PR icon, removed the "Open PR" button, center-aligned
the text, and compared background colors.

1. `1-inverted-foreground.png` — original inverted bg (bg-foreground), centered, no icon/button.
2. `2-muted-blue-links.png` — bg-muted + border-b, blue links.
3. `3-violet-tint.png` — violet-100/violet-950 tint pair. **Chosen.**
4. `4-final-violet-fullpage.png` — final, light mode, full page.
5. `5-final-violet-dark.png` — final, dark mode: dim desaturated wash (bg-violet-500/10, text-violet-200) per fills-quieter-than-text; first solid violet-950 attempt was rejected as too heavy.

Links inside the strip use `text-link` (blue). PR # and author remain links.
6. `6-dark-neutral-text.png` — dark-mode text fix: body text `dark:text-foreground`
   (neutral) instead of violet-200; only the background keeps the violet tint.
