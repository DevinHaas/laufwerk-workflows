import { resolve } from "node:path";
import { CanvasStore, RevisionConflict, type Feedback, type ImageInput, type JsonObject, type Scene } from "./store";

const port = Number(process.env.PORT ?? 3000);
const token = process.env.CANVAS_TOKEN;
const defaultBoard = process.env.CANVAS_BOARD_ID ?? "main";
const production = process.env.NODE_ENV === "production";
if (!token) throw new Error("CANVAS_TOKEN is required");

const store = new CanvasStore();
await store.init();
store.ensureBoard(defaultBoard);

const tools = [
  { name: "read_board", description: "Read the current Excalidraw board and revision.", inputSchema: { type: "object", properties: { boardId: { type: "string" } } } },
  { name: "add_images", description: "Download public images into managed storage and add them to the board.", inputSchema: { type: "object", required: ["revision", "images"], properties: { boardId: { type: "string" }, revision: { type: "integer" }, images: { type: "array", items: { type: "object", required: ["url"], properties: { url: { type: "string" }, creator: { type: "string" }, license: { type: "string" }, query: { type: "object" }, x: { type: "number" }, y: { type: "number" } } } } } } },
  { name: "update_item", description: "Update position, size, appearance, or text on one item.", inputSchema: { type: "object", required: ["revision", "itemId", "patch"], properties: { boardId: { type: "string" }, revision: { type: "integer" }, itemId: { type: "string" }, patch: { type: "object" } } } },
  { name: "remove_item", description: "Remove one item from the board.", inputSchema: { type: "object", required: ["revision", "itemId"], properties: { boardId: { type: "string" }, revision: { type: "integer" }, itemId: { type: "string" } } } },
  { name: "add_note", description: "Add a text note to the board.", inputSchema: { type: "object", required: ["revision", "text"], properties: { boardId: { type: "string" }, revision: { type: "integer" }, text: { type: "string" }, x: { type: "number" }, y: { type: "number" } } } },
  { name: "read_feedback", description: "Read append-only keep, discard, find-more, and comment events.", inputSchema: { type: "object", properties: { boardId: { type: "string" }, after: { type: "integer" } } } },
] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function authorized(request: Request): boolean {
  const value = request.headers.get("authorization");
  return value === `Bearer ${token}` || request.headers.get("x-canvas-token") === token;
}

async function body(request: Request): Promise<JsonObject> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 50_000_000) throw new Error("Request exceeds the 50 MB limit");
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON object required");
  return value as JsonObject;
}

async function callTool(name: string, input: JsonObject): Promise<unknown> {
  const boardId = typeof input.boardId === "string" && input.boardId ? input.boardId : defaultBoard;
  switch (name) {
    case "read_board": return store.readBoard(boardId);
    case "add_images": return store.addImages(boardId, Number(input.revision), input.images as ImageInput[]);
    case "update_item": return store.updateItem(boardId, Number(input.revision), String(input.itemId), input.patch as JsonObject);
    case "remove_item": return store.removeItem(boardId, Number(input.revision), String(input.itemId));
    case "add_note": return store.addNote(boardId, Number(input.revision), String(input.text), input.x === undefined ? undefined : Number(input.x), input.y === undefined ? undefined : Number(input.y));
    case "read_feedback": return store.readFeedback(boardId, Number(input.after ?? 0));
    default: throw new Error("Unknown tool");
  }
}

async function mcp(request: Request): Promise<Response> {
  const message = await body(request);
  if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
  const id = message.id ?? null;
  if (message.method === "initialize") {
    const params = message.params as JsonObject | undefined;
    const protocolVersion = typeof params?.protocolVersion === "string" ? params.protocolVersion : "2025-03-26";
    return json({ jsonrpc: "2.0", id, result: { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "excalibur-canvas", version: "1.0.0" } } });
  }
  if (message.method === "tools/list") return json({ jsonrpc: "2.0", id, result: { tools } });
  if (message.method === "tools/call") {
    const params = message.params as JsonObject;
    try {
      const result = await callTool(String(params.name), (params.arguments ?? {}) as JsonObject);
      return json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result) }] } });
    } catch (error) {
      return json({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] } });
    }
  }
  return json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
}

function errorResponse(error: unknown): Response {
  if (error instanceof RevisionConflict) return json({ error: error.message, revision: error.actualRevision }, 409);
  return json({ error: error instanceof Error ? error.message : String(error) }, 400);
}

function staticFile(pathname: string): Response {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = resolve("dist", relative);
  const root = resolve("dist");
  if (!path.startsWith(`${root}/`) && path !== root) return new Response("Not found", { status: 404 });
  const file = Bun.file(path);
  return new Response(file);
}

Bun.serve({
  port,
  maxRequestBodySize: 50_000_000,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true });
    if (url.pathname.startsWith("/api/") || url.pathname === "/mcp") {
      if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
      try {
        if (url.pathname === "/mcp" && request.method === "POST") return mcp(request);
        const boardMatch = url.pathname.match(/^\/api\/boards\/([^/]+)$/);
        if (boardMatch && request.method === "GET") return json(await store.readBoard(decodeURIComponent(boardMatch[1]!)));
        if (boardMatch && request.method === "PUT") {
          const input = await body(request);
          return json(await store.saveBoard(decodeURIComponent(boardMatch[1]!), Number(input.revision), input.scene as Scene));
        }
        const feedbackMatch = url.pathname.match(/^\/api\/boards\/([^/]+)\/feedback$/);
        if (feedbackMatch && request.method === "GET") return json(store.readFeedback(decodeURIComponent(feedbackMatch[1]!), Number(url.searchParams.get("after") ?? 0)));
        if (feedbackMatch && request.method === "POST") {
          const input = await body(request);
          return json(store.addFeedback(decodeURIComponent(feedbackMatch[1]!), String(input.action) as Feedback["action"], typeof input.itemId === "string" ? input.itemId : undefined, typeof input.comment === "string" ? input.comment : undefined), 201);
        }
        const assetMatch = url.pathname.match(/^\/api\/assets\/([a-f0-9-]+)$/);
        if (assetMatch && request.method === "GET") {
          const asset = store.assetPath(assetMatch[1]!);
          return asset ? new Response(Bun.file(asset.path), { headers: { "content-type": asset.mime, "cache-control": "private, max-age=31536000, immutable" } }) : new Response("Not found", { status: 404 });
        }
        const toolMatch = url.pathname.match(/^\/api\/tools\/([a-z_]+)$/);
        if (toolMatch && request.method === "POST") return json(await callTool(toolMatch[1]!, await body(request)));
        return json({ error: "Not found" }, 404);
      } catch (error) {
        return errorResponse(error);
      }
    }
    if (!production) return staticFile(url.pathname);
    return staticFile(url.pathname);
  },
});

console.log(`Excalibur Canvas listening on :${port}`);
