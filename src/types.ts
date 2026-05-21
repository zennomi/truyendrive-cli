export type ProcessingMode = "folder" | "subfolder";
export type EncryptionMethod = "tiles" | "shuffle" | "noise" | "packed";
export type Action = "encrypt" | "decrypt";

export const DEFAULT_KEY = "truyendrive";

export interface CliOptions {
  directory: string;
  action: Action;
  mode: ProcessingMode;
  encryption: EncryptionMethod;
  key: string;
  batchSize: number;
  overwrite: boolean;
  copyOtherFiles: boolean;
  generatePasswordFile: boolean;
  compressionLevel: number;
  effort: number;
  ignoreAlpha: boolean;
  losslessWebp: boolean;
}

export interface ProcessingUnit {
  label: string;
  sourceDir: string;
  destinationDir: string;
}

export type UnitStatus = "done" | "skip" | "empty" | "fail";

export interface UnitResult {
  status: UnitStatus;
  unit: ProcessingUnit;
  sourceCount: number;
  destinationCount?: number;
  processedCount?: number;
  reason?: string;
}
