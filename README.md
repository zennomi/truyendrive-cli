# `truyendrive-cli`

Encrypt images into a sibling `truyendrive/` directory using the XOR-noise transform from the provided browser example.

## Install

```bash
npm install
npm run build
```

## Usage

```bash
npx truyendrive-cli <directory> [--mode folder|subfolder] [--key KEY] [--batch-size N] [--overwrite]
```

Options:

- `directory`: required source directory
- `--mode`: `folder` or `subfolder`, defaults to `folder`
- `--key`: PRNG seed key, defaults to `truyendrive`
- `--batch-size`: maximum number of concurrent image jobs per unit
- `--overwrite` / `--no-overwrite`: defaults to `--no-overwrite`

## Layout

- `folder` mode writes to `parent(directory)/truyendrive/<directory-name>/`
- `subfolder` mode writes each immediate child folder to `parent(directory)/truyendrive/<directory-name>/<child-name>/`

Only supported image files are processed. Output filenames preserve the source basename and normalize the extension to `.png`.

## Development

```bash
npm test
```
