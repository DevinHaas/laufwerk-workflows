import { Excalidraw, restore } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { isDirectVideoUrl } from "../src/canvas/video";

type Scene = { elements: readonly ExcalidrawElement[]; appState: Partial<AppState>; files: BinaryFiles };
type Board = { id: string; revision: number; scene: Scene; updatedAt: string };
type BoardSummary = { id: string; revision: number; updatedAt: string; elementCount: number; feedbackCount: number };
type Feedback = { id: number; itemId: string | null; action: "keep" | "discard" | "more_like" | "comment"; comment: string | null; createdAt: string };
type CompactAppState = Pick<AppState, "viewBackgroundColor" | "scrollX" | "scrollY" | "zoom" | "gridSize" | "theme">;
type CanvasView = { elements: readonly ExcalidrawElement[]; scrollX: number; scrollY: number; zoom: number; offsetLeft: number; offsetTop: number };
type Requester = (path: string, init?: RequestInit) => Promise<unknown>;
type ComponentTemplate = "color" | "typography" | "design_element" | "website_section";
const boardId = new URLSearchParams(location.search).get("board") ?? "";
const componentTemplates: Record<ComponentTemplate, { name: string; titleLabel: string; contentLabel: string; placeholder: string; inspiration: boolean }> = {
  color: { name: "Color", titleLabel: "Token name", contentLabel: "Hex color", placeholder: "#1864ab", inspiration: false },
  typography: { name: "Typography", titleLabel: "Style name", contentLabel: "Sample text", placeholder: "Build something clear", inspiration: false },
  design_element: { name: "Design element", titleLabel: "Element name", contentLabel: "Information", placeholder: "Describe its purpose and usage", inspiration: true },
  website_section: { name: "Website section", titleLabel: "Section title", contentLabel: "Information", placeholder: "Describe the content and purpose", inspiration: true },
};

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

function Dashboard({ request, onLock }: { request: Requester; onLock: () => void }) {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("Loading canvases");

  const loadBoards = useCallback(async (search = "") => {
    try {
      const result = await request(`/api/boards${search ? `?q=${encodeURIComponent(search)}` : ""}`) as BoardSummary[];
      setBoards(result);
      setStatus(search && result.length === 0 ? "No matching canvases" : `${result.length} canvas${result.length === 1 ? "" : "es"}`);
    } catch { setStatus("Could not load canvases"); }
  }, [request]);

  useEffect(() => { void loadBoards(); }, [loadBoards]);

  async function createCanvas() {
    try {
      const canvas = await request("/api/boards", { method: "POST", body: JSON.stringify({ id: name }) }) as BoardSummary;
      location.href = `/?board=${encodeURIComponent(canvas.id)}`;
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not create canvas"); }
  }

  async function deleteCanvas(canvas: BoardSummary) {
    if (!confirm(`Delete “${canvas.id}” and all of its feedback?`)) return;
    try {
      await request(`/api/boards/${encodeURIComponent(canvas.id)}`, { method: "DELETE" });
      setBoards(items => items.filter(item => item.id !== canvas.id));
      setStatus(`Deleted ${canvas.id}`);
    } catch { setStatus("Could not delete canvas"); }
  }

  return <main className="dashboard">
    <header>
      <a className="identity" href="/"><span aria-hidden="true">✦</span><strong>Excalibur</strong><span>Canvas</span></a>
      <span className="dashboard-status">{status}</span>
      <button className="quiet" onClick={onLock}>Lock</button>
    </header>
    <div className="dashboard-shell">
      <section className="dashboard-intro">
        <p>Your visual workspace</p>
        <h1>Canvases</h1>
        <form className="canvas-search" role="search" onSubmit={event => { event.preventDefault(); void loadBoards(query); }}>
          <label className="sr-only" htmlFor="canvas-search">Search canvases</label>
          <input id="canvas-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search names, canvas text, and feedback" />
          <button>Search</button>
        </form>
      </section>
      <section className="new-canvas">
        <h2>Start a canvas</h2>
        <p>Give the new research space a clear name.</p>
        <form onSubmit={event => { event.preventDefault(); void createCanvas(); }}>
          <label htmlFor="canvas-name">Canvas name</label>
          <input id="canvas-name" value={name} onChange={event => setName(event.target.value)} placeholder="Homepage directions" maxLength={80} required />
          <button className="primary">Create canvas</button>
        </form>
      </section>
      <section className="canvas-index" aria-live="polite">
        <div className="index-heading"><h2>{query ? "Search results" : "Recent canvases"}</h2><span>{boards.length}</span></div>
        {boards.length === 0 ? <div className="canvas-empty"><span aria-hidden="true">✦</span><p>{query ? "No canvases match that search." : "Create the first canvas to begin."}</p></div> : boards.map(canvas => <article className="canvas-row" key={canvas.id}>
          <a href={`/?board=${encodeURIComponent(canvas.id)}`}>
            <strong>{canvas.id}</strong>
            <span>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(canvas.updatedAt))}</span>
          </a>
          <dl>
            <div><dt>Elements</dt><dd>{canvas.elementCount}</dd></div>
            <div><dt>Feedback</dt><dd>{canvas.feedbackCount}</dd></div>
            <div><dt>Revision</dt><dd>{canvas.revision}</dd></div>
          </dl>
          <button className="delete-canvas" onClick={() => void deleteCanvas(canvas)} aria-label={`Delete ${canvas.id}`}>Delete</button>
        </article>)}
      </section>
    </div>
  </main>;
}

