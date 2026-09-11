import { Database } from "bun:sqlite";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { mkdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type JsonObject = Record<string, unknown>;

export type Scene = {
  elements: JsonObject[];
  appState: JsonObject;
  files: Record<string, JsonObject>;
};

export type Board = {
  id: string;
  revision: number;
  scene: Scene;
  updatedAt: string;
};

export type Feedback = {
  id: number;
  boardId: string;
  itemId: string | null;
  action: "keep" | "discard" | "more_like" | "comment";
  comment: string | null;
  createdAt: string;
};

export type ImageInput = {
  url: string;
  creator?: string;
  license?: string;
  query?: JsonObject;
  x?: number;
  y?: number;
};

const EMPTY_SCENE: Scene = {
  elements: [],
  appState: { viewBackgroundColor: "#f7faf9" },
  files: {},
};

const PRIVATE_IPV4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return PRIVATE_IPV4.some(pattern => pattern.test(address));
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
}

async function publicUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("Image source must be a public HTTP(S) URL without credentials");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Image source resolves to a private or unavailable address");
  }
  return url;
}

async function downloadImage(value: string): Promise<{ bytes: Uint8Array; mime: string; url: string }> {
  let url = await publicUrl(value);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 5) throw new Error("Image source has an invalid redirect chain");
      url = await publicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Image source returned HTTP ${response.status}`);
    const mime = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!mime.startsWith("image/") || mime === "image/svg+xml") {
      throw new Error("Image source must return a raster image");
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 12_000_000) throw new Error("Image exceeds the 12 MB limit");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 12_000_000) throw new Error("Image exceeds the 12 MB limit");
    return { bytes, mime, url: url.toString() };
  }
  throw new Error("Image download failed");
}

function dataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function extensionFor(mime: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif" } as Record<string, string>)[mime] ?? "bin";
}

export class RevisionConflict extends Error {
  constructor(readonly actualRevision: number) {
    super(`Board changed at revision ${actualRevision}`);
  }
}

export class CanvasStore {
  readonly db: Database;
  readonly assetDir: string;

  constructor(readonly dataDir = process.env.CANVAS_DATA_DIR ?? "./data") {
    mkdirSync(dataDir, { recursive: true });
    this.assetDir = join(dataDir, "assets");
    this.db = new Database(join(dataDir, "canvas.sqlite"), { create: true });
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL DEFAULT 0,
        scene_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        file_id TEXT NOT NULL,
        path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        source_url TEXT,
        creator TEXT,
        license TEXT,
        query_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(board_id, file_id)
      );
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        item_id TEXT,
        action TEXT NOT NULL CHECK(action IN ('keep', 'discard', 'more_like', 'comment')),
        comment TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  async init(): Promise<void> {
    await mkdir(this.assetDir, { recursive: true });
  }

  ensureBoard(id: string): void {
    const now = new Date().toISOString();
    this.db.query("INSERT OR IGNORE INTO boards (id, revision, scene_json, updated_at) VALUES (?, 0, ?, ?)")
      .run(id, JSON.stringify(EMPTY_SCENE), now);
  }

  async readBoard(id: string): Promise<Board> {
    this.ensureBoard(id);
    const row = this.db.query("SELECT id, revision, scene_json, updated_at FROM boards WHERE id = ?")
      .get(id) as { id: string; revision: number; scene_json: string; updated_at: string };
    const scene = JSON.parse(row.scene_json) as Scene;
    const assets = this.db.query("SELECT file_id, path, mime_type FROM assets WHERE board_id = ?").all(id) as Array<{ file_id: string; path: string; mime_type: string }>;
    for (const asset of assets) {
      const file = scene.files[asset.file_id];
      if (file) file.dataURL = dataUrl(await readFile(asset.path), asset.mime_type);
    }
    return { id: row.id, revision: row.revision, scene, updatedAt: row.updated_at };
  }

  async saveBoard(id: string, expectedRevision: number, scene: Scene): Promise<Board> {
    this.ensureBoard(id);
    if (!Array.isArray(scene.elements) || typeof scene.appState !== "object" || typeof scene.files !== "object") {
      throw new Error("Invalid Excalidraw scene");
    }
    const current = this.db.query("SELECT revision FROM boards WHERE id = ?").get(id) as { revision: number };
    if (current.revision !== expectedRevision) throw new RevisionConflict(current.revision);

    const stored = structuredClone(scene);
    for (const [fileId, file] of Object.entries(stored.files)) {
      const encoded = typeof file.dataURL === "string" ? file.dataURL.match(/^data:(image\/(?:jpeg|png|gif|webp|avif));base64,([A-Za-z0-9+/=]+)$/) : null;
      const existing = this.db.query("SELECT id FROM assets WHERE board_id = ? AND file_id = ?").get(id, fileId);
      if (encoded && !existing) {
        const bytes = Buffer.from(encoded[2]!, "base64");
        if (bytes.length > 12_000_000) throw new Error("Image exceeds the 12 MB limit");
        const assetId = crypto.randomUUID();
        const path = join(this.assetDir, `${assetId}.${extensionFor(encoded[1]!)}`);
        await writeFile(path, bytes);
        this.db.query("INSERT INTO assets (id, board_id, file_id, path, mime_type, source_url, creator, license, query_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(
            assetId, id, fileId, path, encoded[1]!,
            typeof file.sourceURL === "string" ? file.sourceURL : null,
            typeof file.creator === "string" ? file.creator : null,
            typeof file.license === "string" ? file.license : null,
            file.query && typeof file.query === "object" ? JSON.stringify(file.query) : null,
            new Date().toISOString(),
          );
      }
      file.dataURL = "";
    }

    const now = new Date().toISOString();
    const result = this.db.query("UPDATE boards SET scene_json = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?")
      .run(JSON.stringify(stored), now, id, expectedRevision);
    if (result.changes !== 1) {
      const latest = this.db.query("SELECT revision FROM boards WHERE id = ?").get(id) as { revision: number };
      throw new RevisionConflict(latest.revision);
    }
    return this.readBoard(id);
  }

  async addImages(id: string, revision: number, images: ImageInput[]): Promise<Board> {
    if (!images.length || images.length > 20) throw new Error("Provide between 1 and 20 images");
    const board = await this.readBoard(id);
    if (board.revision !== revision) throw new RevisionConflict(board.revision);
    const scene = structuredClone(board.scene);
    for (const [index, input] of images.entries()) {
      const downloaded = await downloadImage(input.url);
      const fileId = crypto.randomUUID();
      scene.files[fileId] = { id: fileId, dataURL: dataUrl(downloaded.bytes, downloaded.mime), mimeType: downloaded.mime, created: Date.now() };
      scene.elements.push({
        id: crypto.randomUUID().slice(0, 20), type: "image", fileId, status: "saved",
        x: input.x ?? 80 + (index % 3) * 420, y: input.y ?? 80 + Math.floor(index / 3) * 320,
        width: 360, height: 240, angle: 0, opacity: 100,
      });
      const asset = this.db.query("SELECT id FROM assets WHERE board_id = ? AND file_id = ?").get(id, fileId);
      if (!asset) {
        // Metadata is attached after saveBoard persists the bytes.
        scene.files[fileId]!.sourceURL = downloaded.url;
        scene.files[fileId]!.creator = input.creator ?? null;
        scene.files[fileId]!.license = input.license ?? null;
        scene.files[fileId]!.query = input.query ?? null;
      }
    }
    return this.saveBoard(id, revision, scene);
  }

  async updateItem(id: string, revision: number, itemId: string, patch: JsonObject): Promise<Board> {
    const allowed = new Set(["x", "y", "width", "height", "angle", "opacity", "text", "originalText", "strokeColor", "backgroundColor"]);
    if (Object.keys(patch).some(key => !allowed.has(key))) throw new Error("Patch contains an unsupported field");
    const board = await this.readBoard(id);
    const item = board.scene.elements.find(element => element.id === itemId);
    if (!item) throw new Error("Canvas item not found");
    Object.assign(item, patch);
    return this.saveBoard(id, revision, board.scene);
  }

  async removeItem(id: string, revision: number, itemId: string): Promise<Board> {
    const board = await this.readBoard(id);
    const length = board.scene.elements.length;
    board.scene.elements = board.scene.elements.filter(element => element.id !== itemId);
    if (board.scene.elements.length === length) throw new Error("Canvas item not found");
    return this.saveBoard(id, revision, board.scene);
  }

  async addNote(id: string, revision: number, text: string, x = 100, y = 100): Promise<Board> {
    if (!text.trim()) throw new Error("Note text is required");
    const board = await this.readBoard(id);
    board.scene.elements.push({ id: crypto.randomUUID().slice(0, 20), type: "text", x, y, text: text.trim(), originalText: text.trim(), fontSize: 24, width: Math.min(520, Math.max(120, text.length * 13)), height: 32, angle: 0, opacity: 100 });
    return this.saveBoard(id, revision, board.scene);
  }

  addFeedback(boardId: string, action: Feedback["action"], itemId?: string, comment?: string): Feedback {
    this.ensureBoard(boardId);
    if (action === "comment" && !comment?.trim()) throw new Error("A comment is required");
    const createdAt = new Date().toISOString();
    const result = this.db.query("INSERT INTO feedback (board_id, item_id, action, comment, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(boardId, itemId ?? null, action, comment?.trim() || null, createdAt);
    return { id: Number(result.lastInsertRowid), boardId, itemId: itemId ?? null, action, comment: comment?.trim() || null, createdAt };
  }

  readFeedback(boardId: string, after = 0): Feedback[] {
    this.ensureBoard(boardId);
    return this.db.query("SELECT id, board_id, item_id, action, comment, created_at FROM feedback WHERE board_id = ? AND id > ? ORDER BY id")
      .all(boardId, after).map((row: any) => ({ id: row.id, boardId: row.board_id, itemId: row.item_id, action: row.action, comment: row.comment, createdAt: row.created_at }));
  }

  assetPath(id: string): { path: string; mime: string } | null {
    const row = this.db.query("SELECT path, mime_type FROM assets WHERE id = ?").get(id) as { path: string; mime_type: string } | null;
    return row ? { path: row.path, mime: row.mime_type } : null;
  }

  close(): void {
    this.db.close();
  }
}
