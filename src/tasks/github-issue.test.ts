import { test, expect } from "bun:test";
import { issueNumber, requireEligible } from "./github-issue";

test("only an open issue in this repository with the exact afk label is eligible", () => {
  for (const value of ["3", "#3", "https://github.com/DevinHaas/bleat/issues/3"]) expect(issueNumber(value)).toBe(3);
  for (const value of ["0", "-3", "3; echo bad", "https://github.com/other/repo/issues/3", "9007199254740992"]) {
    expect(() => issueNumber(value)).toThrow();
  }
  const issue = { number: 3, title: "Test", body: "Test", url: "https://github.com/DevinHaas/bleat/issues/3", state: "OPEN", labels: [{ name: "afk" }] };
  expect(requireEligible(issue)).toBe(issue);
  expect(() => requireEligible({ ...issue, state: "CLOSED" })).toThrow();
  expect(() => requireEligible({ ...issue, labels: [] })).toThrow();
  expect(() => requireEligible({ ...issue, labels: [{ name: "AFK" }] })).toThrow();
});
