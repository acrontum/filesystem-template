// https://github.com/nodejs/node/issues/53661
const oldError = console.error;
const oldWarn = console.warn;
console.error = (...args: unknown[]) => oldError('\x1b[0;0m', ...args);
console.warn = (...args: unknown[]) => oldWarn('\x1b[0;0m', ...args);
