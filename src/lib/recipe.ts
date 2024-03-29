import { exec, ExecOptions } from 'child_process';
import { existsSync, promises, statSync } from 'fs';
import { join, resolve } from 'path';
import { CliOptions } from '../cli';
import { LoggingService, LogLevels } from '../logging';
import { InvalidSchemaError } from './errors';
import { exists, fetchSource, generateVirtualFileTree, isRecipeFile, isRepo, SourceOptions } from './fs-utils';
import { Renderer } from './renderer';

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
   * list of folders to skip when copying or generating
   */
  excludeDirs?: string[];
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
  excludeDirs?: string[];
  fileHandler?: string | RenderFunction;
  from?: string;
  includeDirs?: string[];
  name?: string;
  recipes?: RecipeSchema[];
  scripts?: { before?: string; after?: string };
  to?: string;

  schema: RecipeSchema;
  logger: LoggingService;
  previousOutput: string;
  type: 'disk' | 'repo' | 'url' | 'stub';
  map: Record<string, Recipe>;
  generated: boolean = false;
  parsed: boolean = false;

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
      this.logger.info(this.logger.grn('done'));
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
      return null;
    }

    const { recipes, ...rest } = this.toJSON();
    this.logger.log('runRecipe:', this.logger.blu(JSON.stringify(rest, null, 2), { bold: true }));

    const sourceDirs: string[] = [];

    await promises.mkdir(this.to, { recursive: true });

    if (this.type === 'stub') {
      await this.runRecipeScript('before');
      await this.runRecipeScript('after');

      return sourceDirs;
    }

    let source = await fetchSource(this.from, { subdirs: this.includeDirs, cache: options?.cache, packageRoot: options?.packageRoot });
    if (this.type == 'repo' || this.type == 'url') {
      sourceDirs.push(source);
    }

    if (this.type === 'url' && isRecipeFile(source)) {
      this.recipes = [require(source), ...(this.recipes || [])];

      return sourceDirs;
    }

    const root = await generateVirtualFileTree(source, { exclude: this.excludeDirs });
    const renderer = new Renderer(root, this.to);

    await this.runRecipeScript('before', { FST_SRC: source });

    if (typeof this.fileHandler === 'string') {
      if (!(await exists(this.fileHandler))) {
        await require(join(source, this.fileHandler))(this, renderer);
      } else {
        await require(resolve(this.fileHandler))(this, renderer);
      }
    } else if (typeof this.fileHandler === 'function') {
      await this.fileHandler(this, renderer);
    }

    await renderer.renderTree();

    await this.runRecipeScript('after', { FST_SRC: source });

    return sourceDirs;
  }

  private loadSchema(schema: RecipeSchema, options: RecipeOptions): this {
    this.schema = JSON.parse(JSON.stringify(schema));
    if (Array.isArray(this.schema)) {
      throw new InvalidSchemaError('schema top level cannot be array');
    }
    this.name = schema.name || schema.from || schema.to || 'unnamed recipe';

    this.data = schema.data;
    this.depends = schema.depends || [];
    this.fileHandler = schema.fileHandler;
    this.from = schema.from;
    this.recipes = schema.recipes || [];
    this.scripts = schema.scripts;
    this.to = schema.to?.[0] === '/' ? schema.to : join(options.output || '.', schema.to || '.');
    this.previousOutput = options.previousOutput || process.cwd();
    this.excludeDirs = options?.exclude ? (schema.excludeDirs || []).concat(options.exclude) : schema.excludeDirs;
    this.includeDirs = schema.includeDirs;
    this.type = null;

    return this;
  }

  private tryParseUrl(): this {
    const url = new URL(this.from);
    this.type = isRepo(url.pathname) ? 'repo' : 'url';

    return this;
  }
}
