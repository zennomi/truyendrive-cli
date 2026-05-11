import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../src/cli";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("truyendrive-cli integration", () => {
  it("writes folder mode outputs into sibling truyendrive directory", async () => {
    const root = await makeTempDir("folder");
    await createPng(join(root, "one.png"), [255, 0, 0, 255]);
    await createPng(join(root, "two.png"), [0, 255, 0, 255]);
    await writeFile(join(root, "ignored.txt"), "ignore");

    const logs: string[] = [];
    const exitCode = await runCli([root, "--batch-size", "2"], pushLog(logs), pushLog(logs));

    const outputDir = join(root, "..", "truyendrive", root.split("/").pop() as string);
    const outputs = (await readdir(outputDir)).sort();

    expect(exitCode).toBe(0);
    expect(outputs).toEqual(["one.png", "two.png"]);
    expect(logs).toContain(`DONE ${root.split("/").pop()} (2 processed)`);
  });

  it("processes only immediate child directories in subfolder mode", async () => {
    const root = await makeTempDir("subfolder");
    await mkdir(join(root, "chapter-1"));
    await mkdir(join(root, "chapter-2"));
    await mkdir(join(root, "chapter-1", "nested"));
    await createPng(join(root, "chapter-1", "a.png"), [10, 20, 30, 255]);
    await createPng(join(root, "chapter-2", "b.png"), [40, 50, 60, 255]);
    await createPng(join(root, "chapter-1", "nested", "c.png"), [70, 80, 90, 255]);

    const logs: string[] = [];
    const exitCode = await runCli(
      [root, "--mode", "subfolder", "--batch-size", "1"],
      pushLog(logs),
      pushLog(logs),
    );

    const outputRoot = join(root, "..", "truyendrive", root.split("/").pop() as string);

    expect(exitCode).toBe(0);
    expect(await exists(join(outputRoot, "chapter-1", "a.png"))).toBe(true);
    expect(await exists(join(outputRoot, "chapter-2", "b.png"))).toBe(true);
    expect(await exists(join(outputRoot, "chapter-1", "nested", "c.png"))).toBe(false);
    expect(logs).toContain(`DONE ${root.split("/").pop()}/chapter-1 (1 processed)`);
    expect(logs).toContain(`DONE ${root.split("/").pop()}/chapter-2 (1 processed)`);
  });

  it("skips a unit when overwrite is false and png counts match", async () => {
    const root = await makeTempDir("skip");
    await createPng(join(root, "one.png"), [255, 0, 0, 255]);
    await createPng(join(root, "two.png"), [0, 255, 0, 255]);

    const firstLogs: string[] = [];
    expect(await runCli([root], pushLog(firstLogs), pushLog(firstLogs))).toBe(0);

    const secondLogs: string[] = [];
    expect(await runCli([root], pushLog(secondLogs), pushLog(secondLogs))).toBe(0);
    expect(secondLogs).toContain(`SKIP ${root.split("/").pop()} (2 source, 2 png outputs)`);
  });

  it("reprocesses outputs when overwrite is true and removes stale png files", async () => {
    const root = await makeTempDir("overwrite");
    await createPng(join(root, "one.png"), [255, 0, 0, 255]);

    expect(await runCli([root], () => {}, () => {})).toBe(0);

    const outputDir = join(root, "..", "truyendrive", root.split("/").pop() as string);
    await createPng(join(outputDir, "stale.png"), [0, 0, 0, 255]);

    await createPng(join(root, "two.png"), [0, 0, 255, 255]);
    const logs: string[] = [];

    expect(await runCli([root, "--overwrite"], pushLog(logs), pushLog(logs))).toBe(0);

    const outputs = (await readdir(outputDir)).sort();

    expect(outputs).toEqual(["one.png", "two.png"]);
    expect(await exists(join(outputDir, "stale.png"))).toBe(false);
    expect(logs).toContain(`DONE ${root.split("/").pop()} (2 processed)`);
  });

  it("continues after a failed unit and returns exit code 1", async () => {
    const root = await makeTempDir("fail");
    await mkdir(join(root, "bad"));
    await mkdir(join(root, "good"));
    await createPng(join(root, "bad", "same.png"), [255, 255, 0, 255]);
    await createPng(join(root, "good", "ok.png"), [0, 255, 255, 255]);
    await writeFile(join(root, "bad", "same.jpg"), await readFile(join(root, "bad", "same.png")));

    const logs: string[] = [];
    const exitCode = await runCli(
      [root, "--mode", "subfolder"],
      pushLog(logs),
      pushLog(logs),
    );

    const outputRoot = join(root, "..", "truyendrive", root.split("/").pop() as string);

    expect(exitCode).toBe(1);
    expect(logs.some((line) => line.startsWith(`FAIL ${root.split("/").pop()}/bad`))).toBe(true);
    expect(logs).toContain(`DONE ${root.split("/").pop()}/good (1 processed)`);
    expect(await exists(join(outputRoot, "good", "ok.png"))).toBe(true);
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(os.tmpdir(), `truyendrive-cli-${prefix}-`));
  tempDirectories.push(directory);
  return directory;
}

async function createPng(filePath: string, rgba: [number, number, number, number]): Promise<void> {
  await sharp(Buffer.from(rgba), {
    raw: {
      width: 1,
      height: 1,
      channels: 4,
    },
  })
    .png()
    .toFile(filePath);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function pushLog(target: string[]): (message: string) => void {
  return (message) => {
    target.push(message);
  };
}
