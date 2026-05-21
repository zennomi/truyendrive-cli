import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../src/cli";
import { TILE_SIZE, shuffleRowsRgba, shuffleTilesRgba, xorNoiseRgba } from "../src/crypto";
import { DEFAULT_KEY } from "../src/types";

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
    const outputs = (await readdir(outputDir)).filter((filename) => filename.endsWith(".png")).sort();

    expect(exitCode).toBe(0);
    expect(outputs).toEqual(["one.png", "two.png"]);
    expect(logs).toContain(`DONE ${root.split("/").pop()} (2 processed)`);
  });

  it("writes lossless webp outputs when requested", async () => {
    const root = await makeTempDir("lossless-webp");
    await createPng(join(root, "one.png"), [255, 0, 0, 255]);

    const exitCode = await runCli([root, "--lossless-webp"], () => {}, () => {});

    const outputDir = join(root, "..", "truyendrive", root.split("/").pop() as string);
    const outputPath = join(outputDir, "one.webp");
    const metadata = await sharp(outputPath).metadata();

    expect(exitCode).toBe(0);
    expect(await exists(join(outputDir, "one.png"))).toBe(false);
    expect(metadata.format).toBe("webp");
  });

  it("copies other files by default", async () => {
    const root = await makeTempDir("copy-other");
    await createPng(join(root, "one.png"), [255, 0, 0, 255]);
    await writeFile(join(root, "notes.txt"), "keep me");
    await writeFile(join(root, ".password.ignore.shuffle.truyendrive"), "");

    expect(await runCli([root], () => {}, () => {})).toBe(0);

    const outputDir = join(root, "..", "truyendrive", root.split("/").pop() as string);

    expect(await readFile(join(outputDir, "notes.txt"), "utf8")).toBe("keep me");
    expect(await exists(join(outputDir, ".password.ignore.shuffle.truyendrive"))).toBe(false);
  });

  it("writes RGB PNG output when alpha is ignored", async () => {
    const root = await makeTempDir("ignore-alpha");
    await createPng(join(root, "one.png"), [255, 0, 0, 128]);

    expect(
      await runCli(
        [root, "--ignore-alpha", "--compression-level", "3", "--effort", "1"],
        () => {},
        () => {},
      ),
    ).toBe(0);

    const outputPath = join(root, "..", "truyendrive", root.split("/").pop() as string, "one.png");
    const metadata = await sharp(outputPath).metadata();

    expect(metadata.channels).toBe(3);
  });

  it.skipIf(!sharp.format.heif.output)("processes .heic source files and outputs png", async () => {
    const root = await makeTempDir("heic");
    const sourcePath = join(root, "photo.heic");
    const rgba: [number, number, number, number] = [100, 150, 200, 255];
    await sharp(Buffer.from(rgba), {
      raw: {
        width: 1,
        height: 1,
        channels: 4,
      },
    })
      .heif({ compression: "av1" })
      .toFile(sourcePath);

    const exitCode = await runCli([root, "--encryption", "noise"], () => {}, () => {});
    const outputDir = join(root, "..", "truyendrive", root.split("/").pop() as string);

    expect(exitCode).toBe(0);
    expect(await exists(join(outputDir, "photo.png"))).toBe(true);

    const encryptedRgba = await readRawRgba(join(outputDir, "photo.png"));
    const expectedRgba = xorNoiseRgba(await readRawRgba(sourcePath), DEFAULT_KEY);
    expect(Array.from(encryptedRgba)).toEqual(Array.from(expectedRgba));
  });

  it("does not copy other files when disabled", async () => {
    const root = await makeTempDir("no-copy-other");
    await createPng(join(root, "one.png"), [255, 0, 0, 255]);
    await writeFile(join(root, "notes.txt"), "keep me");

    expect(await runCli([root, "--no-copy-other-files"], () => {}, () => {})).toBe(0);

    const outputDir = join(root, "..", "truyendrive", root.split("/").pop() as string);

    expect(await exists(join(outputDir, "notes.txt"))).toBe(false);
  });

  it("uses a source password file key when no key is provided", async () => {
    const root = await makeTempDir("password-key");
    const originalRgba = Buffer.from([12, 34, 56, 255]);
    await createPng(join(root, "one.png"), [12, 34, 56, 255]);
    await writeFile(join(root, ".password.mysecret.noise.truyendrive"), "");

    expect(await runCli([root, "--encryption", "noise"], () => {}, () => {})).toBe(0);

    const outputPath = join(root, "..", "truyendrive", root.split("/").pop() as string, "one.png");
    const encryptedRgba = await readRawRgba(outputPath);
    const expectedEncrypted = xorNoiseRgba(originalRgba, "mysecret");
    const decryptedRgba = xorNoiseRgba(encryptedRgba, "mysecret");

    expect(Array.from(encryptedRgba)).toEqual(Array.from(expectedEncrypted));
    expect(Array.from(decryptedRgba)).toEqual(Array.from(originalRgba));
  });

  it("prefers an explicit key over a source password file key", async () => {
    const root = await makeTempDir("explicit-key");
    const originalRgba = Buffer.from([12, 34, 56, 255]);
    await createPng(join(root, "one.png"), [12, 34, 56, 255]);
    await writeFile(join(root, ".password.filekey.noise.truyendrive"), "");

    expect(await runCli([root, "--key", "cli-key", "--encryption", "noise"], () => {}, () => {})).toBe(0);

    const outputPath = join(root, "..", "truyendrive", root.split("/").pop() as string, "one.png");
    const encryptedRgba = await readRawRgba(outputPath);
    const expectedEncrypted = xorNoiseRgba(originalRgba, "cli-key");

    expect(Array.from(encryptedRgba)).toEqual(Array.from(expectedEncrypted));
  });

  it("uses tile shuffle encryption by default", async () => {
    const root = await makeTempDir("tiles-default");
    const originalRgba = createTileIdRgba(64, 64, TILE_SIZE);
    await createRawPng(join(root, "tiles.png"), originalRgba, 64, 64);

    expect(await runCli([root], () => {}, () => {})).toBe(0);

    const outputPath = join(root, "..", "truyendrive", root.split("/").pop() as string, "tiles.png");
    const encryptedRgba = await readRawRgba(outputPath);
    const expectedEncrypted = shuffleTilesRgba(originalRgba, 64, 64, 4, DEFAULT_KEY);

    expect(Array.from(encryptedRgba)).toEqual(Array.from(expectedEncrypted));
  });

  it("round-trips shuffle encryption through decrypt mode", async () => {
    const root = await makeTempDir("shuffle-roundtrip");
    const originalRgba = Buffer.from([
      10, 11, 12, 255,
      20, 21, 22, 255,
      30, 31, 32, 255,
      40, 41, 42, 255,
    ]);
    await createRawPng(join(root, "rows.png"), originalRgba, 1, 4);

    expect(await runCli([root, "--key", "shuffle-secret"], () => {}, () => {})).toBe(0);

    const encryptedDir = join(root, "..", "truyendrive", root.split("/").pop() as string);

    expect(
      await runCli([encryptedDir, "--decrypt", "--key", "shuffle-secret"], () => {}, () => {}),
    ).toBe(0);

    const decryptedDir = join(encryptedDir, "..", "decrypted", root.split("/").pop() as string);
    const decryptedRgba = await readRawRgba(join(decryptedDir, "rows.png"));

    expect(Array.from(decryptedRgba)).toEqual(Array.from(originalRgba));
  });

  it("round-trips shuffle encryption through lossless webp decrypt mode", async () => {
    const root = await makeTempDir("webp-roundtrip");
    const originalRgba = Buffer.from([
      10, 11, 12, 255,
      20, 21, 22, 255,
      30, 31, 32, 255,
      40, 41, 42, 255,
    ]);
    await createRawPng(join(root, "rows.png"), originalRgba, 1, 4);

    expect(
      await runCli([root, "--key", "shuffle-secret", "--lossless-webp"], () => {}, () => {}),
    ).toBe(0);

    const encryptedDir = join(root, "..", "truyendrive", root.split("/").pop() as string);

    expect(await exists(join(encryptedDir, "rows.webp"))).toBe(true);
    expect(
      await runCli(
        [encryptedDir, "--decrypt", "--key", "shuffle-secret", "--lossless-webp"],
        () => {},
        () => {},
      ),
    ).toBe(0);

    const decryptedDir = join(encryptedDir, "..", "decrypted", root.split("/").pop() as string);
    const decryptedRgba = await readRawRgba(join(decryptedDir, "rows.webp"));

    expect(Array.from(decryptedRgba)).toEqual(Array.from(originalRgba));
  });

  it("round-trips noise encryption through decrypt mode", async () => {
    const root = await makeTempDir("noise-roundtrip");
    const originalRgba = Buffer.from([
      100, 110, 120, 255,
      130, 140, 150, 255,
    ]);
    await createRawPng(join(root, "pixels.png"), originalRgba, 2, 1);

    expect(
      await runCli([root, "--encryption", "noise", "--key", "noise-secret"], () => {}, () => {}),
    ).toBe(0);

    const encryptedDir = join(root, "..", "truyendrive", root.split("/").pop() as string);

    expect(
      await runCli(
        [encryptedDir, "--decrypt", "--encryption", "noise", "--key", "noise-secret"],
        () => {},
        () => {},
      ),
    ).toBe(0);

    const decryptedDir = join(encryptedDir, "..", "decrypted", root.split("/").pop() as string);
    const decryptedRgba = await readRawRgba(join(decryptedDir, "pixels.png"));

    expect(Array.from(decryptedRgba)).toEqual(Array.from(originalRgba));
  });

  it("writes decrypted output into a decrypted sibling under truyendrive", async () => {
    const root = await makeTempDir("decrypt-destination");
    await createPng(join(root, "one.png"), [12, 34, 56, 255]);

    expect(await runCli([root], () => {}, () => {})).toBe(0);

    const encryptedDir = join(root, "..", "truyendrive", root.split("/").pop() as string);

    expect(await runCli([encryptedDir, "--decrypt"], () => {}, () => {})).toBe(0);

    const decryptedDir = join(encryptedDir, "..", "decrypted", root.split("/").pop() as string);

    expect(await exists(join(decryptedDir, "one.png"))).toBe(true);
    expect(await exists(join(decryptedDir, ".password.truyendrive.shuffle.truyendrive"))).toBe(false);
  });

  it("auto-detects the key from a password file while decrypting", async () => {
    const root = await makeTempDir("decrypt-password");
    const originalRgba = Buffer.from([12, 34, 56, 255]);
    await createPng(join(root, "one.png"), [12, 34, 56, 255]);

    expect(
      await runCli([root, "--encryption", "noise", "--key", "auto-secret"], () => {}, () => {}),
    ).toBe(0);

    const encryptedDir = join(root, "..", "truyendrive", root.split("/").pop() as string);

    expect(
      await runCli([encryptedDir, "--decrypt", "--encryption", "noise"], () => {}, () => {}),
    ).toBe(0);

    const decryptedDir = join(encryptedDir, "..", "decrypted", root.split("/").pop() as string);
    const decryptedRgba = await readRawRgba(join(decryptedDir, "one.png"));

    expect(Array.from(decryptedRgba)).toEqual(Array.from(originalRgba));
  });

  it("generates a password file in destination by default", async () => {
    const root = await makeTempDir("generate-password");
    await createPng(join(root, "one.png"), [255, 0, 0, 255]);

    expect(await runCli([root, "--key", "newsecret"], () => {}, () => {})).toBe(0);

    const outputDir = join(root, "..", "truyendrive", root.split("/").pop() as string);

    expect(await exists(join(outputDir, ".password.newsecret.tiles.truyendrive"))).toBe(true);
  });

  it("does not generate a password file when disabled", async () => {
    const root = await makeTempDir("no-generate-password");
    await createPng(join(root, "one.png"), [255, 0, 0, 255]);

    expect(
      await runCli([root, "--key", "newsecret", "--no-generate-password-file"], () => {}, () => {}),
    ).toBe(0);

    const outputDir = join(root, "..", "truyendrive", root.split("/").pop() as string);
    const passwordFiles = (await readdir(outputDir)).filter((filename) =>
      /^\.password\..+\.(shuffle|noise)\.truyendrive$/.test(filename),
    );

    expect(passwordFiles).toEqual([]);
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
    expect(secondLogs).toContain(`SKIP ${root.split("/").pop()} (2 source, 2 outputs)`);
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

    const outputs = (await readdir(outputDir)).filter((filename) => filename.endsWith(".png")).sort();

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
  await createRawPng(filePath, Buffer.from(rgba), 1, 1);
}

async function createRawPng(filePath: string, rgba: Buffer, width: number, height: number): Promise<void> {
  await sharp(rgba, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toFile(filePath);
}

async function readRawRgba(filePath: string): Promise<Buffer> {
  return sharp(filePath).ensureAlpha().raw().toBuffer();
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

function createTileIdRgba(width: number, height: number, tileSize: number): Buffer {
  const output = Buffer.alloc(width * height * 4);
  const tilesPerRow = Math.ceil(width / tileSize);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tileIndex = Math.floor(y / tileSize) * tilesPerRow + Math.floor(x / tileSize);
      const offset = (y * width + x) * 4;
      output[offset] = tileIndex;
      output[offset + 1] = x % 256;
      output[offset + 2] = y % 256;
      output[offset + 3] = 255;
    }
  }

  return output;
}