function CanvasComment({ comments, left, top, open, onToggle }: { comments: Feedback[]; left: number; top: number; open: boolean; onToggle: () => void }) {
  return <div className={`canvas-comment ${open ? "open" : ""}`} style={{ left, top }}>
    <button className="comment-pin" onClick={onToggle} aria-expanded={open} aria-label={`${comments.length} comment${comments.length === 1 ? "" : "s"}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5.5h14v10H9l-4 3v-13Z" /></svg>
      <span>{comments.length}</span>
    </button>
    {open && <div className="comment-card">
      <div><strong>Feedback</strong><span>{comments.length} comment{comments.length === 1 ? "" : "s"}</span></div>
      {comments.map(item => <p key={item.id}>{item.comment}</p>)}
    </div>}
  </div>;
}

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("canvas-token") ?? "");
  const [draftToken, setDraftToken] = useState(token);
  const [board, setBoard] = useState<Board | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openCommentId, setOpenCommentId] = useState<string | null>(null);
  const [canvasView, setCanvasView] = useState<CanvasView>({ elements: [], scrollX: 0, scrollY: 0, zoom: 1, offsetLeft: 0, offsetTop: 0 });
  const [comment, setComment] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [componentTemplate, setComponentTemplate] = useState<ComponentTemplate>("website_section");
  const [componentTitle, setComponentTitle] = useState("");
  const [componentContent, setComponentContent] = useState("");
  const [componentInspiration, setComponentInspiration] = useState("");
  const [status, setStatus] = useState("Loading board");
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const componentDialogRef = useRef<HTMLDialogElement | null>(null);
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
    if (!token || !boardId) return;
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
      setCanvasView({ elements: scene.elements, scrollX: restored.appState.scrollX, scrollY: restored.appState.scrollY, zoom: restored.appState.zoom.value, offsetLeft: 0, offsetTop: 0 });
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
    setCanvasView(current => {
      const elementsChanged = current.elements.length !== elements.length || elements.some((element, index) => element.id !== current.elements[index]?.id || element.version !== current.elements[index]?.version);
      return elementsChanged || current.scrollX !== appState.scrollX || current.scrollY !== appState.scrollY || current.zoom !== appState.zoom.value || current.offsetLeft !== appState.offsetLeft || current.offsetTop !== appState.offsetTop
        ? { elements, scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom.value, offsetLeft: appState.offsetLeft, offsetTop: appState.offsetTop }
        : current;
    });
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

  function focusElement(itemId: string | null) {
    if (!itemId) return;
    const api = apiRef.current;
    const element = api?.getSceneElements().find(item => item.id === itemId);
    if (!api || !element) {
      setStatus("Canvas item no longer exists");
      return;
    }
    api.updateScene({ appState: { selectedElementIds: { [itemId]: true } } });
    api.scrollToContent(element, { fitToViewport: true, viewportZoomFactor: 0.5, maxZoom: 1.2, animate: true, duration: 250 });
  }

  async function react(action: Feedback["action"], text?: string) {
    try {
      const event = await request(`/api/boards/${encodeURIComponent(boardId)}/feedback`, { method: "POST", body: JSON.stringify({ action, itemId: selectedId, comment: text }) });
      setFeedback(items => [...items, event]);
      setComment("");
      setStatus(action === "keep" ? "Marked to keep for the next revision" : action === "discard" ? "Marked to discard for the next revision" : action === "more_like" ? "Requested more like this" : "Comment added");
    } catch { setStatus("Feedback failed"); }
  }

  async function addVideo() {
    try {
      setStatus("Adding video");
      await request("/api/tools/add_videos", { method: "POST", body: JSON.stringify({ boardId, revision: currentRevision.current, videos: [{ url: videoUrl }] }) });
      setVideoUrl("");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add video");
    }
  }

  async function addComponent() {
    try {
      setStatus("Adding component");
      await request("/api/tools/add_components", { method: "POST", body: JSON.stringify({
        boardId,
        revision: currentRevision.current,
        components: [{ template: componentTemplate, title: componentTitle, content: componentContent, inspiration: componentInspiration || undefined }],
      }) });
      setComponentTitle("");
      setComponentContent("");
      setComponentInspiration("");
      await load();
      componentDialogRef.current?.close();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add component");
    }
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

  if (!boardId) return <Dashboard request={request} onLock={() => { localStorage.removeItem("canvas-token"); setToken(""); }} />;

  const selectedDecision = selectedId ? feedback.findLast(event => event.itemId === selectedId && (event.action === "keep" || event.action === "discard")) : undefined;
  const commentsByItem = feedback.reduce<Record<string, Feedback[]>>((groups, event) => {
    if (event.action === "comment" && event.itemId && event.comment) (groups[event.itemId] ??= []).push(event);
    return groups;
  }, {});
  const canvasBounds = canvasRef.current?.getBoundingClientRect();

  return <main className="workspace">
    <header>
      <a className="identity" href="/"><span aria-hidden="true">✦</span><strong>Excalibur</strong><span>Canvas</span></a>
      <div className={`save-state ${/available|failed|discard|rejected|could not|no longer exists/i.test(status) ? "warning" : ""}`}><i />{status}</div>
      <a className="quiet quiet-link" href="/">All canvases</a>
      <button className="quiet" onClick={() => void load()}>Reload</button>
      <button className="quiet" onClick={() => { localStorage.removeItem("canvas-token"); setToken(""); }}>Lock</button>
    </header>
    <section className="canvas" aria-label="Visual research canvas" ref={canvasRef}>
      {board && <Excalidraw excalidrawAPI={api => { apiRef.current = api; }} initialData={{ ...board.scene, scrollToContent: board.scene.elements.length > 0 }} onChange={onChange} validateEmbeddable={url => isDirectVideoUrl(url) || undefined} renderEmbeddable={element => element.link && isDirectVideoUrl(element.link) ? <video className="embedded-video" src={element.link} controls playsInline preload="metadata" /> : null} renderTopRightUI={() => <button type="button" className="add-component-tool" onClick={() => componentDialogRef.current?.showModal()}>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        <span>Add component</span>
      </button>} UIOptions={{ canvasActions: { loadScene: false } }} />}
      <div className="comment-layer">
        {canvasBounds && Object.entries(commentsByItem).map(([itemId, comments]) => {
          const element = canvasView.elements.find(item => item.id === itemId);
          if (!element || element.isDeleted) return null;
          const left = (element.x + element.width + canvasView.scrollX) * canvasView.zoom + canvasView.offsetLeft - canvasBounds.left;
          const top = (element.y + canvasView.scrollY) * canvasView.zoom + canvasView.offsetTop - canvasBounds.top;
          return <CanvasComment key={itemId} comments={comments} left={left} top={top} open={openCommentId === itemId} onToggle={() => setOpenCommentId(current => current === itemId ? null : itemId)} />;
        })}
      </div>
    </section>
    <aside>
      <div className="revision"><span>Revision</span><strong>{currentRevision.current}</strong></div>
      <section>
        <h2>Embed video</h2>
        <p className="hint">Add a public YouTube, Vimeo, or 21st.dev video link.</p>
        <form onSubmit={event => { event.preventDefault(); void addVideo(); }}>
          <label htmlFor="video-url">Video URL</label>
          <input id="video-url" type="url" value={videoUrl} onChange={event => setVideoUrl(event.target.value)} placeholder="https://youtube.com/watch?v=…" required />
          <button className="primary">Add video</button>
        </form>
      </section>
      <section>
        <h2>{selectedId ? "Selected item" : "Board feedback"}</h2>
        <p className="hint">{selectedId ? `Item ${selectedId.slice(0, 8)}` : "Select an item to attach feedback, or comment on the whole board."}</p>
        {selectedDecision && <p className={`decision ${selectedDecision.action}`} aria-live="polite">
          {selectedDecision.action === "keep" ? "Keep for the next revision" : "Discard for the next revision"}
        </p>}
        <div className="actions">
          <button className={selectedDecision?.action === "keep" ? "active keep" : ""} aria-pressed={selectedDecision?.action === "keep"} disabled={!selectedId} onClick={() => void react("keep")}>Keep</button>
          <button className={selectedDecision?.action === "discard" ? "active discard" : ""} aria-pressed={selectedDecision?.action === "discard"} disabled={!selectedId} onClick={() => void react("discard")}>Discard</button>
          <button disabled={!selectedId} onClick={() => void react("more_like")}>Find more like this</button>
        </div>
        <label htmlFor="comment">Comment</label>
        <textarea id="comment" rows={3} value={comment} onChange={event => setComment(event.target.value)} placeholder="What should the next research pass know?" />
        <button className="primary" disabled={!comment.trim()} onClick={() => void react("comment", comment)}>Add comment</button>
      </section>
      <section className="trail">
        <h2>Feedback trail</h2>
        {feedback.length === 0 ? <p className="empty">No feedback yet.</p> : feedback.slice(-8).reverse().map(event => <article
          key={event.id}
          className={event.action}
          tabIndex={event.itemId ? 0 : undefined}
          aria-label={event.itemId ? `Show ${event.action.replace("_", " ")} item ${event.itemId.slice(0, 8)} on canvas` : undefined}
          onMouseEnter={() => focusElement(event.itemId)}
          onFocus={() => focusElement(event.itemId)}
        >
          <strong>{event.action.replace("_", " ")}</strong>
          <span>{event.itemId ? event.itemId.slice(0, 8) : "whole board"}</span>
          {event.comment && <p>{event.comment}</p>}
        </article>)}
      </section>
    </aside>
    <dialog className="component-dialog" ref={componentDialogRef} aria-labelledby="component-dialog-title">
      <form onSubmit={event => { event.preventDefault(); void addComponent(); }}>
        <div className="dialog-heading">
          <div>
            <h2 id="component-dialog-title">Add component</h2>
            <p className="hint">Use the same structured templates available to agents.</p>
          </div>
          <button type="button" onClick={() => componentDialogRef.current?.close()} aria-label="Close">×</button>
        </div>
        <label htmlFor="component-template">Template</label>
        <select id="component-template" value={componentTemplate} onChange={event => setComponentTemplate(event.target.value as ComponentTemplate)}>
          {Object.entries(componentTemplates).map(([value, template]) => <option key={value} value={value}>{template.name}</option>)}
        </select>
        <label htmlFor="component-title">{componentTemplates[componentTemplate].titleLabel}</label>
        <input id="component-title" value={componentTitle} onChange={event => setComponentTitle(event.target.value)} required />
        <label htmlFor="component-content">{componentTemplates[componentTemplate].contentLabel}</label>
        {componentTemplate === "color"
          ? <input id="component-content" value={componentContent} onChange={event => setComponentContent(event.target.value)} placeholder={componentTemplates[componentTemplate].placeholder} pattern="#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})" required />
          : <textarea id="component-content" rows={3} value={componentContent} onChange={event => setComponentContent(event.target.value)} placeholder={componentTemplates[componentTemplate].placeholder} required />}
        {componentTemplates[componentTemplate].inspiration && <>
          <label htmlFor="component-inspiration">Inspiration{componentTemplate === "design_element" ? " (optional)" : ""}</label>
          <textarea id="component-inspiration" rows={2} value={componentInspiration} onChange={event => setComponentInspiration(event.target.value)} placeholder="Reference, URL, or visual direction" required={componentTemplate === "website_section"} />
        </>}
        <button className="primary" disabled={!board}>Add component</button>
      </form>
    </dialog>
  </main>;
}
