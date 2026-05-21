import { readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import type { ProcessingMode, ProcessingUnit } from "./types";

export type OutputFormat = "png" | "webp";

export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".avif",
  ".heic",
  ".heif",
]);

export function isSupportedImageFile(filename: string): boolean {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.has(extension);
}

export function isOutputFile(filename: string, format: OutputFormat): boolean {
  return filename.toLowerCase().endsWith(`.${format}`);
}

export function isPasswordFile(filename: string): boolean {
  return /^\.password\.(.+)\.(shuffle|noise)\.truyendrive$/.test(filename);
}

export function getOutputFilename(sourceFilename: string, format: OutputFormat = "png"): string {
  const extensionIndex = sourceFilename.lastIndexOf(".");
  const basenameOnly =
    extensionIndex === -1 ? sourceFilename : sourceFilename.slice(0, extensionIndex);
  return `${basenameOnly}.${format}`;
}

export async function listSupportedImages(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isSupportedImageFile(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function findPasswordFile(directory: string): Promise<string | null> {
  const entries = await readdir(directory, { withFileTypes: true });
  const passwordFile = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
    .find((filename) => isPasswordFile(filename));

  if (!passwordFile) {
    return null;
  }

  return passwordFile.match(/^\.password\.(.+)\.(shuffle|noise)\.truyendrive$/)?.[1] ?? null;
}

export async function listOtherFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() && !isSupportedImageFile(entry.name) && !isPasswordFile(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function countDestinationOutputs(
  directory: string,
  format: OutputFormat,
): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && isOutputFile(entry.name, format)).length;
}

export async function listDestinationOutputPaths(
  directory: string,
  format: OutputFormat,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isOutputFile(entry.name, format))
    .map((entry) => join(directory, entry.name));
}

export function detectOutputCollisions(
  filenames: string[],
  format: OutputFormat = "png",
): string[] {
  const seen = new Map<string, string>();
  const collisions = new Set<string>();

  for (const filename of filenames) {
    const target = getOutputFilename(filename, format);
    const collisionKey = target.toLowerCase();
    const existing = seen.get(collisionKey);

    if (existing) {
      collisions.add(existing);
      collisions.add(filename);
      continue;
    }

    seen.set(collisionKey, filename);
  }

  return Array.from(collisions).sort((left, right) => left.localeCompare(right));
}

export async function discoverUnits(
  directory: string,
  mode: ProcessingMode,
  destinationSubPath = "truyendrive",
): Promise<ProcessingUnit[]> {
  const rootDirectory = resolve(directory);
  const rootName = basename(rootDirectory);
  const baseDestination = join(dirname(rootDirectory), destinationSubPath, rootName);

  if (mode === "folder") {
    return [
      {
        label: rootName,
        sourceDir: rootDirectory,
        destinationDir: baseDestination,
      },
    ];
  }

  const entries = await readdir(rootDirectory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      label: `${rootName}/${entry.name}`,
      sourceDir: join(rootDirectory, entry.name),
      destinationDir: join(baseDestination, entry.name),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
