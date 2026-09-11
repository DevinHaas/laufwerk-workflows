import { expect, test } from "bun:test";
import { chooseRepresentativePages, normalizeHours, normalizePublicUrl, paybackMonths, quoteRange, slugify } from "./potential-customer-analysis";

test("potential customer analysis keeps public inputs and commercial math deterministic", () => {
  expect(normalizePublicUrl("example.com/path#section").toString()).toBe("https://example.com/path");
  for (const value of ["file:///etc/passwd", "https://user:secret@example.com"]) expect(() => normalizePublicUrl(value)).toThrow();
  expect(slugify("Müller & Söhne AG")).toBe("muller-sohne-ag");
  expect(chooseRepresentativePages(new URL("https://example.com/"), [
    "/privacy", "/about", "/contact", "https://other.example/pricing", "/products/widget", "/blog/news",
  ], 3)).toEqual(["https://example.com/", "https://example.com/contact", "https://example.com/products/widget"]);
  expect(quoteRange({ low: 10, likely: 20, high: 30 }, 40)).toEqual({ low: 400, likely: 800, high: 1200 });
  expect(normalizeHours({ low: 30, likely: 10, high: 20 })).toEqual({ low: 10, likely: 20, high: 30 });
  expect(() => normalizeHours({ low: -1, likely: 10, high: 20 })).toThrow();
  expect(paybackMonths(800, 229, 29)).toBe(4);
  expect(paybackMonths(800, 29, 29)).toBeNull();
});
