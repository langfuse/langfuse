# Preview auto-login — round 1

Branch `preview-auto-login`, dev server http://localhost:3010 (flag `NEXT_PUBLIC_PREVIEW_DEMO_AUTO_SIGN_IN=true`).

1. `1-during-auto-sign-in-spinner.png` — visiting any page while signed out shows a
   brief "Signing in as demo@langfuse.com …" spinner instead of the sign-in form.
2. `2-after-signed-in-automatically.png` — landed on Organizations with zero
   interaction. Deep links round-trip too (tested `/project/<id>` while signed out).
3. `3-opt-out-autoSignIn-false-shows-form.png` — `/auth/sign-in?autoSignIn=false`
   shows the normal form and does not auto sign-in.

Verified: lint+typecheck green, opt-out works, deep-link targetPath preserved.
