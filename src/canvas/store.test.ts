import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CanvasStore, RevisionConflict } from "./store";

test("board writes are revision-safe and feedback remains append-only", async () => {
  const directory = await mkdtemp(join(tmpdir(), "excalibur-canvas-"));
  const store = new CanvasStore(directory);
  await store.init();
  const initial = await store.readBoard("test");
  const updated = await store.addNote("test", initial.revision, "Look closer", 40, 60);
  expect(updated.revision).toBe(1);
  expect(updated.scene.elements[0]).toMatchObject({ type: "text", text: "Look closer", x: 40, y: 60 });
  expect((await store.saveBoard("test", updated.revision, updated.scene)).revision).toBe(1);
  const withVideo = await store.addVideos("test", updated.revision, [
    { url: "https://www.youtube.com/watch?v=M7lc1UVf-VE", x: 12, y: 34 },
    { url: "https://cdn.21st.dev/user_aceternity/container-scroll-animation/default/video.mp4" },
  ]);
  expect((await store.readBoard("test")).scene.elements[1]).toMatchObject({ type: "embeddable", link: "https://www.youtube.com/watch?v=M7lc1UVf-VE", x: 12, y: 34, width: 560, height: 315 });
  expect((await store.readBoard("test")).scene).toMatchObject({ elements: [{}, {}, { type: "embeddable", link: "https://cdn.21st.dev/user_aceternity/container-scroll-animation/default/video.mp4" }], files: {} });
  await expect(store.addVideos("test", withVideo.revision, [{ url: "https://example.com/video.mp4" }])).rejects.toThrow("supported public HTTPS URL");
  await expect(store.addNote("test", 0, "stale")).rejects.toBeInstanceOf(RevisionConflict);
  store.addFeedback("test", "keep", String(updated.scene.elements[0]!.id));
  store.addFeedback("test", "comment", undefined, "Use this rhythm");
  expect(store.readFeedback("test").map(event => event.action)).toEqual(["keep", "comment"]);
  store.close();
  await rm(directory, { recursive: true, force: true });
});

test("component templates are grouped and machine-readable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "excalibur-canvas-"));
  const store = new CanvasStore(directory);
  await store.init();
  const board = await store.addComponents("components", 0, [
    { template: "color", title: "Brand blue", content: "#1864ab", x: 10, y: 20 },
    { template: "typography", title: "Display", content: "Build something clear" },
    { template: "design_element", title: "Primary button", content: "Use for the main action", inspiration: "Quiet, high-contrast controls" },
    { template: "website_section", title: "Hero", content: "Explain the product promise", inspiration: "Editorial landing pages" },
  ]);

  const components = Map.groupBy(board.scene.elements, element => String((element.customData as { canvasComponent: { id: string } }).canvasComponent.id));
  expect(components.size).toBe(4);
  expect([...components.values()].map(elements => (elements[0]!.customData as { canvasComponent: { template: string } }).canvasComponent.template)).toEqual([
    "color", "typography", "design_element", "website_section",
  ]);
  expect(board.scene.elements.find(element => (element.customData as { canvasComponent: { role: string } }).canvasComponent.role === "swatch")).toMatchObject({ backgroundColor: "#1864ab", x: 34, y: 124 });
  const appended = await store.addComponents("components", board.revision, [{ template: "typography", title: "Body", content: "Readable at every size" }]);
  expect(appended.scene.elements.at(-4)).toMatchObject({ type: "rectangle", x: 80, y: 880 });
  await expect(store.addComponents("components", appended.revision, [{ template: "website_section", title: "Footer", content: "Close the page" }])).rejects.toThrow("inspiration is required");

  store.close();
  await rm(directory, { recursive: true, force: true });
});

test("canvases can be created, searched, listed, and deleted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "excalibur-canvas-"));
  const store = new CanvasStore(directory);
  await store.init();

  store.createBoard("Homepage study");
  const board = await store.addNote("Homepage study", 0, "Editorial hero direction");
  store.addFeedback(board.id, "comment", String(board.scene.elements[0]!.id), "Try a quieter headline");
  store.createBoard("Pricing ideas");

  expect(store.listBoards().map(item => item.id).sort()).toEqual(["Homepage study", "Pricing ideas"]);
  expect(store.listBoards("editorial")[0]).toMatchObject({ id: "Homepage study", elementCount: 1, feedbackCount: 1 });
  expect(store.listBoards("quieter")[0]?.id).toBe("Homepage study");
  expect(() => store.createBoard("Homepage study")).toThrow("already exists");

  await store.deleteBoard("Homepage study");
  expect(store.listBoards().map(item => item.id)).toEqual(["Pricing ideas"]);
  await expect(store.deleteBoard("Homepage study")).rejects.toThrow("Canvas not found");

  store.close();
  await rm(directory, { recursive: true, force: true });
});
