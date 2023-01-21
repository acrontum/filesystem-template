#!/usr/bin/env node

import { resolve } from 'path';
import 'source-map-support/register';
import { fst } from './index';
import { RecipeOptions } from './lib';
import { CliError } from './lib/errors';
import { LoggingService } from './logging';

export interface CliOptions extends RecipeOptions {
  buffered?: boolean;
  help?: boolean;
  recipe?: string[];
  verbose?: string[];
  silent?: string[];
  cache?: boolean;
  parallel?: number;
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

  get<T = string>(optionName: string): T {
    return this.options[optionName];
  }

  set(key: string, opt: ProgramOption): this {
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
    return this.help.entries.reduce(
      (usage, [option, message]) => `${usage}\n  ${option.padEnd(this.help.len + 3)} ${message}`,
      `${this.name}\n\noptions:`,
    );
  }
}

const logger = new LoggingService('cli');

const getProgram = () => {
  return new Program('fst <options | RECIPE>')
    .set('--cache', {
      onOption: () => true,
      alias: '-c',
      help: 'Use local copies of repos when possible',
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
    .set('--recursive', {
      onOption: () => true,
      alias: '-R',
      default: false,
      help: 'Recursively seach for recipes',
    })
    .set('--silent', {
      onOption: () => [''],
      alias: '-s',
      help: 'Log less verbosely',
    })
    .set('--verbose', {
      onOption: (arg) => (arg.option || []).concat(''),
      alias: '-v',
      help: 'Log more verbosely',
    })
    .set('--dry-run', {
      onOption: () => true,
    })
    .set('--exclude', {
      onOption: (arg) => (arg.option || []).concat(arg.args),
      alias: '-e',
      help: ['PATH', 'Skip PATH in template generation'],
      positional: 1,
    })
    .set('--buffered', {
      onOption: () => true,
      alias: '-b',
      help: 'Buffer log output',
      default: false,
      positional: 0,
    });
};

const programToOptions = (program: Program): CliOptions => {
  return {
    buffered: program.get('buffered'),
    help: program.get('help'),
    verbose: program.get('verbose'),
    silent: program.get('silent'),
    cache: program.get('cache'),
    parallel: program.get('parallel'),
    output: program.get('output'),
  };
};

export const cli = async () => {
  const program = getProgram();
  const err = program.consume(process.argv.slice(2));

  if (err) {
    console.error(`${err.message}\n\n${program.usage()}`);
    process.exit(1);
  }

  if (program.get('help')) {
    console.log(program.usage());
    process.exit(0);
  }

  const cliRecipes = program.get<string[]>('_').concat(program.get<string[]>('recipe'));
  if (!cliRecipes.length) {
    console.error('at least one recipe or uri is required\n');
    console.error(program.usage());
    process.exit(1);
  }

  if (typeof program.get('silent') !== 'undefined') {
    process.env.FST_LOG = ['', 'warn', 'error', 'none'][Math.min(program.get('silent').length || 1, 3)];
  } else if (typeof program.get('verbose') !== 'undefined') {
    process.env.FST_LOG = ['', 'log', 'debug'][Math.min(program.get('verbose').length || 1, 2)];
  }

  logger.debug({ program });

  const recipes = cliRecipes.map((from) => {
    if (from[0] !== '{') {
      try {
        return require(resolve(from));
      } catch (e) {
        return { from };
      }
    }

    try {
      return JSON.parse(from);
    } catch (e) {
      return { from };
    }
  });

  await fst(recipes, programToOptions(program));
};

if (require.main === module) {
  cli().catch((e) => console.error(e));
}
