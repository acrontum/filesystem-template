#!/usr/bin/env node

import { resolve } from 'path';
import './console-patch';
import { fst } from './fst';
import { CliError, RecipeOptions, RecipeSchema } from './lib';
import { LoggingService } from './logging';

export interface CliOptions extends RecipeOptions {
  buffered?: boolean;
  help?: boolean;
  recipe?: string[];
  verbose?: string[];
  quiet?: string[];
  cache?: boolean;
  parallel?: number;
  exclude?: string[];
  data?: unknown;
  _?: string[];
}

export interface OptionCallback {
  option: any;
  options: Record<string, any>;
  args: any[];
  arg: string;
}

export interface ProgramOption {
  onOption: (opts: OptionCallback) => any;
  alias?: string;
  help?: string | [string, string];
  default?: any;
  positional?: number;
}

export class Program {
  options: Record<string, any> = { _: [] };

  private help: { entries: [string, string][]; len: number };
  private config: Record<string, ProgramOption & { name: string }> = {};

  constructor(private name: string) {
    this.help = { entries: [], len: 0 };
  }

  get<T = string>(optionName: keyof CliOptions): T {
    return this.options[optionName];
  }

  set(key: `--${keyof CliOptions}`, opt: ProgramOption): this {
    const config = opt as ProgramOption & { name: string; help: [string, string] };
    config.name = key.replace(/^\-\-?/, '');

    this.config[key] = config;
    if (opt.alias) {
      this.config[opt.alias] = config;
    }

    this.options[config.name] = opt.default;

    if (!config.help) {
      return this;
    }

    if (!Array.isArray(config.help)) {
      config.help = ['', config.help];
    }

    const help = `${[opt.alias, key].filter(Boolean).join(', ')} ${opt.help[0] ?? ''}`;
    this.help.entries.push([help, config.help[1]]);
    this.help.len = Math.max(this.help.len, help.length);

    return this;
  }

  consume(argv: string[]): { type: string; message: string } {
    const args = argv.slice().reverse();

    while (args.length) {
      const [arg, value] = args.pop().split('=');
      const isOpt = arg.charAt(0) === '-';

      if (isOpt && arg.charAt(1) !== '-' && arg.length > 2 && !value) {
        args.push(...[...arg.slice(1)].map((a) => `-${a}`));
        continue;
      }

      if (value) {
        args.push(value);
      }

      if (isOpt && arg.charAt(1) !== '-' && value) {
        return { type: 'error', message: `cannot combine '=' and short options '${arg}=${value}'` };
      }

      if (arg === '-h' || arg === '--help') {
        this.options.help = true;

        return null;
      }

      const config = isOpt ? this.config[arg] : this.config['_'];

      if (config) {
        try {
          this.options[config.name] = config.onOption({
            option: this.options[config.name],
            options: this.options,
            arg,
            args: args.splice(args.length - (config.positional ?? 0), config.positional ?? 0),
          });
        } catch (e: any) {
          return { type: 'error', message: e?.message };
        }
        continue;
      }

      if (isOpt) {
        return { type: 'unknown arg', message: `unknown option '${arg}'` };
      }

      this.options._.push(arg);
      continue;
    }

    return null;
  }

  usage(): string {
    const help = this.help.entries.reduce(
      (usage, [option, message]) => `${usage}\n  ${option.padEnd(this.help.len + 3)} ${message}`,
      `${this.name}\n\noptions:`,
    );

    return `\x1b[0;0m${help}`;
  }
}

const logger = new LoggingService('cli');

