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
  -R, --recursive      Recursively seach for recipes
  -I, --imports PATH   pattern? File or folder to add to builder (can be called multiple times)
  -i, --include PATH   pattern?
  -e, --exclude PATH   pattern?
  -o, --output PATH    Path to output files
  -c, --cache          Use local copies of repos when possible
  -C, --no-cache       Override cache fetching
  -v, --verbose        Log more verbosely
  -s, --silent         Log less verbosely
`;

const booleans = ['h', 'help', 'R', 'recursive', 'c', 'cache', 'C', 'no-cache', 'S', 'sync'];
const strings = ['recipe', 'r', 'I', 'imports', 'i', 'include', 'e', 'exclude', 'o', 'output', 'v', 'verbose', 's', 'silent'];
const alias: Record<string, string> = { r: '_', recipe: '_' };
const args = booleans.concat(strings);

for (let i = 0; i < args.length; i += 2) {
  if (args[i] !== 'r' && args[i + 1] !== 'recipe') {
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
  return ['recursive', 'output', 'include', 'exclude', 'imports', 'cache', 'sync'].reduce((rOpts: RecipeOptions, key: string) => {
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
    default: {},
    unknown(opt, _ctx) {
      if (!/^-/.test(opt)) {
        return true;
      }

      console.error(`unknown option '${opt}'\n\n${usage}`);
      process.exit(1);
    },
    boolean: booleans,
    string: strings,
    alias,
  });

  if (options.help) {
    console.log(usage);
    process.exit(0);
  }

  if (!options._?.length) {
    console.error('at least one recipe or uri is required\n');
    console.error(usage);
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

  logger.debug(options);

  await fst(options._, cliToRecipe(options));
};

if (require.main === module) {
  cli().catch(console.error);
}
