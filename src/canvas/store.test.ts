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
  await expect(store.addNote("test", 0, "stale")).rejects.toBeInstanceOf(RevisionConflict);
  store.addFeedback("test", "keep", String(updated.scene.elements[0]!.id));
  store.addFeedback("test", "comment", undefined, "Use this rhythm");
  expect(store.readFeedback("test").map(event => event.action)).toEqual(["keep", "comment"]);
  store.close();
  await rm(directory, { recursive: true, force: true });
});
