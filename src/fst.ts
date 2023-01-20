import { promises } from 'fs';
import { join, resolve } from 'path';
import { CliOptions } from './cli';
import { LoggingService, Recipe, RecipeSchema, validateRecipes } from './lib';
import { RecipeRuntimeError } from './lib/errors';
import { LogBuffer } from './log-utils';

const logger = new LoggingService();

const cleanup = async (tempDirs: string[], cache: boolean) => {
  if (cache) {
    return;
  }

  await Promise.all(tempDirs.map((dir) => promises.rm(dir, { recursive: true, force: true }).catch(() => null)));
  await promises.rm(join(process.cwd(), '.fst'), { recursive: true, force: true });
};

const runBatch = (recipes: Recipe[], batch: Recipe[], options: CliOptions, tempDirs: string[], logBuffer: LogBuffer) => {
  return batch.map(async (recipe) => {
    if (!recipe.parse()) {
      return true;
    }

    const sources = await recipe.run(options);
    // re-queue if it's waiting for something
    if (sources === null) {
      recipes.push(recipe);

      return false;
    }

    tempDirs.push(...sources);

    for (const child of recipe.recipes || []) {
      const childRecipe = new Recipe(child, recipe.map, { output: recipe.to, previousOutput: recipe.to });
      recipes.push(childRecipe);
      logBuffer.add(childRecipe.logger);
    }

    return true;
  });
};

const runRecipes = async (recipes: Recipe[], tempDirs: string[], options?: CliOptions): Promise<void> => {
  const maxConcurrent = options.parallel || 10;
  const logBuffer = new LogBuffer(!!options?.buffered);

  await logBuffer.init(recipes.map(({ logger }) => logger));

  while (recipes.length) {
    validateRecipes(recipes);

    const batch = recipes.splice(0, maxConcurrent);
    const processed = await Promise.all(runBatch(recipes, batch, options, tempDirs, logBuffer));

    if (processed.find(Boolean) || recipes.find((r) => !r.parsed)) {
      continue;
    }

    logger.error(JSON.stringify({ message: 'Unmet dependencies', recipes }, null, 2));
    throw new RecipeRuntimeError('Unmet dependencies');
  }

  logBuffer.complete();
};

export const fst = async (schemas: RecipeSchema[], options?: CliOptions): Promise<void> => {
  const start = Date.now();
  const output = resolve(options.output || process.cwd());

  const recipes: Recipe[] = [];
  const tempDirs: string[] = [];
  const map: Record<string, Recipe> = {};

  try {
    for (const schema of schemas) {
      if (Array.isArray(schema)) {
        recipes.push(...schema.map((s) => new Recipe(s, map, { output })));
      } else {
        recipes.push(new Recipe(schema, map, { output }));
      }
    }
    logger.log('fst parsed input', logger.blu(JSON.stringify(recipes, null, 2)));

    await runRecipes(recipes, tempDirs, options);
  } catch (e) {
    logger.trace('Error parsing recipes\n', e, '\n', JSON.stringify({ tempDirs, recipes }));
    await cleanup(tempDirs, options?.cache);
    throw e;
  }

  await cleanup(tempDirs, options?.cache);

  logger.log(`Finished (${Date.now() - start}ms)`);
};
