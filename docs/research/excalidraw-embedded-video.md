# Embedded video in Excalibur Canvas

Research date: 2026-09-12  
Scope: Excalidraw `0.18.0`, YouTube/Vimeo embeds, and direct video assets used by 21st.dev.

## Summary

Use Excalidraw's existing `embeddable` element and extend it only for direct media files. Native Excalidraw already normalizes YouTube and Vimeo share URLs, persists them as ordinary scene elements, and supplies the selection/resizing/interaction behavior. A separate video-element model or downloaded-video asset pipeline would duplicate that work.

Direct video support is required for the motivating 21st.dev workflow: its live video catalog exposes `.mp4` files from `cdn.21st.dev`, and its first-party source renders `component.video_url` with an HTML `<video>` element rather than YouTube or Vimeo. Excalidraw's built-in provider list does not recognize arbitrary `.mp4`/`.webm` files, so a small `validateEmbeddable` callback plus `renderEmbeddable` `<video>` fallback is the appropriate extension.

## Detailed findings

### Native Excalidraw path

The repository already depends on `@excalidraw/excalidraw@0.18.0`. That release's official source:

- accepts YouTube watch, short, playlist, embed, and `youtu.be` links and rewrites them to `youtube.com/embed/...`;
- accepts numeric Vimeo URLs and rewrites them to `player.vimeo.com/video/...`;
- defaults video embeds to 560×315 and preserves YouTube timestamps; and
- exposes `validateEmbeddable` and `renderEmbeddable` React props for host-specific policy and rendering.

