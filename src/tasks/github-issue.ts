import { Activity } from "@effect/workflow";
import { Effect, Schema } from "effect";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const repository = "DevinHaas/bleat";
const Issue = Schema.Struct({ number: Schema.Number, title: Schema.String, body: Schema.String,
  state: Schema.String, url: Schema.String, labels: Schema.Array(Schema.Struct({ name: Schema.String })) });

export function issueNumber(value: string): number {
  const match = /^(?:https:\/\/github\.com\/DevinHaas\/bleat\/issues\/|#)?([1-9]\d*)\/?$/.exec(value.trim());
  const number = Number(match?.[1]);
  if (!match || !Number.isSafeInteger(number)) throw new Error(`Provide an issue number or URL in ${repository}`);
  return number;
}

export function requireEligible(issue: typeof Issue.Type) {
  if (issue.state !== "OPEN" || !issue.labels.some(label => label.name === "afk")) {
    throw new Error(`Issue #${issue.number} must be open and have the exact label afk`);
  }
  return issue;
}

async function command(file: string, args: string[], cwd?: string) {
  const result = await exec(file, args, { cwd, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  return result.stdout.trim();
}

async function fetchIssue(number: number) {
  const json = await command("gh", ["issue", "view", String(number), "--repo", repository,
    "--json", "number,title,body,state,url,labels"]);
  return requireEligible(Schema.decodeUnknownSync(Schema.parseJson(Issue))(json));
}

export const loadIssue = (value: string) => Activity.make({
  name: "load-eligible-issue", success: Issue, error: Schema.String,
  execute: Effect.tryPromise({ try: () => fetchIssue(issueNumber(value)), catch: String }),
});

export const prepareClone = (number: number, executionKey: string) => Activity.make({
  name: "prepare-clone", success: Schema.Struct({ path: Schema.String, branch: Schema.String, base: Schema.String }),
  error: Schema.String,
  execute: Effect.tryPromise({ try: async () => {
    const key = createHash("sha256").update(`${number}:${executionKey}`).digest("hex").slice(0, 20);
    const branch = `laufwerk/issue-${number}-${key}`;
    const path = resolve("laufwerk/.runs", key);
    await mkdir(join(path, ".."), { recursive: true });
    if (!await stat(join(path, ".git")).then(() => true, () => false)) {
      await command("git", ["clone", `https://github.com/${repository}.git`, path]);
    }
    const base = (await command("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], path)).replace("refs/remotes/origin/", "");
    const current = await command("git", ["branch", "--show-current"], path);
    if (current !== branch) await command("git", ["switch", "-c", branch], path);
    return { path, branch, base };
  }, catch: String }),
});

export const publishPullRequest = (issue: typeof Issue.Type,
  clone: { path: string; branch: string; base: string }, verify: string) => Activity.make({
  name: "publish-pull-request", success: Schema.String, error: Schema.String,
  execute: Effect.tryPromise({ try: async () => {
    await fetchIssue(issue.number);
    const existing = await command("gh", ["pr", "list", "--repo", repository, "--head", clone.branch,
      "--state", "all", "--json", "url", "--jq", ".[0].url // empty"]);
    if (existing) return existing;
    if (await command("git", ["branch", "--show-current"], clone.path) !== clone.branch) {
      throw new Error("Implementation changed the working branch; refusing to publish");
    }
    await command("git", ["add", "--all"], clone.path);
    if (await command("git", ["diff", "--cached", "--name-only"], clone.path)) {
      await command("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", `Implement issue #${issue.number}`], clone.path);
    }
    if (await command("git", ["rev-parse", "HEAD"], clone.path) === await command("git", ["rev-parse", `origin/${clone.base}`], clone.path)) {
      throw new Error("No implementation changes to publish");
    }
    await command("git", ["push", "origin", `HEAD:refs/heads/${clone.branch}`], clone.path);
    return command("gh", ["pr", "create", "--repo", repository, "--base", clone.base, "--head", clone.branch,
      "--title", `Fix #${issue.number}: ${issue.title}`, "--body",
      `Closes #${issue.number}\n\nImplemented by the manually triggered Laufwerk workflow.\n\nVerification passed:\n\n\`\`\`text\n${verify}\n\`\`\`\n\nReady for human review.`]);
  }, catch: String }),
});
