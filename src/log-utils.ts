import { LoggingService, StreamEvent } from './lib';

export class LogBuffer {
  logs: LoggingService[];
  initial: number;
  enabled: boolean;

  constructor(enabled: boolean) {
    this.logs = [];
    this.enabled = enabled && ['', 'info', 'warn', 'error', 'none'].includes(process.env.FST_LOG || '');
  }

  async init(loggers?: LoggingService[]): Promise<void> {
    if (!this.enabled) {
      return;
    }

    this.initial = (await this.getCursorPos()).y - 1;

    for (const logger of loggers || []) {
      this.add(logger);
    }
  }

  add(logger: LoggingService): void {
    if (!this.enabled) {
      return;
    }

    this.logs.push(logger);
    logger.stream(this.getLogHandler());
  }

  complete(): void {
    if (!this.enabled) {
      return;
    }

    const lastLine = this.initial + this.logs.length + 1;
    const trailer = lastLine > process.stdout.rows ? '\n' : '';
    process.stdout.write(`\x1b[${lastLine};0H${trailer}`);
  }

  private async getCursorPos(): Promise<{ x: number; y: number }> {
    if (!this.enabled) {
      return;
    }

    return new Promise((resolve) => {
      process.stdin.setEncoding('utf8');
      process.stdin.setRawMode(true);
      process.stdin.once('readable', () => {
        const buf = process.stdin.read();
        const str = JSON.stringify(buf); // "\u001b[9;1R"
        const [_, y, x] = str.split(/[\[;R]/).map(Number);

        process.stdin.setRawMode(false);

        return resolve({ x, y });
      });
      process.stdout.write('\u001b[6n');
    });
  }

  private getLogHandler(): (event: StreamEvent, logService: LoggingService) => string {
    const insertPos = this.logs.length;

    const desiredPrintLine = this.initial + insertPos;
    if (desiredPrintLine > process.stdout.rows) {
      process.stdout.write(`\x1b[${process.stdout.rows};0H\n`);
    }

    return (event: StreamEvent, logService: LoggingService): string => {
      const message = [event.message, ...(event.args || [])].join(' ');

      const newlinesAdded = Math.max(0, this.initial + this.logs.length - event.stream.rows);
      const newPrintLine = desiredPrintLine - newlinesAdded;

      logService.write(message, event.stream, { x: 1, y: newPrintLine });

      return message;
    };
  }
}
