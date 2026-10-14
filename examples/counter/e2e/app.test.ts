import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, test } from "vitest";

// Runs the transform output served by the dev server in a real browser
const root = join(import.meta.dirname, "..");
let server: ViteDevServer;
let browser: Browser;
let page: Page;
const errors: string[] = [];

beforeAll(async () => {
  server = await createServer({
    root,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 5199 },
  });
  await server.listen();

  // The browser comes from nix. Do not let it load the host's libraries
  const { LD_LIBRARY_PATH: _, ...env } = process.env;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH!,
    args: ["--no-sandbox"],
    env: env as Record<string, string>,
  });
  page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(server.resolvedUrls!.local[0]!);
  await page.getByRole("heading", { name: "react-preprocessor" }).waitFor();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

test("counter", async () => {
  const counter = page.locator("p", { hasText: "now:" });
  await page.getByRole("button", { name: "inc" }).click();
  await page.getByRole("button", { name: "inc" }).click();
  await expect.poll(() => counter.textContent()).toContain("now: 2 / double: 4");
});

test("cart", async () => {
  const cart = page.locator("p", { has: page.locator("output") });
  await cart.locator("input").nth(0).fill("200");
  await cart.locator("input").nth(1).fill("3");
  await expect.poll(() => cart.locator("output").textContent()).toBe("600");
});

test("todos", async () => {
  const todos = page.locator("section");
  await todos.locator("input").first().fill("write tests");
  await todos.getByRole("button", { name: "add" }).click();
  await todos.locator("input").first().fill("ship");
  await todos.getByRole("button", { name: "add" }).click();
  await expect
    .poll(() => todos.locator("li").allTextContents())
    .toEqual(["write tests remove", "ship remove"]);
  await expect.poll(() => todos.locator("p").textContent()).toBe("2 left");

  await todos.locator("li").nth(1).getByRole("checkbox").check();
  await expect.poll(() => todos.locator("p").textContent()).toBe("1 left");

  await todos.locator("li").nth(0).getByRole("button", { name: "remove" }).click();
  await expect.poll(() => todos.locator("li").allTextContents()).toEqual(["ship remove"]);
  await expect.poll(() => todos.locator("li").getByRole("checkbox").isChecked()).toBe(true);
});

test("no errors in the browser", () => {
  expect(errors).toEqual([]);
});

test("editing a file that only holds types reloads the page", async () => {
  // Type-only imports are not in Vite's module graph. The plugin triggers the re-transform itself
  const file = join(root, "src/types.ts");
  const original = readFileSync(file, "utf8");
  try {
    const reloaded = page.waitForEvent("load", { timeout: 20_000 });
    writeFileSync(file, `${original}\n// touched by the E2E test\n`);
    await reloaded;
    const heading = page.getByRole("heading", { name: "react-preprocessor" });
    await heading.waitFor();
    expect(await heading.isVisible()).toBe(true);
  } finally {
    writeFileSync(file, original);
  }
});
