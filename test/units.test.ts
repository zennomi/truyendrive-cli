import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  countDestinationPngs,
  detectOutputCollisions,
  discoverUnits,
  findPasswordFile,
  getOutputFilename,
  listOtherFiles,
  listSupportedImages,
} from "../src/units";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true })),
    ),
  );
});

describe("unit helpers", () => {
  it("normalizes output filenames to png", () => {
    expect(getOutputFilename("chapter-01.jpg")).toBe("chapter-01.png");
  });

  it("detects basename collisions after png normalization", () => {
    expect(detectOutputCollisions(["same.jpg", "same.png"])).toEqual(["same.jpg", "same.png"]);
  });

  it("discovers folder mode destination layout", async () => {
    const root = await makeTempDir("folder-mode");
    await writeFile(join(root, "a.jpg"), "image");

    const units = await discoverUnits(root, "folder");

    expect(units).toEqual([
      {
        label: basename(root),
        sourceDir: root,
        destinationDir: join(root, "..", "truyendrive", basename(root)),
      },
    ]);
  });

  it("discovers folder mode destination layout with a custom destination subpath", async () => {
    const root = await makeTempDir("custom-destination");
    await writeFile(join(root, "a.png"), "image");

    const units = await discoverUnits(root, "folder", "decrypted");

    expect(units).toEqual([
      {
        label: basename(root),
        sourceDir: root,
        destinationDir: join(root, "..", "decrypted", basename(root)),
      },
    ]);
  });

  it("discovers only immediate child directories in subfolder mode", async () => {
    const root = await makeTempDir("subfolder-mode");
    const childA = join(root, "a");
    const childB = join(root, "b");
    await mkdir(childA);
    await mkdir(childB);
    await mkdir(join(childA, "nested"));
    await writeFile(join(root, "ignored.jpg"), "image");

    const units = await discoverUnits(root, "subfolder");

    expect(units).toEqual([
      {
        label: `${basename(root)}/a`,
        sourceDir: childA,
        destinationDir: join(root, "..", "truyendrive", basename(root), "a"),
      },
      {
        label: `${basename(root)}/b`,
        sourceDir: childB,
        destinationDir: join(root, "..", "truyendrive", basename(root), "b"),
      },
    ]);
  });

  it("lists supported images and counts png outputs", async () => {
    const root = await makeTempDir("images");
    await writeFile(join(root, "a.jpg"), "image");
    await writeFile(join(root, "b.png"), "image");
    await writeFile(join(root, "c.heic"), "image");
    await writeFile(join(root, "ignored.txt"), "text");

    expect(await listSupportedImages(root)).toEqual(["a.jpg", "b.png", "c.heic"]);
    expect(await countDestinationPngs(root)).toBe(1);
  });

  it("treats .heif as a supported image", async () => {
    const root = await makeTempDir("heif");
    await writeFile(join(root, "photo.heif"), "image");
    await writeFile(join(root, "doc.pdf"), "not-image");

    expect(await listSupportedImages(root)).toEqual(["photo.heif"]);
    expect(await listOtherFiles(root)).toEqual(["doc.pdf"]);
  });

  it("finds password file keys", async () => {
    const root = await makeTempDir("password-file");
    await writeFile(join(root, ".password.secret.truyendrive"), "");

    expect(await findPasswordFile(root)).toBe("secret");
  });

  it("lists other files without images or password files", async () => {
    const root = await makeTempDir("other-files");
    await writeFile(join(root, "a.jpg"), "image");
    await writeFile(join(root, "b.txt"), "text");
    await writeFile(join(root, ".password.secret.truyendrive"), "");

    expect(await listOtherFiles(root)).toEqual(["b.txt"]);
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const directory = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(join(os.tmpdir(), `truyendrive-cli-${prefix}-`)),
  );
  tempDirectories.push(directory);
  return directory;
}
