import { exec, ExecOptions } from 'child_process';
import { existsSync, promises, statSync } from 'fs';
import { copyFile } from 'fs/promises';
import { basename, join, resolve, sep } from 'path';
import { CliOptions } from '../cli';
import { LoggingService, LogLevels } from '../logging';
import { InvalidSchemaError } from './errors';
import { exists, fetchSource, generateVirtualFileTree, isRecipeFile, isRepo, SourceOptions } from './fs-utils';
import { Renderer } from './renderer';
import { jsonMerge } from './util';

export type RenderFunction = (recipe: Recipe, renderer: Renderer) => Promise<void> | void;

export interface RecipeSchema {
  /**
   * unique name of the recipe (for use with depends and passing data between files)
   */
  name?: string;
  /**
   * file, recipe, path to file(s), url, or repository to fetch templates from
   */
  from?: string;
  /**
   * output folder
   */
  to?: string;
  /**
   * arbitrary data store
   */
  data?: any;
  /**
   * array of names of other recipes which must be built first
   */
  depends?: string[];
  /**
   * lifecycle cli / shell commands
   */
  scripts?: { before?: string; after?: string };
  /**
   * path to render handler js file or handler function
   */
  fileHandler?: string | RenderFunction;
  /**
   * dependent / sub recipes
   */
  recipes?: RecipeSchema[];
  /**
   * list of files/folders to skip when copying or generating
   */
  exclude?: string[];
  /**
   * when cloning, only clone certain folders
   */
  includeDirs?: string[];
}

export interface RecipeOptions {
  output?: string;
  previousOutput?: string;
  exclude?: string[];
}

export class Recipe implements RecipeSchema {
  data?: any;
  depends?: string[];
  exclude?: string[];
  fileHandler?: string | RenderFunction;
  from?: string;
  includeDirs?: string[];
  name?: string;
  recipes?: RecipeSchema[];
  scripts?: { before?: string; after?: string };
  to?: string;
  parent?: Recipe;

  /** Path to intermediate download location (eg .fst/localhost/name/) */
  source: string;
  schema: RecipeSchema;
  logger: LoggingService;
  previousOutput: string;
  type: 'disk' | 'repo' | 'url' | 'stub';
  map: Record<string, Recipe>;
  generated: boolean = false;
  parsed: boolean = false;

  start: number;
  waiting: number;

  runtime: number;
  waittime: number;

  constructor(schema: RecipeSchema, map?: Record<string, Recipe>, options?: RecipeOptions) {
    this.loadSchema(schema, options || {});
    this.logger = new LoggingService(`R:${this.name}`);
    this.map = map || {};
    this.map[this.name] = this;
  }

  parse(): boolean {
    if (this.parsed) {
      return true;
    }

    this.parsed = true;

    if (!this.from) {
      this.type = 'stub';

      return true;
    }

    try {
      return !!this.tryParseUrl();
    } catch (e) {}

    const fullSourcePath = resolve(this.from[0] === '/' ? this.from : join(this.previousOutput || '.', this.from));
    if (!existsSync(fullSourcePath)) {
      if (this.hasPendingDependency()) {
        return (this.parsed = false);
      }

      const { recipes, ...rest } = this.toJSON();
      this.logger.error({ message: 'Source not found', recipe: rest });
      throw new InvalidSchemaError('Source not found');
    }

    this.from = fullSourcePath;
    this.type = 'disk';

    if (!statSync(fullSourcePath).isFile()) {
      return true;
    }

    const data = require(fullSourcePath) as RecipeSchema | RecipeSchema[];
    this.from = null;
    this.type = 'stub';

    this.recipes.push(...(Array.isArray(data) ? data : [data]));

    return true;
  }

  async run(options?: CliOptions & SourceOptions): Promise<string[]> {
    this.logger.info('running');
    const sources = await this.generate(options);
    if (sources !== null) {
      this.generated = true;

      this.runtime = Date.now() - this.start;
      const timing = [`${this.runtime}ms`];
      if (this.waiting && this.start !== this.waiting) {
        this.waittime = Date.now() - this.waiting;
        timing.push(`${this.waittime - this.runtime}ms waiting`);
      }

      this.logger.info(this.logger.grn(`done (${timing.join(', ')})`));
    } else {
      this.logger.info('waiting');
    }

    return sources;
  }

