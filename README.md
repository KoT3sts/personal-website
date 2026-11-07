# Cesar Tortolero — Personal Website

Cesar Tortolero's personal website: code, curiosity, and selected projects.

Full name: Cesar Alejandro Tortolero Trujillo. Preferred short/display name: Cesar Tortolero.

Status: first working version deployed privately and checked.

**Ultimate goal: make the site look and move like the supplied reference video.** The current version is a functional draft; visual parity is not complete. See [SPECIFICATION.md](SPECIFICATION.md) for the authoritative target, scene requirements, current gaps, assets, and acceptance checklist.

[Open the owner-private preview](https://cesar-tortolero.cesartortolero.chatgpt.site). Sign in with the owning ChatGPT account if prompted.

## Project brief

Create a personal website using the supplied visual reference and the owner's background. The owner will provide more details after repository creation.

- [Project brief](docs/project-brief.md)
- [Website specification and visual target](SPECIFICATION.md)
- [Visual reference](docs/reference.md)
- [Current handoff](HANDOFF.md)

## Run locally

Use Node.js 20 or newer. Runtime assets have no third-party dependencies; JSDOM is a development-only test dependency.

```sh
npm ci
npm run dev
npm test
npm run check
npm run build
```

Open the printed local URL. Source lives in `web/`; the build copies it into `dist/`. Sites hosting configuration is in `.openai/hosting.json`.

The design includes original SVG artwork, a draggable perspective gallery with keyboard and button controls, project dialogs, reduced motion support, and inline fallbacks. Project covers are illustrations; biography and copy remain open to owner review.

## Collaborating

This repository is public. The current website implementation is on [`feat/reference-portfolio`](https://github.com/KoT3sts/personal-website/tree/feat/reference-portfolio), with [draft PR #1](https://github.com/KoT3sts/personal-website/pull/1) open against main.

Other accounts can fork the repository and propose changes. Until the initial PR is merged, base website improvements on `feat/reference-portfolio`. The hosted preview requires the owner's ChatGPT account.
