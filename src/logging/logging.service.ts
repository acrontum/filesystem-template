import EventEmitter from 'events';

export const LogLevels = {
  none: 0,
  error: 1,
  trace: 1,
  warn: 2,
  info: 3,
  log: 4,
  debug: 5,
};

export interface StreamEvent {
  stream: NodeJS.WriteStream;
  message: string;
  args: any[];
}

export interface ColourOpts {
  bold?: boolean;
  stream?: NodeJS.WriteStream;
}

export class LoggingService {
  emitter: EventEmitter;
  context: string;

  constructor(context?: string, public level?: keyof typeof LogLevels) {
    this.context = context || new Error().stack.split('\n')[2].match(/\/(?<caller>[^\/:]+)\.[tj]s:/).groups.caller;
    this.emitter = new EventEmitter();
  }

  log(...args: any): void {
    return this.logIfAble('log', ...args);
  }

  info(...args: any): void {
    return this.logIfAble('info', ...args);
  }

  warn(...args: any): void {
    return this.logIfAble('warn', ...args);
  }

  error(...args: any): void {
    return this.logIfAble('error', ...args);
  }

  trace(...args: any): void {
    return this.logIfAble('trace', ...args);
  }

  debug(...args: any): void {
    return this.logIfAble('debug', ...args);
  }

  red(s: string, opts?: ColourOpts): string {
    return this.colour(`\x1b[31${opts?.bold ? ';1' : ''}m`, s, (opts?.stream || process.stderr)?.isTTY);
  }

  grn(s: string, opts?: ColourOpts): string {
    return this.colour(`\x1b[32${opts?.bold ? ';1' : ''}m`, s, (opts?.stream || process.stdout)?.isTTY);
  }

  ylw(s: string, opts?: ColourOpts): string {
    return this.colour(`\x1b[33${opts?.bold ? ';1' : ''}m`, s, (opts?.stream || process.stderr)?.isTTY);
  }

  blu(s: string, opts?: ColourOpts): string {
    return this.colour(`\x1b[36${opts?.bold ? ';1' : ''}m`, s, (opts?.stream || process.stdout)?.isTTY);
  }

  write(message: string, stream: NodeJS.WriteStream, pos?: { x: number; y: number }): void {
    if (typeof pos?.x === 'number' && typeof pos?.y === 'number') {
      if (pos.x < 0) {
        pos.x = stream.columns - 1 + pos.x;
      }
      if (pos.y < 0) {
        pos.y = stream.rows - 1 + pos.y;
      }
      stream.write(`\x1b[${pos.y};${pos.x}H\x1b[2K${message.slice(0, stream.columns)}\x1b[0;0m`);

      return;
    }

    stream.write(message);
  }

  stream(handler: (event: StreamEvent, logger: this) => string): void {
    this.emitter.addListener('log', (event) => handler(event, this));
  }

  getLevel(): number {
    return LogLevels[this.level ?? (process.env.FST_LOG as keyof typeof LogLevels)];
  }

  private colour(escape: string, message: string, isTty: boolean = true): string {
    return this.useEscapeCodes(isTty) ? `${escape}${message}\x1b[0;0m` : message;
  }

  private useEscapeCodes(isTty: boolean): boolean {
    return process.env.TERM !== 'dumb' && process.env.CI !== 'true' && isTty;
  }

  private logIfAble(level: keyof typeof LogLevels, ...args: any[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const { message, stream } = this.getPrintContext(level);
    if (this.emitter.listenerCount('log') === 0 || !this.useEscapeCodes(stream.isTTY) || LogLevels[level] <= LogLevels.trace) {
      stream.write(message);
      console[level as 'log'](...args);
    } else {
      this.emitter.emit('log', { stream, message, args });
    }
  }

  private shouldLog(level: keyof typeof LogLevels): boolean {
    const maximum = LogLevels[this.level ?? (process.env.FST_LOG as keyof typeof LogLevels)] ?? LogLevels.info;

    if (maximum === -1 || LogLevels[level] > maximum) {
      return false;
    }

    return true;
  }

  private getPrintContext(level: keyof typeof LogLevels): { message: string; stream: NodeJS.WriteStream } {
    let colourLevel = `${level.slice(0, 1).toUpperCase()}`;

    switch (LogLevels[level]) {
      case LogLevels.error:
      case LogLevels.trace:
        return {
          message: `${new Date().toISOString()} ${this.red(colourLevel, { stream: process.stderr })} [${this.context}] `,
          stream: process.stderr,
        };
      case LogLevels.warn:
        return {
          message: `${new Date().toISOString()} ${this.ylw(colourLevel)} [${this.context}] `,
          stream: process.stdout,
        };
      case LogLevels.log:
        return {
          message: `${new Date().toISOString()} ${this.blu(colourLevel, { bold: true })} [${this.context}] `,
          stream: process.stdout,
        };
      default:
        return {
          message: `${new Date().toISOString()} ${colourLevel} [${this.context}] `,
          stream: process.stdout,
        };
    }
  }
}