  runRecipeScript(script: 'before' | 'after', env: Record<string, string> = {}): Promise<string> {
    if (!this.scripts?.[script]) {
      return null;
    }

    const cwd = this.to || '.';

    return new Promise(async (resolve, reject) => {
      this.logger.info(`'${script}' ${this.logger.ylw(this.scripts[script], { stream: process.stdout })}`);

      const options: ExecOptions = { cwd: cwd || '.', env: { ...process.env, ...env } };
      const proc = exec(this.scripts[script], options, (error, stdout, stderr) => (error ? reject({ error, stdout, stderr }) : resolve(stdout)));

      if (this.logger.getLevel() > LogLevels.info) {
        proc.stdout.pipe(process.stdout);
      }
      proc.stderr.pipe(process.stderr);
    });
  }

  toJSON(): Partial<Recipe> {
    const { map, logger, ...rest } = this;

    return rest;
  }

  hasPendingDependency(): boolean {
    return !!this.depends.find((dep) => !this.map[dep]?.generated);
  }

  private async generate(options?: CliOptions & SourceOptions): Promise<string[]> {
    if (this.hasPendingDependency()) {
      this.waiting ||= Date.now();
      return null;
    }
    this.start = Date.now();

    const { recipes, ...rest } = this.toJSON();
    this.logger.log('runRecipe:', this.logger.blu(JSON.stringify(rest, null, 2), { bold: true }));

    const sourceDirs: string[] = [];

    if (this.type === 'stub') {
      await promises.mkdir(this.to, { recursive: true });
      await this.runRecipeScript('before');
      await this.runRecipeScript('after');

      return sourceDirs;
    }

    this.source = await fetchSource(this.from, { subdirs: this.includeDirs, cache: options?.cache, packageRoot: options?.packageRoot });
    if (this.type == 'repo' || this.type == 'url') {
      sourceDirs.push(this.source);
    }

    if (this.type === 'url') {
      if (isRecipeFile(this.source)) {
        await promises.mkdir(this.to, { recursive: true });

        /*
        @TODO: figure out a better way to handle from: some.fstr.json
        ideally, data and other options should be passed in / merged to the current one for generation
        {
          "name": "test",
          "from": "something.fstr.json",
          "scripts": { ... },
          "data": { ... }
        }
        */

        const next = structuredClone(require(this.source));
        // todo: make sure this merges properly
        next.name = this.name;
        next.scripts = this.scripts;
        next.depends = this.depends;
        next.data = jsonMerge(next.data, this.data);
        // console.dir({next}, { depth: null });
        // console.dir({ 'this.recipes':this.recipes }, { depth: null });
        this.recipes = [next, ...(this.recipes || [])];

        return sourceDirs;
      }

      let outfile = this.to ?? './';
      if (outfile.endsWith(sep)) {
        outfile = join(outfile, basename(this.from));
      }
      await copyFile(this.source, outfile);

      return sourceDirs;
    }

    await promises.mkdir(this.to, { recursive: true });

    const root = await generateVirtualFileTree(this.source, { exclude: this.exclude });
    const renderer = new Renderer(root, this.to);

    await this.runRecipeScript('before', { FST_SRC: this.source });

    if (typeof this.fileHandler === 'string') {
      if (!(await exists(this.fileHandler))) {
        await require(join(this.source, this.fileHandler))(this, renderer);
      } else {
        await require(resolve(this.fileHandler))(this, renderer);
      }
    } else if (typeof this.fileHandler === 'function') {
      await this.fileHandler(this, renderer);
    }

    await renderer.renderTree();

    await this.runRecipeScript('after', { FST_SRC: this.source });

    return sourceDirs;
  }

  private loadSchema(schema: RecipeSchema, options: RecipeOptions): this {
    this.schema = JSON.parse(JSON.stringify(schema));
    if (Array.isArray(this.schema)) {
      throw new InvalidSchemaError('schema top level cannot be array');
    }
    // append number if name exists in map?
    this.name = schema.name || schema.from || schema.to || 'unnamed recipe';

    this.data = schema.data;
    this.depends ||= schema.depends || [];
    this.fileHandler = schema.fileHandler;
    this.from = schema.from?.replace('$PWD', process.cwd());
    this.recipes = schema.recipes || [];
    this.scripts = schema.scripts;
    this.to = schema.to?.[0] === '/' ? schema.to : join(options.output || '.', schema.to || '.');
    this.previousOutput = options.previousOutput || process.cwd();
    this.exclude = options?.exclude ? (schema.exclude || []).concat(options.exclude) : schema.exclude;
    this.includeDirs = schema.includeDirs;
    this.type = null;
    this.source = this.from;

    return this;
  }

  private tryParseUrl(): this {
    const url = new URL(this.from);
    this.type = isRepo(url.pathname) ? 'repo' : 'url';

    return this;
  }
}
