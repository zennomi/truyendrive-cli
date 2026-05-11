import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { xorNoiseRgba } from "./crypto";
import {
  countDestinationPngs,
  detectOutputCollisions,
  getOutputFilename,
  listDestinationPngPaths,
  listSupportedImages,
} from "./units";
import type { CliOptions, ProcessingUnit, UnitResult } from "./types";

type Logger = (message: string) => void;

interface UnitContext {
  unit: ProcessingUnit;
  options: CliOptions;
  logger: Logger;
}

export async function processUnits(
  units: ProcessingUnit[],
  options: CliOptions,
  logger: Logger = console.log,
): Promise<{ hasFailures: boolean; results: UnitResult[] }> {
  const results: UnitResult[] = [];

  for (const unit of units) {
    const result = await processUnit({ unit, options, logger });
    results.push(result);
    logger(formatUnitResult(result));
  }

  return {
    hasFailures: results.some((result) => result.status === "fail"),
    results,
  };
}

export function formatUnitResult(result: UnitResult): string {
  switch (result.status) {
    case "done":
      return `DONE ${result.unit.label} (${result.processedCount ?? 0} processed)`;
    case "skip":
      return `SKIP ${result.unit.label} (${result.sourceCount} source, ${result.destinationCount ?? 0} png outputs)`;
    case "empty":
      return `EMPTY ${result.unit.label}`;
    case "fail":
      return `FAIL ${result.unit.label} (${result.reason ?? "unknown error"})`;
    default:
      return `FAIL ${result.unit.label} (unexpected result)`;
  }
}

async function processUnit(context: UnitContext): Promise<UnitResult> {
  const { unit, options } = context;

  try {
    const sourceFilenames = await listSupportedImages(unit.sourceDir);
    const sourceCount = sourceFilenames.length;

    if (sourceCount === 0) {
      return {
        status: "empty",
        unit,
        sourceCount,
      };
    }

    const collisions = detectOutputCollisions(sourceFilenames);
    if (collisions.length > 0) {
      return {
        status: "fail",
        unit,
        sourceCount,
        reason: `basename collision after .png normalization: ${collisions.join(", ")}`,
      };
    }

    const destinationExists = await pathExists(unit.destinationDir);
    if (!options.overwrite && destinationExists) {
      const destinationCount = await countDestinationPngs(unit.destinationDir);
      if (destinationCount === sourceCount) {
        return {
          status: "skip",
          unit,
          sourceCount,
          destinationCount,
        };
      }
    }

    await mkdir(unit.destinationDir, { recursive: true });
    await clearDestinationPngs(unit.destinationDir);

    await runBounded(
      sourceFilenames,
      options.batchSize,
      async (filename) => processSingleImage(unit, filename, options.key),
    );

    return {
      status: "done",
      unit,
      sourceCount,
      processedCount: sourceCount,
    };
  } catch (error) {
    return {
      status: "fail",
      unit,
      sourceCount: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function processSingleImage(
  unit: ProcessingUnit,
  filename: string,
  key: string,
): Promise<void> {
  const sourcePath = join(unit.sourceDir, filename);
  const destinationPath = join(unit.destinationDir, getOutputFilename(filename));

  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const encrypted = xorNoiseRgba(data, key);

  await sharp(encrypted, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toFile(destinationPath);
}

async function clearDestinationPngs(directory: string): Promise<void> {
  const pngPaths = await listDestinationPngPaths(directory);
  await Promise.all(pngPaths.map((filePath) => rm(filePath, { force: true })));
}

async function runBounded<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  const runners = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      await worker(items[currentIndex]);
    }
  });

  await Promise.all(runners);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    const pathStat = await stat(path);
    return pathStat.isDirectory();
  } catch {
    return false;
  }
}