See the pinned [`v0.18.0` embeddable implementation](https://github.com/excalidraw/excalidraw/blob/v0.18.0/packages/excalidraw/element/embeddable.ts) and [component prop types](https://github.com/excalidraw/excalidraw/blob/v0.18.0/packages/excalidraw/types.ts#L574-L584), released from commit `817d8c5` on 2025-03-11. `renderEmbeddable` is a nullable override: returning a custom node renders it, while returning `null`/`undefined` retains Excalidraw's iframe renderer ([official component source](https://github.com/excalidraw/excalidraw/blob/v0.18.0/packages/excalidraw/components/App.tsx#L1259-L1282)). This permits a `<video>` only for direct media while leaving YouTube/Vimeo behavior native.

### What 21st.dev actually serves

The current [21st.dev Videos catalog](https://21st.dev/community/components?tab=videos) contained direct URLs such as:

```text
https://cdn.21st.dev/user_aceternity/container-scroll-animation/default/video.mp4
```

That URL returned HTTP 200 with `Content-Type: video/mp4`, `Content-Length: 610571`, and byte-range support when checked on 2026-09-12. The site's first-party repository confirms the design: demo media is stored as `video.mp4` in Cloudflare R2, converted to H.264 MP4, and assigned directly to a lazily loaded `<video>` ([repository layout](https://github.com/serafimcloud/21st/blob/main/README.md#L72-L90), [card renderer](https://github.com/serafimcloud/21st/blob/main/apps/web/components/features/list-card/card-video.tsx#L110-L132), [converter](https://github.com/serafimcloud/21st/blob/main/apps/backend/src/video-converter.ts#L6-L46)).

Therefore YouTube/Vimeo-only support would miss a central real-world source. Support direct HTTPS `.mp4` and `.webm` URLs in addition to the native providers; no generic arbitrary webpage embedding is needed for this feature.

### Minimal integration

Keep Excalidraw as the source of truth:

1. Let the existing `embeddable` tool create and manipulate the element.
2. In `validateEmbeddable`, return `true` only for accepted direct HTTPS video URLs and `undefined` for everything else so Excalidraw applies its own provider allowlist.
3. In `renderEmbeddable`, return `<video controls playsInline preload="metadata">` for direct media and `null` for YouTube/Vimeo so the native iframe remains in use.
4. Do not autoplay or download the video into `scene.files`; the remote URL is sufficient.

This uses the platform player, adds no dependency, and retains Excalidraw's native interaction shell. Pathname-based extension checks still work for cache-busting query strings such as `video.mp4?v=1`.

### Persistence and export

An embeddable is a normal scene element whose original URL lives in `elements[].link`; it does not create a binary file entry. The repository's existing `onChange` → JSON save → `restore()` flow therefore persists URL, position, size, and style without database or asset changes. Provider removal, privacy changes, hotlink blocking, or a deleted remote file can still break later playback because the media is intentionally not copied locally.

Static exports cannot preserve live playback:

- Canvas/PNG export disables embed rendering and produces a placeholder.
- SVG export defaults `renderEmbeddables` to `false`, yielding a linked placeholder. Opting in creates an iframe through SVG `foreignObject`, which is network-dependent and less portable.
- Excalidraw JSON preserves the element URL and is the durable editable format.

See the official [`v0.18.0` export defaults](https://github.com/excalidraw/excalidraw/blob/v0.18.0/packages/excalidraw/scene/export.ts#L449-L465) and [SVG embed fallback](https://github.com/excalidraw/excalidraw/blob/v0.18.0/packages/excalidraw/renderer/staticSvgScene.ts#L211-L269).

### Validation, security, and privacy

- Accept only `https:` URLs without embedded credentials. For the immediate 21st.dev use case, `cdn.21st.dev` is the narrowest useful direct-media allowlist; broaden providers only when a real source requires it.
- Do not set `validateEmbeddable={true}` for arbitrary user input. Excalidraw's validator supports exact hostname lists, regexes, or a callback and otherwise falls back to its maintained allowlist.
- Keep `@excalidraw/excalidraw` at `0.17.6` or newer. Versions `>=0.16.0 <0.17.6` had a stored-XSS flaw in web embeds; the installed `0.18.0` is patched ([official advisory](https://github.com/excalidraw/excalidraw/security/advisories/GHSA-m64q-4jqh-f72f), published 2024-04-17).
- A custom direct-media renderer should use `<video>`, not an iframe, and omit `crossOrigin` unless pixels must be read; ordinary cross-origin playback does not require application access to the response.
- If CSP is added, allow native players with `frame-src https://www.youtube.com https://player.vimeo.com` and direct media with a narrow `media-src`, initially `https://cdn.21st.dev`. `frame-src` governs iframe sources ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-src), modified 2025-07-04).
- Keep `Referrer-Policy: strict-origin-when-cross-origin`. YouTube requires player client identification through `Referer` and warns that suppressing it can cause player error 153 ([YouTube minimum functionality](https://developers.google.com/youtube/terms/required-minimum-functionality), updated 2026-09-11).
- Loading any third-party player or media discloses at least the viewer's network request to that provider. Avoid autoplay and document this if the board is used in a consent-sensitive context.

### Acceptance fixture and checks

Primary direct-media fixture:

```text
https://cdn.21st.dev/user_aceternity/container-scroll-animation/default/video.mp4
```

Official provider fallback:

```text
https://www.youtube.com/watch?v=M7lc1UVf-VE
```

The YouTube URL is Google's documented IFrame API sample ([player parameters](https://developers.google.com/youtube/player_parameters), updated 2026-04-28). The provider requires a player viewport of at least 200×200 and recommends 480×270 for 16:9 video.

Browser acceptance should verify insertion, controls/playback, selection and resizing, save/reload, rejection of an invalid/non-video host, and static-export fallback. The saved scene should contain one `embeddable` link and no new binary-file entry.

## Key sources

- [Excalidraw `v0.18.0` embeddable source](https://github.com/excalidraw/excalidraw/blob/v0.18.0/packages/excalidraw/element/embeddable.ts) — 2025-03-11 release commit; authoritative behavior for the installed dependency.
- [Excalidraw component types and renderer](https://github.com/excalidraw/excalidraw/blob/v0.18.0/packages/excalidraw/types.ts#L574-L584) — official extension contracts used by the recommendation.
- [21st.dev video catalog](https://21st.dev/community/components?tab=videos) and [first-party renderer](https://github.com/serafimcloud/21st/blob/main/apps/web/components/features/list-card/card-video.tsx#L110-L132) — accessed 2026-09-12; direct evidence that the motivating source uses CDN-hosted MP4.
- [YouTube embedded-player documentation](https://developers.google.com/youtube/player_parameters) and [minimum functionality](https://developers.google.com/youtube/terms/required-minimum-functionality) — updated 2026-04-28 and 2026-09-11.
- [Vimeo player parameters](https://help.vimeo.com/hc/en-us/articles/12426260232977-About-Player-Parameters) — updated 2026-07-09; authoritative Vimeo embed behavior.

## Currency assessment

The most recent dated primary source is YouTube's minimum-functionality documentation, updated 2026-09-11. The live 21st.dev catalog and test media were checked on 2026-09-12. Provider policies, allowed hosts, and remote media availability are fast-moving; recheck them when upgrading Excalidraw or tightening CSP.

## Caveats and limitations

The 21st.dev implementation evidence is conclusive for its current catalog but does not imply that every future entry will remain MP4 or use the same CDN. Vimeo unlisted links may require an `h=` privacy hash, while Excalidraw `0.18.0`'s native normalization retains only a numeric ID; cover that only when an actual unlisted Vimeo source is needed. YouTube privacy-enhanced `youtube-nocookie.com` embeds are not in Excalidraw `0.18.0`'s built-in normalizer, so they likewise require an explicit custom path if privacy policy demands them.