const getProgram = () => {
  return new Program('fst <options | RECIPE>')
    .set('--cache', {
      onOption: () => true,
      alias: '-c',
      help: 'Do not delete fetched files between runs',
      default: false,
    })
    .set('--output', {
      onOption: ({ args }) => args[0],
      alias: '-o',
      positional: 1,
      help: ['PATH', 'Folder to output files'],
    })
    .set('--parallel', {
      onOption: ({ args }) => {
        const parallel = parseInt(args[0], 10);
        if (Number.isNaN(parallel) || parallel < 1) {
          throw new CliError(`parallel must be a number greater than 0, received ${args[0]}`);
        }

        return parallel;
      },
      alias: '-p',
      default: 10,
      positional: 1,
      help: ['COUNT', 'Max number of concurrent recipe parsing (default 10)'],
    })
    .set('--recipe', {
      onOption: ({ option, args }) => (option || []).concat(args[0]),
      positional: 1,
      alias: '-r',
      help: ['RECIPE', 'Add recipe to builder (file or URL)'],
      default: [],
    })
    .set('--quiet', {
      onOption: (arg) => (arg.option || []).concat(''),
      alias: '-q',
      help: 'Log less verbosely',
    })
    .set('--verbose', {
      onOption: (arg) => (arg.option || []).concat(''),
      alias: '-v',
      help: 'Log more verbosely',
    })
    .set('--exclude', {
      onOption: (arg) => (arg.option || []).concat(arg.args[0].split(',').map((x: string) => x.trim())),
      alias: '-e',
      help: ['PATHS', 'Skip PATHS in template generation (default node_modules,.git)'],
      positional: 1,
    })
    .set('--buffered', {
      onOption: () => logger.useEscapeCodes(process.stdout.isTTY),
      alias: '-b',
      help: 'Enable log buffering (default false). Ignored if not tty, CI=true, or TERM=dumb',
      default: false,
      positional: 0,
    })
    .set('--data', {
      onOption: ({ args }) => {
        try {
          return JSON.parse(args[0]);
        } catch (e) {
          console.error(`Invalid data format: expected json string, received "${args[0]}"`);
          process.exit(1);
        }
      },
      alias: '-d',
      help: ['DATA', 'Provide json DATA to recipes (eg -d \'{"name": "my recipe"}\')'],
      default: null,
      positional: 1,
    });
};

const programToOptions = (program: Program): CliOptions => {
  return {
    cache: program.get('cache'),
    parallel: program.get('parallel'),
    output: program.get('output'),
    exclude: program.get('exclude'),
    buffered: program.get('buffered'),
  };
};

export const cli = async (args: string[]): Promise<number> => {
  const program = getProgram();
  const err = program.consume(args.slice());

  if (program.get('help')) {
    console.log(program.usage());

    return 0;
  }

  if (err) {
    console.error(`${err.message}\n\n${program.usage()}`);

    return 1;
  }

  const cliRecipes = program.get<string[]>('_').concat(program.get<string[]>('recipe'));
  if (!cliRecipes.length) {
    console.error('at least one recipe or uri is required\n');
    console.error(program.usage());

    return 1;
  }

  if (typeof program.get('quiet') !== 'undefined') {
    process.env.FST_LOG = ['', 'warn', 'error', 'none'][Math.min(program.get('quiet').length || 1, 3)];
  } else if (typeof program.get('verbose') !== 'undefined') {
    process.env.FST_LOG = ['', 'log', 'debug'][Math.min(program.get('verbose').length || 1, 2)];
  }

  logger.debug({ program });

  const addRecipeData = (recipe: RecipeSchema): RecipeSchema => Object.assign({}, recipe, { data: program.get('data') });

  const recipes = cliRecipes.map((from) => {
    if (from[0] !== '{') {
      try {
        return addRecipeData(structuredClone(require(resolve(from))));
      } catch (e) {
        return addRecipeData({ from });
      }
    }

    try {
      return addRecipeData(JSON.parse(from));
    } catch (e) {
      return addRecipeData({ from });
    }
  });

  await fst(recipes, programToOptions(program));

  return 0;
};

if (require.main === module) {
  cli(process.argv.slice(2))
    .then((exitCode) => process.exit(exitCode))
    .catch(() => process.exit(1));
}
