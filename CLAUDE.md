# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install dependencies: `npm install`
- Build the CLI: `npm run build`
- Run the full test suite: `npm test`
- Run one test file: `npx vitest run test/integration.test.ts`
- Run one named test: `npx vitest run -t "round-trips scanline encryption through decrypt mode"`
- Run the built CLI locally: `node dist/cli.js <directory> [options]`
- Inspect the publish tarball: `npm pack --dry-run`

There is no lint script or lint configuration in `package.json`.

## High-level architecture

This repository is a small TypeScript CLI package compiled to CommonJS in `dist/`. The runtime path is: parse CLI args → discover filesystem processing units → transform each image with Sharp + the selected reversible transform → write PNG outputs into a sibling directory.

### Entry point and option handling

- `src/cli.ts` is the only CLI entry point. It uses Commander to parse flags, validates numeric options, resolves the input directory to an absolute path, and decides whether the run is `encrypt` or `decrypt`.
- A non-obvious detail is `encryptionExplicit`: the CLI records whether `--encryption` was actually passed. That allows the processor to distinguish “user explicitly asked for scanline/noise” from “use the default unless a password file says otherwise”.
- `getDefaultBatchSize()` caps concurrency at `min(os.availableParallelism(), 8)`.

### Filesystem layout and unit discovery

- `src/units.ts` owns directory discovery and output naming.
- `folder` mode treats the provided directory as one processing unit.
- `subfolder` mode only processes the immediate child directories of the provided directory; nested folders are not traversed as separate units.
- Encryption output goes to a sibling directory: `../truyendrive/<source-name>/`.
- Decryption output goes to a sibling directory: `../decrypted/<source-name>/`.
- All processed images are re-emitted as `.png`, so basename collisions like `same.jpg` + `same.png` are treated as fatal before processing starts.
- Supported source image formats are centralized in `SUPPORTED_IMAGE_EXTENSIONS` in `src/units.ts`.

### Processing pipeline

- `src/processor.ts` orchestrates all work.
- Processing units are handled sequentially, but images inside a unit are processed with bounded concurrency via `runBounded()` and the `--batch-size` option.
- Each image is read through Sharp as raw RGBA (`ensureAlpha().raw()`), transformed in memory, then written back as PNG with the requested `compressionLevel` and `effort`.
- `--overwrite` does not delete the whole destination directory; it only clears existing destination `.png` files before rewriting outputs.
- When `--overwrite` is not set, a unit is skipped if the destination directory already exists and its PNG count matches the source image count.
- Non-image files can be copied after image processing unless `--no-copy-other-files` is used.

### Encryption behavior

- `src/crypto.ts` contains the reversible transforms.
- `scanline` is the default method. It performs per-row keyed roll/reverse operations derived from the image dimensions and channel count, which preserves PNG compression better than the legacy approach.
- `noise` is the legacy XOR-based transform. It uses a seeded PRNG to mutate RGB bytes while leaving alpha bytes unchanged.
- Both methods are deterministic for the same key and image dimensions, and both are reversible.

### Password-file contract

- Password files are named `.password.<key>.<method>.truyendrive`.
- `src/units.ts` parses those files to recover both the key and the encryption method.
- During encryption, if the CLI key is still the default and no explicit `--encryption` was passed, the processor will prefer values from a source password file.
- During decryption, omitting `--key` and `--encryption` relies on the password file in the encrypted source directory.
- If encrypting and no password file exists in the source, the destination gets one by default unless `--no-generate-password-file` is set.

### Progress and logging

- `src/progress.ts` writes progress bars to `stderr`.
- In non-TTY environments, progress falls back to plain text lines.
- In `subfolder` mode with multiple units, `processUnits()` also renders an aggregate `[overall]` progress bar.
- Per-unit completion is logged as `DONE`, `SKIP`, `EMPTY`, or `FAIL`, and total elapsed time is logged at the end.

## Test structure

- `test/cli.test.ts` covers argument parsing and exit-code behavior.
- `test/crypto.test.ts` covers reversibility and determinism of the transforms.
- `test/units.test.ts` covers output layout, password-file parsing, file discovery, and collision detection.
- `test/progress.test.ts` covers TTY vs non-TTY progress rendering.
- `test/integration.test.ts` is the best place to understand real end-to-end behavior, including sibling output directories, overwrite/skip semantics, password-file inference, subfolder mode, and decrypt round-trips.
