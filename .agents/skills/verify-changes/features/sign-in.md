# Sign in

Sign in lets the seeded demo user open the organizations home with an email
and password.

## Sub-features

- `sign-in-form` shows the credentials form to a signed-out visitor.
- `sign-in-submit` accepts the seeded password and lands on the home page.
- `sign-in-reject` keeps an unknown password on the sign-in form and shows
  an error.

## How to get to it (user POV)

- Open `http://127.0.0.1:3000/`. A signed-out visit redirects to
  `/auth/sign-in`.
- Open `http://127.0.0.1:3000/auth/sign-in` directly.
- Use the account button named `Demo User`, then `Sign Out`, to return to
  the form from an existing session.

## Driving it with the Langfuse harness

Preconditions:

- `scripts/doctor.sh` exited 0.
- The database was seeded, so `demo@langfuse.com` exists.
- The browser context is signed out. If the account button is already
  visible, sign out first.

- **Open the form.** Go to `http://127.0.0.1:3000/auth/sign-in`. The page
  shows an email field `input[name="email"]` and a button
  `data-testid="submit-email-password-sign-in-form"`.
- **Enter credentials.** Fill the email with `demo@langfuse.com` and the
  password field `input[type="password"]` with `password`. When no SSO
  provider is configured the password field is already on the page. When
  the button reads `Continue`, click it once and wait for the password
  field, then fill it. The button stays disabled until React has seen both
  fields after hydration. Retry both fills until the button is enabled.
- **Submit.** Click `data-testid="submit-email-password-sign-in-form"`.
  The URL becomes `/`. The page shows `Seed Org` and the project `llm-app`,
  and the account button reads `Demo User`.
- **Reject a bad password.** From a signed-out form, submit
  `demo@langfuse.com` / `not-the-password`. The URL stays on
  `/auth/sign-in` and a form error is visible in `.text-destructive` that
  is not a `label`.
- **Proof.** Screenshot the home page after the successful submit. The
  artifact shows `Seed Org` and `llm-app`.

## Gotchas

- Fills typed into the server-rendered form before hydration never reach
  React Hook Form. The button stays disabled. Retry the fills.
- A rejected sign-in stays on the same URL as a slow one. Read the form
  error instead of waiting only for navigation.
- `.text-destructive` also matches invalid field labels. Exclude `label`
  or the error text collapses to `Email`.
- Local and Cloud dev have no SSO provider, so the password field is
  present immediately. Do not click `Continue` unless that field is absent.
