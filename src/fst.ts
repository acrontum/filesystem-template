import { promises } from 'fs';
import { join, resolve } from 'path';
import { CliOptions } from './cli';
import './console-patch';
import { Recipe, RecipeRuntimeError, RecipeSchema, assertNoCircularDependencies, runtimeCache } from './lib';
import { LogBuffer, LoggingService } from './logging';

const logger = new LoggingService();

const cleanup = async (tempDirs: string[], cache: boolean) => {
  if (cache) {
    return;
  }

  await Promise.all(tempDirs.map((dir) => promises.rm(dir, { recursive: true, force: true }).catch(() => null)));
  await promises.rm(join(process.cwd(), '.fst'), { recursive: true, force: true });
};

const getRecipeParents = (recipe: Recipe) => {
  let parents = [recipe.name];
  let parent = recipe.parent;
  while (parent) {
    parents.push(parent.name);
    parent = parent.parent;
  }

  return parents.reverse().join(' > ');
};

const formatError = (recipe: Recipe) => (e: Error) => {
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

  e.message = `${red(e.message)}\n${getRecipeParents(recipe)}\n`;

  throw e;
};

const runBatch = (options: CliOptions, tempDirs: string[], logBuffer: LogBuffer) => (recipes: Recipe[], batch: Recipe[]) => {
  return batch.map(async (recipe) => {
    if (!recipe.parse()) {
      recipes.push(recipe);

      return false;
    }

    const sources = await recipe.run({ ...options, packageRoot: process.cwd() }).catch(formatError(recipe));

    // re-queue if it's waiting for something
    if (sources === null) {
      recipes.push(recipe);

      return false;
    }

    tempDirs.push(...sources);

    for (const child of recipe.recipes || []) {
      const childRecipe = new Recipe(child, recipe.map, { ...options, output: recipe.to, previousOutput: recipe.to });
      childRecipe.parent = recipe;
      recipes.push(childRecipe);
      logBuffer.add(childRecipe.logger);
    }

    return true;
  });
};

const runRecipes = async (recipes: Recipe[], tempDirs: string[], options?: CliOptions): Promise<void> => {
  const maxConcurrent = options.parallel || 10;
  const logBuffer = new LogBuffer(!!options?.buffered);
  const batcher = runBatch(options, tempDirs, logBuffer);

  await logBuffer.init(recipes.map(({ logger }) => logger));

  while (recipes.length) {
    assertNoCircularDependencies(recipes);

    const batch = recipes.splice(0, maxConcurrent);
    const processed = await Promise.all(batcher(recipes, batch));

    if (processed.find(Boolean) || recipes.find((r) => !r.parsed)) {
      continue;
    }

    const unmetDeps = recipes.map((recipe) => `${getRecipeParents(recipe)} => ${recipe.depends.join(', ')}`);
    logger.error(
      JSON.stringify({ message: 'Unmet dependencies', recipes, unmetDeps }, (key, value) => (key === 'parent' ? `<${value?.name}>` : value), 2),
    );
    throw new RecipeRuntimeError('Unmet dependencies');
  }

  logBuffer.complete();
};

export const fst = async (schemas: RecipeSchema[], options?: CliOptions): Promise<void> => {
  Object.keys(runtimeCache).forEach((key) => delete runtimeCache[key]);

  const start = Date.now();
  options = options || {};
  const output = resolve(options?.output || process.cwd());

  const recipes: Recipe[] = [];
  const tempDirs: string[] = [];
  const map: Record<string, Recipe> = {};

  if (options.cache !== true) {
    await promises.rm(join(process.cwd(), '.fst'), { recursive: true, force: true });
  }

  try {
    for (const schema of schemas) {
      recipes.push(new Recipe(schema, map, { ...options, output }));
    }
    logger.log('fst parsed input', logger.blu(JSON.stringify(recipes, null, 2)));

    await runRecipes(recipes, tempDirs, options);
  } catch (e) {
    if (process.env.FST_LOG === 'log' || process.env.FST_LOG === 'debug') {
      logger.trace('Error parsing recipes\n', e, '\n', JSON.stringify({ tempDirs, recipes }));
    } else {
      logger.trace('Error parsing recipes\n', e);
    }
    await cleanup(tempDirs, options?.cache);
    throw e;
  }

  await cleanup(tempDirs, options?.cache);

  logger.log(`Finished (${Date.now() - start}ms)`);
};
