# Cesar Tortolero's personal website

## Intent

Build the personal website now, as requested on November 7, using the supplied Instagram reel. The owner confirmed the display name Cesar. This document records implementation choices made to fulfill that request.

## Observed reference

The public Instagram embed exposed a 28.907-second reel by echo__builds. The downloaded video was sampled at three-second intervals and inspected. It shows a glowing orbital intro, oversized black typography on warm off-white, pill navigation, a centered monochrome portrait, dark atmospheric sections, perspective project galleries, a circular work selector, and a large dark contact footer. Treat these as visual inspiration. Do not reuse its portrait, branding, or project imagery.

## Result

A complete responsive portfolio with hero, about, selected work, working approach, and contact sections. Original SVG artwork replaces the missing personal portrait. Three source-backed project descriptions cover Barking Village, Work Helper, and VoiceLab. Project detail dialogs explain each project without private operational information. Contact links to the confirmed GitHub profile KoT3sts; no invented email, employment, degree, dates, client statistics, or availability claim.

## Approach

Use static HTML, CSS, and JavaScript modules. This presentation site does not need a backend. A framework would add dependencies without changing the visitor experience; a video recreation would prevent visitors from exploring real content. Use an original SVG sculpture, CSS perspective transforms, and a keyboard-, touch-, and button-operated gallery. Keep all content readable without JavaScript. Reduced motion removes nonessential motion and drag is never the only navigation method.

## Constraints and defaults

- Display name: Cesar Tortolero. Full name: Cesar Alejandro Tortolero Trujillo.
- Warm paper (#eeede8), ink (#171716), and deep charcoal (#101114); restrained muted green accents.
- Static source in web/, built output in dist/.
- Maintain the private GitHub repository and publish an owner-private Sites preview.
- Decorative assets are original code-native SVGs; borrowed video and downloaded metadata stay outside the repository.
- Mobile navigation, focus behavior, overflow, and reduced motion must be checked.
- Public biography and a portrait can be added after owner review; the deployed draft remains private.
