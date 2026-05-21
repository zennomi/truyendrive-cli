import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import sharp from "sharp";

import { shuffleRowsRgba, unshuffleRowsRgba, xorNoiseRgba } from "./crypto";
import { ProgressBar } from "./progress";
import { DEFAULT_KEY } from "./types";
import {
  countDestinationOutputs,
  detectOutputCollisions,
  findPasswordFile,
  getOutputFilename,
  isOutputFile,
  listDestinationOutputPaths,
  listOtherFiles,
  listSupportedImages,
} from "./units";
import type { OutputFormat } from "./units";
import type {
  Action,
  CliOptions,
  EncryptionMethod,
  ProcessingUnit,
  UnitResult,
} from "./types";

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
  const startTime = performance.now();
  const results: UnitResult[] = [];
  const overallProgress =
    options.mode === "subfolder" && units.length > 1
      ? new ProgressBar("[overall]", units.length, process.stderr, "units")
      : null;
  let completedUnits = 0;

  for (const unit of units) {
    const result = await processUnit({ unit, options, logger });
    results.push(result);
    logger(formatUnitResult(result));
    overallProgress?.update(++completedUnits);
  }

  overallProgress?.finish();

  const elapsedMs = performance.now() - startTime;
  const elapsedSecs = (elapsedMs / 1000).toFixed(2);
  logger(`Total processing time: ${elapsedSecs}s`);

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
      return `SKIP ${result.unit.label} (${result.sourceCount} source, ${result.destinationCount ?? 0} outputs)`;
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
  const format: OutputFormat = options.losslessWebp ? "webp" : "png";

  try {
    const sourceFilenames = await listActionImages(
      unit.sourceDir,
      options.action,
      format,
    );
    const sourceCount = sourceFilenames.length;

    if (sourceCount === 0) {
      return {
        status: "empty",
        unit,
        sourceCount,
      };
    }

    const collisions = detectOutputCollisions(sourceFilenames, format);
    if (collisions.length > 0) {
      return {
        status: "fail",
        unit,
        sourceCount,
        reason: `basename collision after output normalization: ${collisions.join(", ")}`,
      };
    }

    const destinationExists = await pathExists(unit.destinationDir);
    if (!options.overwrite && destinationExists) {
      const destinationCount = await countDestinationOutputs(unit.destinationDir, format);
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
    await clearDestinationOutputs(unit.destinationDir, format);

    const passwordFileKey = await findPasswordFile(unit.sourceDir);
    const resolvedKey =
      options.key !== DEFAULT_KEY
        ? options.key
        : (passwordFileKey ?? options.key);

    if (
      options.action === "encrypt" &&
      options.generatePasswordFile &&
      passwordFileKey === null
    ) {
      await writeFile(
        join(unit.destinationDir, `.password.${resolvedKey}.${options.encryption}.truyendrive`),
        "",
      );
    }

    const progressBar = new ProgressBar(unit.label, sourceCount);
    let completed = 0;

    progressBar.update(completed);
    try {
      await runBounded(sourceFilenames, options.batchSize, async (filename) => {
        await processSingleImage(
          unit,
          filename,
          resolvedKey,
          options.encryption,
          options.action,
          options.compressionLevel,
          options.effort,
          options.ignoreAlpha,
          format,
        );
        progressBar.update(++completed);
      });
      progressBar.finish();
    } catch (error) {
      progressBar.clear();
      throw error;
    }

    if (options.copyOtherFiles) {
      const otherFiles = await listOtherFiles(unit.sourceDir);
      await Promise.all(
        otherFiles.map((filename) =>
          copyFile(
            join(unit.sourceDir, filename),
            join(unit.destinationDir, filename),
          ),
        ),
      );
    }

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
  encryptionMethod: EncryptionMethod,
  action: Action,
  compressionLevel: number,
  effort: number,
  ignoreAlpha: boolean,
  format: OutputFormat,
): Promise<void> {
  const sourcePath = join(unit.sourceDir, filename);
  const destinationPath = join(
    unit.destinationDir,
    getOutputFilename(filename, format),
  );

  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const encrypted =
    encryptionMethod === "noise"
      ? xorNoiseRgba(data, key)
      : action === "decrypt"
        ? unshuffleRowsRgba(data, info.width, info.height, info.channels, key)
        : shuffleRowsRgba(data, info.width, info.height, info.channels, key);

  let pipeline = sharp(encrypted, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  });

  if (ignoreAlpha) {
    pipeline = pipeline.removeAlpha();
  }

  pipeline =
    format === "webp"
      ? pipeline.webp({ lossless: true })
      : pipeline.png({ compressionLevel, effort });

  await pipeline.toFile(destinationPath);
}

async function listActionImages(
  directory: string,
  action: Action,
  format: OutputFormat,
): Promise<string[]> {
  const filenames = await listSupportedImages(directory);
  if (action === "encrypt") {
    return filenames;
  }

  return filenames.filter((filename) => isOutputFile(filename, format));
}

async function clearDestinationOutputs(
  directory: string,
  format: OutputFormat,
): Promise<void> {
  const outputPaths = await listDestinationOutputPaths(directory, format);
  await Promise.all(outputPaths.map((filePath) => rm(filePath, { force: true })));
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
