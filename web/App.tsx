import { Excalidraw, restore } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { useCallback, useEffect, useRef, useState } from "react";

type Scene = { elements: readonly ExcalidrawElement[]; appState: Partial<AppState>; files: BinaryFiles };
type Board = { id: string; revision: number; scene: Scene; updatedAt: string };
type Feedback = { id: number; itemId: string | null; action: string; comment: string | null; createdAt: string };
type CompactAppState = Pick<AppState, "viewBackgroundColor" | "scrollX" | "scrollY" | "zoom" | "gridSize" | "theme">;
const boardId = new URLSearchParams(location.search).get("board") || "main";

function compactAppState(state: CompactAppState): CompactAppState {
  return {
    viewBackgroundColor: state.viewBackgroundColor,
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    zoom: state.zoom,
    gridSize: state.gridSize,
    theme: state.theme,
  };
}

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("canvas-token") ?? "");
  const [draftToken, setDraftToken] = useState(token);
  const [board, setBoard] = useState<Board | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("Loading board");
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScene = useRef("");
  const currentRevision = useRef(0);
  const hydrating = useRef(true);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers } });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error ?? "Request failed"), { status: response.status });
    return result;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setStatus("Loading board");
      const [nextBoard, events] = await Promise.all([request(`/api/boards/${encodeURIComponent(boardId)}`), request(`/api/boards/${encodeURIComponent(boardId)}/feedback`)]);
      const restored = restore(nextBoard.scene, null, null);
      const scene: Scene = { elements: restored.elements, appState: compactAppState(restored.appState), files: restored.files };
      hydrating.current = true;
      currentRevision.current = nextBoard.revision;
      lastScene.current = JSON.stringify(scene);
      setBoard({ ...nextBoard, scene });
      setFeedback(events);
      apiRef.current?.addFiles(Object.values(scene.files));
      apiRef.current?.updateScene({ elements: scene.elements, appState: restored.appState });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // ponytail: absorb Excalidraw's initial render burst; use a hydration callback if the library adds one.
      saveTimer.current = setTimeout(() => { hydrating.current = false; }, 100);
      setStatus("Saved");
    } catch (error) {
      setStatus(error instanceof Error && "status" in error && error.status === 401 ? "Token rejected" : "Could not load board");
    }
  }, [request, token]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (scene: Scene) => {
    try {
      setStatus("Saving");
      const next = await request(`/api/boards/${encodeURIComponent(boardId)}`, { method: "PUT", body: JSON.stringify({ revision: currentRevision.current, scene }) });
      currentRevision.current = next.revision;
      setBoard(next);
      setStatus("Saved");
    } catch (error) {
      setStatus(error instanceof Error && "status" in error && error.status === 409 ? "Newer revision available — reload" : "Save failed");
    }
  }, [request]);

  const onChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    setSelectedId(Object.keys(appState.selectedElementIds)[0] ?? null);
    if (!board) return;
    const scene = { elements, appState: compactAppState(appState), files };
    const serialized = JSON.stringify(scene);
    if (hydrating.current) {
      lastScene.current = serialized;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { hydrating.current = false; }, 100);
      return;
    }
    if (serialized === lastScene.current) return;
    lastScene.current = serialized;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(scene), 900);
  }, [board, save]);

  async function react(action: string, text?: string) {
    try {
      const event = await request(`/api/boards/${encodeURIComponent(boardId)}/feedback`, { method: "POST", body: JSON.stringify({ action, itemId: selectedId, comment: text }) });
      setFeedback(items => [...items, event]);
      setComment("");
    } catch { setStatus("Feedback failed"); }
  }

  if (!token || status === "Token rejected") return <main className="gate">
    <form onSubmit={event => { event.preventDefault(); localStorage.setItem("canvas-token", draftToken); setToken(draftToken); }}>
      <div className="mark" aria-hidden="true">✦</div>
      <h1>Excalibur Canvas</h1>
      <p>Enter the access token for this private research board.</p>
      <label htmlFor="token">Access token</label>
      <input id="token" type="password" value={draftToken} onChange={event => setDraftToken(event.target.value)} autoFocus required />
      <button>Open canvas</button>
    </form>
  </main>;

  return <main className="workspace">
    <header>
      <div className="identity"><span aria-hidden="true">✦</span><strong>Excalibur</strong><span>Canvas</span></div>
      <div className={`save-state ${status.includes("available") || status.includes("failed") ? "warning" : ""}`}><i />{status}</div>
      <button className="quiet" onClick={() => void load()}>Reload</button>
      <button className="quiet" onClick={() => { localStorage.removeItem("canvas-token"); setToken(""); }}>Lock</button>
    </header>
    <section className="canvas" aria-label="Visual research canvas">
      {board && <Excalidraw excalidrawAPI={api => { apiRef.current = api; }} initialData={{ ...board.scene, scrollToContent: board.scene.elements.length > 0 }} onChange={onChange} UIOptions={{ canvasActions: { loadScene: false } }} />}
    </section>
    <aside>
      <div className="revision"><span>Revision</span><strong>{currentRevision.current}</strong></div>
      <section>
        <h2>{selectedId ? "Selected item" : "Board feedback"}</h2>
        <p className="hint">{selectedId ? `Item ${selectedId.slice(0, 8)}` : "Select an item to attach feedback, or comment on the whole board."}</p>
        <div className="actions">
          <button disabled={!selectedId} onClick={() => void react("keep")}>Keep</button>
          <button disabled={!selectedId} onClick={() => void react("discard")}>Discard</button>
          <button disabled={!selectedId} onClick={() => void react("more_like")}>Find more like this</button>
        </div>
        <label htmlFor="comment">Comment</label>
        <textarea id="comment" rows={3} value={comment} onChange={event => setComment(event.target.value)} placeholder="What should the next research pass know?" />
        <button className="primary" disabled={!comment.trim()} onClick={() => void react("comment", comment)}>Add comment</button>
      </section>
      <section className="trail">
        <h2>Feedback trail</h2>
        {feedback.length === 0 ? <p className="empty">No feedback yet.</p> : feedback.slice(-8).reverse().map(event => <article key={event.id}>
          <strong>{event.action.replace("_", " ")}</strong>
          <span>{event.itemId ? event.itemId.slice(0, 8) : "whole board"}</span>
          {event.comment && <p>{event.comment}</p>}
        </article>)}
      </section>
    </aside>
  </main>;
}
