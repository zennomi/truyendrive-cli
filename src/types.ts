export type ProcessingMode = "folder" | "subfolder";

export const DEFAULT_KEY = "truyendrive";

export interface CliOptions {
  directory: string;
  mode: ProcessingMode;
  key: string;
  batchSize: number;
  overwrite: boolean;
  copyOtherFiles: boolean;
  generatePasswordFile: boolean;
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
