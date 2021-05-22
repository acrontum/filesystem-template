export const LogLevels = {
  none: 0,
  error: 1,
  trace: 1,
  warn: 2,
  info: 3,
  log: 4,
  debug: 5,
};

/**
 * This class describes a logging service.
 *
 * @class LoggingService (name)
 */
export class LoggingService {
  constructor(private context: string, private level?: keyof typeof LogLevels) {}

  /**
   * { function_description }
   *
   * @param {any}  args  The arguments
   */
  log(...args: any): void {
    return this.bindLog('log').apply(console, args);
  }

  /**
   * { function_description }
   *
   * @param {any}  args  The arguments
   */
  info(...args: any): void {
    return this.bindLog('info').apply(console, args);
  }

  /**
   * { function_description }
   *
   * @param {any}  args  The arguments
   */
  warn(...args: any): void {
    return this.bindLog('warn').apply(console, args);
  }

  /**
   * { function_description }
   *
   * @param {any}  args  The arguments
   */
  error(...args: any): void {
    return this.bindLog('error').apply(console, args);
  }

  /**
   * { function_description }
   *
   * @param {any}  args  The arguments
   */
  trace(...args: any): void {
    return this.bindLog('trace').apply(console, args);
  }

  /**
   * { function_description }
   *
   * @param {any}  args  The arguments
   */
  debug(...args: any): void {
    return this.bindLog('debug').apply(console, args);
  }

  /**
   * { function_description }
   *
   * @param  {string}  s  { parameter_description }
   *
   * @return {string}  { description_of_the_return_value }
   */
  red(s: string): string {
    return `\x1b[31m${s}\x1b[0;0m`;
  }

  /**
   * { function_description }
   *
   * @param  {string}  s  { parameter_description }
   *
   * @return {string}  { description_of_the_return_value }
   */
  grn(s: string): string {
    return `\x1b[32m${s}\x1b[0;0m`;
  }

  /**
   * { function_description }
   *
   * @param  {string}  s  { parameter_description }
   *
   * @return {string}  { description_of_the_return_value }
   */
  ylw(s: string): string {
    return `\x1b[33m${s}\x1b[0;0m`;
  }

  /**
   * { function_description }
   *
   * @param  {string}  s  { parameter_description }
   *
   * @return {string}  { description_of_the_return_value }
   */
  blu(s: string): string {
    return `\x1b[34m${s}\x1b[0;0m`;
  }

  /**
   * { function_description }
   *
   * @param  {keyof typeof LogLevels}  level  The level
   *
   * @return {typeof console.log}      { description_of_the_return_value }
   */
  private bindLog(level: keyof typeof LogLevels): typeof console.log {
    const target = LogLevels[this.level || (process.env.FST_LOG as keyof typeof LogLevels) || 'info'];

    if (target !== -1 && LogLevels[level] <= target) {
      return console[level as 'log'].bind(console, `${level.slice(0, 1).toUpperCase()} [${this.context}]`);
    }

    return () => null;
  }
}
