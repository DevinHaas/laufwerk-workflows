# Local canvas research

Research date: 2026-09-12

## Recommendation

Start with **Obsidian Canvas** if the inspiration folder, filenames, notes,
tags, and later searching matter. Put the generated `inspiration/` folder in
an Obsidian vault and create a canvas for each research session.

Choose **PureRef** instead if the priority is the fastest possible drag/paste
moodboard beside creative software. Choose **tldraw** only if we want to
build and maintain a custom self-hosted web application.

## Comparison

| Tool | Local | Image workflow | Search | Self-hosting | Fit |
|---|---|---|---|---|---|
| [PureRef](https://pureref.com/) | Portable `.pur` boards; can link or embed images | Excellent clipboard, drag/drop, URLs, and file picker | Limited | No | Best quick visual board |
| [Obsidian Canvas](https://obsidian.md/canvas) | Local vault with JSON Canvas files and ordinary attachments | Images, PDFs, video, audio, webpages, pasted or dragged in; can create cards from a folder | Best of the group for filenames, paths, notes, tags, and operators | Local app/vault, not a server product | Best overall for this workflow |
| [tldraw](https://tldraw.dev/docs/persistence) | IndexedDB persistence and portable offline files | Strong media and clipboard support | Weak by default; custom indexing required | Yes, through the SDK | Best custom-app foundation |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | Local-first app behavior | Strong image import and paste | Weak for asset libraries | Yes, Docker/self-hosting supported | Best for sketching and annotation |
| Boardfish | Portable local boards | Excellent clipboard and drag/drop | Minimal | Buildable, but source-available non-commercial license | Niche option |
| visualOS | Local-first folder/document workspace | Strong folder mirroring | Folder-oriented | No documented self-hosting | Worth evaluating if self-hosting is not required |

## Practical choice

For the current inspiration skill:

1. Keep saving images and `metadata.json` under `inspiration/<slug>/`.
2. Open that folder as part of an Obsidian vault.
3. Use an Obsidian Canvas per query, with image cards and nearby text cards for
   mood, source, creator, and observations.
4. Use PureRef when arranging references quickly matters more than searchable
   notes.

“Unlimited” means an unbounded workspace, not unlimited storage. Large image
boards still depend on disk, browser/database quotas, and rendering capacity.

## Caveats

- Obsidian indexes filenames, paths, and notes—not image pixels or visual
  similarity.
- tldraw self-hosting is an SDK integration project, not a turnkey moodboard.
- Excalidraw self-hosting has limitations around sharing/collaboration.
- PureRef and visualOS are proprietary products.
- Downloaded images remain references unless their license permits reuse; keep
  attribution and source URLs.

## Agent-controlled web canvas

The target is a browser page that the agent can populate with images, persist,
read back, and receive user feedback from. A canvas with only manual export or
browser-local storage is not enough.

| Tool | Self-hosting | Agent-facing control | MCP | Assessment |
|---|---|---|---|---|
| [tldraw](https://tldraw.dev/) | Strong SDK and official multiplayer starter | Excellent TypeScript/React store, snapshots, listeners, custom shapes, and assets | Official tldraw MCP App announced March 3, 2026 | Best technical fit, but production SDK use requires a license key |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | Official Docker image; custom backend needed for durable shared state | Excellent React component and imperative API; open `.excalidraw` JSON | Official MCP repository | Best open-source base; add a thin persistence and feedback bridge |
| [draw.io](https://www.drawio.com/) | Official Docker deployment | Mature iframe `postMessage` protocol for load, patch, autosave, export, XML, and JSON | Official MCP server | Strongest turnkey MCP story, but feels like a diagram editor rather than a moodboard |
| [AFFiNE](https://github.com/toeverything/AFFiNE) | Official Docker Community Edition | Internal GraphQL/REST/WebSocket layers, but no stable integration SDK identified | No official MCP found | Capable but too large and less predictable for this use |
| [Nextcloud Whiteboard](https://github.com/nextcloud/whiteboard) | Self-hostable, but requires the Nextcloud ecosystem | No obvious stable agent SDK | No official MCP found | Consider only if Nextcloud is already in use |
| [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | Official Docker Cloud deployment | No focused canvas API identified | No official MCP found | Workspace product, not a canvas-first fit |

## Recommended implementation

Build a small companion app rather than adopting a full workspace:

- Browser UI with a single canvas and simple feedback panel.
- Canvas engine: **tldraw** if its license is acceptable; otherwise
  **Excalidraw**.
- Persistence: SQLite/Postgres for board JSON and local/object storage for
  images. Keep source URLs, creators, licenses, and query metadata alongside
  each image.
- Agent bridge: expose HTTP endpoints and an MCP server for `read_board`,
  `add_images`, `update_item`, `remove_item`, `add_note`, and
  `read_feedback`.
- User feedback: store comments and item-level actions as append-only events so
  the next research run can distinguish “keep”, “discard”, and “find more like
  this”.
- Use a stable board ID and revision number so agent writes do not overwrite
  user changes silently.

This is smaller and more reliable than trying to automate AFFiNE or AppFlowy.
The existing `inspiration/<slug>/` files can remain the canonical image archive;
the web canvas should reference them or copy them into managed asset storage.

## Additional primary sources

- [tldraw persistence](https://tldraw.dev/sdk-features/persistence), [assets](https://tldraw.dev/sdk-features/assets), [multiplayer starter](https://tldraw.dev/starter-kits/multiplayer), and [tldraw MCP announcement](https://tldraw.dev/blog/tldraw-mcp-app)
- [Excalidraw package API](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/README.md), [Docker image](https://hub.docker.com/r/excalidraw/excalidraw), and [official MCP repository](https://github.com/excalidraw/excalidraw-mcp)
- [draw.io embed API](https://www.drawio.com/docs/reference/embed-mode/), [Docker deployment](https://www.drawio.com/docs/security/diagrams-docker-app/), and [MCP server](https://www.drawio.com/docs/manual/generate/drawio-mcp-server/)
- [AFFiNE MCP feature request](https://github.com/toeverything/AFFiNE/issues/13500), [AppFlowy deployment](https://docs.appflowy.io/docs/documentation/appflowy-cloud/deployment), and [Nextcloud Whiteboard](https://github.com/nextcloud/whiteboard)

## Primary sources

- [PureRef site](https://pureref.com/) and [PureRef image handbook](https://www.pureref.com/handbook/images/)
- [Obsidian Canvas](https://obsidian.md/canvas) and [Obsidian Search](https://obsidian.md/help/plugins/search)
- [Excalidraw repository](https://github.com/excalidraw/excalidraw) and [self-hosting/development guide](https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/introduction/development.mdx)
- [tldraw persistence](https://tldraw.dev/docs/persistence), [asset store](https://tldraw.dev/reference/tlschema/TLAssetStore), and [tldraw Offline](https://github.com/tldraw/tldraw-offline)
