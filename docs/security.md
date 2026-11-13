# Security

The site is static HTML, CSS and JavaScript: no server code, database, accounts, forms or
cookies. Nobody can "log in" to it, so the realistic risks are (1) someone injecting script
into a page, (2) a third-party file you load being swapped for a malicious one, (3) a leaked
credential in the public repo, and (4) someone taking over the GitHub account or the host
that serves it. The site covers the first three; the fourth is account hygiene (checklist below).

## In place (November 11, 2026)

- **Content-Security-Policy on every page** (`<meta http-equiv>` in `web/index.html`,
  `web/404.html`, `web/projects/*.html`, `web/lab/*.html`: twelve pages, with the agent
  observability lab, the classifier evaluation lab, the build trace and the "How I evaluate
  agents" notes in `lab/`), set before any script:
  `default-src 'self'`; `script-src 'self'` plus a SHA-256 hash for the homepage's one inline
  script (the early tour decision, which also tells the stylesheets that scripts run, so the scripted layout applies from the first paint); `style-src`, `font-src`, `connect-src`, `manifest-src`
  `'self'` (same-origin JSON only: `lab/data/agent-traces.json`, which the agent observability page renders and the homepage's "Open the work" preview fetches lazily (when the section comes near, or at once when the build tour starts); `trace/build-trace.json`, which the homepage fetches lazily (for the same preview, when the tour plays or when the Trace panel opens) and `lab/build-trace.html` renders; and the classifier lab's `lab/data/sentiment-eval.json`, which only that page fetches); `img-src 'self' data:` (CSS masks drawn from inline SVG: the light scene's feathers and every arrow icon); `object-src`, `frame-src`,
  `worker-src`, `media-src`, `base-uri`, `form-action` all `'none'`; `upgrade-insecure-requests`.
  An injected inline script or a remote image is refused (checked in Chrome: the probe script
  did not run, and `script-src-elem` and `img-src` violations fired). The full build tour runs
  under the policy at 1280 and 390 with no violations.
  - **If you edit the inline script in `index.html`**, its hash changes: the test prints the
    expected policy, so copy the new `'sha256-…'` value into the meta.
  - Nothing is loaded from another origin: fonts are self-hosted and there is no CDN or embed.
    The one exception is cookieless page counting: `count.js` (served from this site) sends one
    request per page view to `https://cesartortolero.goatcounter.com`, which is the only remote
    origin and only in `connect-src`. It sends the path, title, referring site and screen width;
    it sets no cookies, stores nothing on the device, and counts only on cesartortolero.com and
    not in automated browsers. Keep any other origin out, or add it to the matching directive.
- **Referrer policy** `strict-origin-when-cross-origin` on every page.
- **External links** that open a new tab use `rel="noopener noreferrer"`.
- **No HTML built from data:** scripts set `innerHTML` only with fixed markup and never use
  `eval`, `new Function`, `insertAdjacentHTML` or `document.write`; text goes through
  `textContent`. The URL hash is only compared, never written into the page.
- **`/.well-known/security.txt`** (RFC 9116) with a contact and an expiry date. Renew
  `Expires` yearly; the test fails once it lapses.
- **Local dev server** (`scripts/serve.mjs`) listens on 127.0.0.1 only and refuses paths
  outside `web/`.
- **Published files:** no secrets in `web/` (pattern scan in the test) and none in the git
  history (scanned November 11, 2026: AWS, GitHub, Slack, Atlassian, OpenAI and Google key
  formats, private keys). Images carry no GPS or camera metadata; the résumé PDF's metadata is
  only "HeadlessChrome / Skia". The résumé keeps the phone number by Cesar's choice; the HTML
  has none.
- **`tests/security.test.js`** (in `npm test`) guards the policy (exact directives, inline-script hashes, placement), remote resources in HTML/CSS/JS, `noopener` links, HTML sinks, secret patterns and file names in `web/`, the phone number, and security.txt expiry. It does not cover the dev server, the git history scan or image/PDF metadata; those were checked by hand on November 11, 2026.

## Limits of a meta-tag policy

A `<meta>` CSP cannot set `frame-ancestors`, so another site could still show these pages in
a frame. For a portfolio with no buttons that change anything, that is low risk. Hosts that
allow response headers can close it. If the site moves to Cloudflare Pages or Netlify, add a
`_headers` file in `web/` like this one, keeping the same policy as the meta tag:

```
/*
  Content-Security-Policy: <same policy as the meta tag>; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()
  Strict-Transport-Security: max-age=31536000
  Cross-Origin-Opener-Policy: same-origin
```

The current host (ChatGPT Sites, `.openai/hosting.json`) serves HTTPS; whether it accepts
custom headers, serves `/.well-known/`, or rewrites HTML (which would break the script hash) is
unknown. After each publish, open the console once and `curl -I` the security.txt URL.
(`includeSubDomains` is left out of the HSTS example on purpose; add it only once every
subdomain of a custom domain serves HTTPS.)

## Cesar's checklist (accounts, not code)

1. **GitHub (KoT3sts):** turn on two-factor sign-in with a passkey or authenticator app,
   save the recovery codes, and remove personal access tokens and OAuth apps you don't use.
2. **Repository settings:** enable secret scanning with push protection and Dependabot
   alerts (free on public repos); add a branch ruleset on `main` that blocks force-pushes and
   deletion and requires a pull request.
3. **Never commit** `.env` files, tokens or any other computer's credentials; `.gitignore`
   already excludes `.env*`.
4. **Email:** the address on the site is public and will attract spam. A separate alias that
   forwards to your inbox can be retired if it gets abused.
5. **Custom domain (if you add one):** registrar account with two-factor sign-in and
   registrar lock on, so the domain can't be transferred away.

## Tooling note

Browser overlays that inject a script (the Impeccable detector overlay, bookmarklets) are now
refused by the CSP. Run them against a local copy with the meta tag removed, or use their CLI.
