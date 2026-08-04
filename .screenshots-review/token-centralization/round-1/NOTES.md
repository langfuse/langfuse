# Token centralization — round 1 (uncommitted)

Two changes (approved direction: everything wired to globals.css):

1. **Weight-bound text tokens**: every `--text-*` token now carries
   `--text-*--font-weight: 400` — `text-*` alone is a complete style; heavier
   text must say `font-*` explicitly (still wins over the token). Verified:
   page title 400, buttons/chips keep explicit 500.
2. **Sidebar tint leak fixed**: `text-sidebar-foreground` (60% grey in dark)
   was painted on the whole app shell by SidebarProvider; now scoped to the
   Sidebar containers. Unstyled main-content text renders at --foreground
   (88%) instead of 60%; sidebar nav stays dim (verified 60%/88% split).

Also in this working tree: page title = text-xl weight 400 (page-header.tsx),
IBM Plex draft. "Before" = working tree before this round, not main.

Explicit-weight inventory (cleanup surface for the one-weight rule):
font-medium ×452, font-semibold ×200, font-bold ×40, font-light ×4,
font-extrabold ×2 — plus the primitives that concentrate visible weight:
button (font-medium, one definition), Dialog/Sheet/AlertDialog titles
(font-semibold), table headers + tabs (font-medium).
