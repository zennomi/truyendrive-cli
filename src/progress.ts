const DEFAULT_TERMINAL_COLUMNS = 80;
const MIN_BAR_WIDTH = 10;
const MAX_BAR_WIDTH = 40;

export class ProgressBar {
  private readonly total: number;
  private lastCompleted = 0;
  private hasRendered = false;

  constructor(
    private readonly label: string,
    total: number,
    private readonly stream: NodeJS.WriteStream = process.stderr,
    private readonly countLabel?: string,
  ) {
    this.total = Math.max(0, total);
  }

  update(completed: number): void {
    this.lastCompleted = clamp(completed, 0, this.total);
    this.render(this.lastCompleted);
  }

  finish(): void {
    if (!this.hasRendered || this.lastCompleted !== this.total) {
      this.render(this.total);
    }

    if (this.isTty()) {
      this.stream.write("\n");
    }

    this.hasRendered = false;
  }

  clear(): void {
    if (this.isTty()) {
      this.stream.write("\r\x1b[K");
    }
    this.hasRendered = false;
  }

  private render(completed: number): void {
    const text = this.isTty() ? this.formatTty(completed) : this.formatPlain(completed);
    this.stream.write(this.isTty() ? `\r\x1b[K${text}` : `${text}\n`);
    this.hasRendered = true;
  }

  private formatTty(completed: number): string {
    const stats = this.formatStats(completed);
    const fixedWidth = this.label.length + stats.length + 4;
    const terminalColumns = process.stdout.columns ?? this.stream.columns ?? DEFAULT_TERMINAL_COLUMNS;
    const barWidth = clamp(terminalColumns - fixedWidth, MIN_BAR_WIDTH, MAX_BAR_WIDTH);
    const filledWidth = this.total === 0 ? barWidth : Math.round((completed / this.total) * barWidth);
    const emptyWidth = barWidth - filledWidth;

    return `${this.label} [${"█".repeat(filledWidth)}${"░".repeat(emptyWidth)}] ${stats}`;
  }

  private formatPlain(completed: number): string {
    return `${this.label}: ${this.formatStats(completed)}`;
  }

  private formatStats(completed: number): string {
    if (this.countLabel) {
      return `${completed}/${this.total} ${this.countLabel}`;
    }

    return `${completed}/${this.total} (${this.percentage(completed)}%)`;
  }

  private percentage(completed: number): number {
    if (this.total === 0) {
      return 100;
    }

    return Math.round((completed / this.total) * 100);
  }

  private isTty(): boolean {
    return this.stream.isTTY === true;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
