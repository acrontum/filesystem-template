#!/usr/bin/env node

import { fst } from './index';
import { LoggingService, minimist } from './lib';

const logger = new LoggingService('cli');

export interface RecipeOptions {
  recursive?: boolean;
  output?: string;
  include?: string[];
  exclude?: string[];
  imports?: string[];
  cache?: boolean;
  parallel?: number;
}

export interface CliOptions extends RecipeOptions {
  help?: boolean;
  recipe?: string[];
  verbose?: string[];
  silent?: string[];
}

const usage = `fst [options | PATH]
options
  -h, --help           Show this menu
  -r, --recipe URI     Add recipe to builder (file or URL)

these options apply to all recipe files
  -c, --cache          Use local copies of repos when possible
  -C, --no-cache       Override cache fetching
  -e, --exclude PATH   pattern?
  -I, --imports PATH   pattern? File or folder to add to builder (can be called multiple times)
  -i, --include PATH   pattern?
  -p, --parallel NUM   Max number of concurrent recipe parsing (default 10)
  -o, --output PATH    Path to output files
  -R, --recursive      Recursively seach for recipes
  -s, --silent         Log less verbosely
  -v, --verbose        Log more verbosely
`;

const booleans = ['h', 'help', 'R', 'recursive', 'c', 'cache', 'C', 'no-cache', 'S', 'sync'];
const strings = ['recipe', 'r', 'I', 'imports', 'i', 'include', 'e', 'exclude', 'o', 'output', 'v', 'verbose', 's', 'silent', 'p', 'parallel'];
const alias: Record<string, string> = { r: '_', recipe: '_' };
const args = booleans.concat(strings);

for (let i = 0; i < args.length; i += 2) {
  if (args[i] !== 'r' && args[i] !== 'recipe') {
    alias[args[i]] = args[i + 1];
  }
}
/**
 * { function_description }
 *
 * @param  {CliOptions}     input  The input
 *
 * @return {RecipeOptions}  The recipe options.
 */
const cliToRecipe = (input: CliOptions): RecipeOptions => {
  return ['recursive', 'output', 'include', 'exclude', 'imports', 'cache', 'sync', 'parallel'].reduce((rOpts: RecipeOptions, key: string) => {
    if (key in input) {
      (rOpts as any)[key] = (input as any)[key];
    }

    return rOpts;
  }, {});
};

/**
 * { function_description }
 */
export const cli = async () => {
  const options = minimist<CliOptions>(process.argv.slice(2), {
    default: {
      parallel: 10,
    },
    unknown(opt, _ctx) {
      if (!/^-/.test(opt)) {
        return true;
      }

      logger.error(`unknown option '${opt}'\n\n${usage}`);
      process.exit(1);
    },
    boolean: booleans,
    string: strings,
    alias,
  });

  if (options.help) {
    logger.log(usage);
    process.exit(0);
  }

  if (!options._?.length) {
    logger.error('at least one recipe or uri is required\n');
    logger.error(usage);
    process.exit(1);
  }

  if (typeof options.silent !== 'undefined') {
    process.env.FST_LOG = ['', 'warn', 'error', 'none'][Math.min(options.silent.length || 1, 3)];
  } else if (typeof options.verbose !== 'undefined') {
    process.env.FST_LOG = ['', 'log', 'debug'][Math.min(options.verbose.length || 1, 2)];
  }

  if ((options as any)['no-cache']) {
    options.cache = false;
  }

  if (options.parallel) {
    const parallel = parseInt(`${options.parallel}`, 10);
    if (Number.isNaN(parallel) || !/^[0-9]+$/.test(`${options.parallel}`) || parallel < 1) {
      logger.error(`parallel must be a number greater than 0, received ${options.parallel}`);
      process.exit(1);
    }
    options.parallel = parallel;
  }

  logger.debug({ options });

  await fst(options._, cliToRecipe(options));
};

if (require.main === module) {
  cli().catch((e) => logger.error(e));
}
