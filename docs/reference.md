# Visual reference

- Supplied URL: https://www.instagram.com/reel/DexTHhNTeh0/?srtk=cThxdmZnYXFtY25m
- Canonical URL: https://www.instagram.com/reel/DexTHhNTeh0/
- Added: November 7, 2026.
- Purpose: ultimate visual and motion target for the personal website. See [SPECIFICATION.md](../SPECIFICATION.md).

## Inspection status

Inspected on November 7, 2026. Normal retrieval and Firecrawl were unavailable, but the public Instagram embed at https://www.instagram.com/reel/DexTHhNTeh0/embed/captioned/ exposed video metadata. The 28.907-second video was downloaded into workspace temporary storage and visually sampled at three-second intervals. Creator: echo__builds.

Observed: a glowing orbital intro, oversized black typography, warm off-white backgrounds, pill navigation, a central monochrome portrait, dark atmospheric panels, perspective galleries, a circular project selector, and a large dark contact footer.

Adaptation: original SVG sculpture and project illustrations, warm paper/charcoal sections, a perspective gallery, project detail dialogs, and a large contact close. The reference portrait, brand, project images, and source code were not reused. Downloaded video, metadata, and temporary image-processing dependencies are not repository assets.

The adaptation above describes the first draft, not final acceptance. The owner subsequently clarified that matching the video is the ultimate goal. Additional frames at 1.0, 2.0, 4.5, 7.5, 10.5, 16.5, 20.5, and 26.5 seconds were inspected to write the specification. Exact code, assets, fonts, animation drivers, and original mobile behavior remain unknown.

## Reproducing reference checkpoints on another account

1. Open the canonical reel or public embed above. Obtain an accessible video copy through the public media response or an owner-supplied download/screen recording. Do not store login information or expiring signed media URLs in the repository.
2. Keep the reference file in local temporary storage, outside production assets. The inspected copy was 28.907 seconds and 2,796,305 bytes; its SHA-256 was `b85bf98f2085a8f99a767edbcecc564d5e1c2aac1cc350ecc1a9d0f1697e253f`. A different transcode or screen recording may have a different checksum or timestamp offset.
3. With FFmpeg installed, extract native-resolution stills using the command below, repeating for the timestamp table in SPECIFICATION.md. Preserve aspect ratio; replace the output name for each scene.

```sh
ffmpeg -ss 2.0 -i reference.mp4 -frames:v 1 hero-reference.png
ffmpeg -ss 16.5 -i reference.mp4 -frames:v 1 ribbon-reference.png
ffmpeg -ss 20.5 -i reference.mp4 -frames:v 1 work-explorer-reference.png
```

4. Crop to the website viewport, excluding the laptop, browser chrome, and reel caption. Keep an uncropped original for provenance. Compare normalized website crops, and record any perspective correction or recording offset.
5. If Instagram or the media response is unavailable, request the reel/screen recording or checkpoint screenshots from Cesar. Use the storyboard in SPECIFICATION.md to organize the work, but mark visual verification blocked until the relevant scenes can actually be compared. Temporary files on the original developer's computer are not a portable dependency.

Do not republish the full reel as a website asset. Any durable comparison images committed for review must have appropriate usage rights, source attribution, scene/timestamp labels, and no private data.
