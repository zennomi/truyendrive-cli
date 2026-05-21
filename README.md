# `truyendrive-cli`

Encrypt images into a sibling `truyendrive/` directory using deterministic 32x32 tile shuffle encryption by default, with legacy row shuffle and XOR-noise transforms still available. Encrypted folders can be decrypted back into a colocated `decrypted/` directory.

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
npx truyendrive-cli <directory> [--decrypt] [--mode folder|subfolder] [--encryption tiles|shuffle|noise] [--key KEY] [--batch-size N] [--compression-level 0-9] [--effort 1-10] [--ignore-alpha] [--lossless-webp] [--overwrite] [--no-copy-other-files] [--no-generate-password-file]
```

Options:

- `directory`: required source directory
- `--decrypt`: reverse encryption for an already-encrypted `truyendrive/<name>/` source directory
- `--mode`: `folder` or `subfolder`, defaults to `folder`
- `--encryption`: `tiles`, `shuffle`, or `noise`, defaults to `tiles`. `tiles` shuffles 32x32 pixel blocks, `shuffle` performs legacy row shuffle, and `noise` performs legacy XOR noise.
- `--key`: PRNG seed key, defaults to `truyendrive`
- `--copy-other-files` / `--no-copy-other-files`: copy non-image files to destination, defaults to `--copy-other-files`
- `--generate-password-file` / `--no-generate-password-file`: generate `.password.<key>.<method>.truyendrive` in destination if none found in source, defaults to `--generate-password-file`
- `--batch-size`: maximum number of concurrent image jobs per unit
- `--compression-level`: PNG compression level from `0` to `9`, defaults to `6`
- `--effort`: PNG encoder effort from `1` to `10`, defaults to `7`
- `--ignore-alpha`: strip the alpha channel and write 3-channel RGB output
- `--lossless-webp`: output lossless WebP files instead of PNG files
- `--overwrite` / `--no-overwrite`: defaults to `--no-overwrite`
## Layout

- `folder` mode writes to `parent(directory)/truyendrive/<directory-name>/`
- `subfolder` mode writes each immediate child folder to `parent(directory)/truyendrive/<directory-name>/<child-name>/`
- decrypt mode writes to `parent(encrypted-directory)/decrypted/<encrypted-directory-name>/`

Only supported image files are processed. Output filenames preserve the source basename and normalize the extension to `.png` by default, or `.webp` with `--lossless-webp`.

## Development

```bash
npm test
```
