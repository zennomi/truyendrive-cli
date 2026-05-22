# `truyendrive-cli`

Encrypt images into a sibling `truyendrive/` directory using scanline scrambling by default, with a legacy XOR-noise transform still available. Encrypted folders can be decrypted back into a colocated `decrypted/` directory.

## Install

```bash
npm install
npm run build
```

## Publish

For maintainers:

```bash
npm login
npm version patch
npm publish
```

After publish, anyone can run:

```bash
npx truyendrive-cli <directory>
```

If you want to verify the exact tarball before publishing:

```bash
npm pack --dry-run
```

## Usage

```bash
npx truyendrive-cli <directory> [--decrypt] [--mode folder|subfolder] [--encryption scanline|noise] [--key KEY] [--batch-size N] [--compression-level 0-9] [--effort 1-10] [--overwrite] [--no-copy-other-files] [--no-generate-password-file]
```

Options:

- `directory`: required source directory
- `--decrypt`: reverse encryption for an already-encrypted `truyendrive/<name>/` source directory
- `--mode`: `folder` or `subfolder`, defaults to `folder`
- `--encryption`: `scanline` or `noise`, defaults to `scanline`
- `--key`: PRNG seed key, defaults to `truyendrive`
- `--copy-other-files` / `--no-copy-other-files`: copy non-image files to destination, defaults to `--copy-other-files`
- `--no-generate-password-file`: disable generation of `.password.<key>.<method>.truyendrive` in destination if none found in source
- `--batch-size`: maximum number of concurrent image jobs per unit
- `--compression-level`: PNG compression level from `0` to `9`, defaults to `6`
- `--effort`: PNG encoder effort from `1` to `10`, defaults to `7`
- `--overwrite` / `--no-overwrite`: defaults to `--no-overwrite`
## Layout

- `folder` mode writes to `parent(directory)/truyendrive/<directory-name>/`
- `subfolder` mode writes each immediate child folder to `parent(directory)/truyendrive/<directory-name>/<child-name>/`
- decrypt mode writes to `parent(encrypted-directory)/decrypted/<encrypted-directory-name>/`

Only supported image files are processed. Output filenames preserve the source basename and normalize the extension to `.png`.

Encryption methods:

- `scanline`: pixel-only reversible scrambling that rolls/reverses each row with keyed offsets while preserving PNG compression better than full row shuffling.
- `noise`: legacy XOR-noise transform; this usually creates much larger PNG files.

## Development

```bash
npm test
```
