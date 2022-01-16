import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { URL } from 'url';
import { CliOptions } from '../cli';
import { LoggingService } from './log.service';

const logger = new LoggingService('recipe');

type RecipeInput = Recipe & { recipes?: (Recipe | string)[] };

export type RecipeSchema = RecipeInput | RecipeInput[];

export interface Recipe {
  from?: string;
  to?: string;
  type?: 'disk' | 'repo' | 'remote' | 'stub';
  name?: string;
  recipes?: Recipe[];
  recursive?: boolean;
  includeDirs?: string[];
  excludeDirs?: string[];
  scripts?: {
    before?: string;
    after?: string;
    prerender?: string;
  };
  sourcePath?: string;
  meta?: any;
}

export const rootOrRelative = (path: string, root?: string): string => (/^\//.test(path) ? path : join(root, path || '.'));

/**
 * Determines whether the specified file is recipe file.
 *
 * @param  {string}   file  The file
 *
 * @return {boolean}  True if the specified file is recipe file, False otherwise.
 */
export const isRecipeFile = (file: string): boolean => /\.fstr\.js(on)?/.test(file);

/**
 * { function_description }
 *
 * @param  {Recipe}  recipe  The recipe
 *
 * @return {Recipe}  { description_of_the_return_value }
 */
export const resolveRecipePaths = (recipe: Recipe): Recipe => {
  logger.debug('resolveRecipePaths input', JSON.stringify({ recipe }, null, 2));

  const root = resolve(recipe.sourcePath || '.');
  const to = rootOrRelative(recipe?.to, root);

  // parse git as ssh url
  if (/^git@.*:/.test(recipe.from)) {
    recipe.from = `ssh://${recipe.from.replace(/:/, '/')}`;
  }

  let output: Recipe = {
    from: recipe.from ? rootOrRelative(recipe.from, root) : null,
    to,
    type: recipe.from ? 'disk' : 'stub',
  };

  try {
    const url = new URL(recipe.from);

    output.from = recipe.from;
    output.type = /\.fstr\.js(on)?$/.test(url.pathname) ? 'remote' : 'repo';
  } catch (e) {}

  logger.debug('resolveRecipePaths', logger.ylw(JSON.stringify({ recipe, output }, null, 2)));

  return output;
};

const tryResolveRecipeFile = (filePath: string, recipe?: RecipeInput): RecipeInput => {
  let schema: RecipeInput = null;

  if (!existsSync(filePath) && recipe) {
    filePath = join((recipe as Recipe).sourcePath || recipe.to, filePath);
  }

  schema = require(resolve(filePath));
  schema.sourcePath = resolve(dirname(filePath));

  return schema;
};

/**
 * Gets the schema.
 *
 * @param  {(RecipeSchema|string)}  schemaLike  The schema like
 *
 * @return {RecipeSchema}           The schema.
 */
export const getSchema = (schemaLike: string | RecipeSchema): RecipeSchema => {
  if (typeof schemaLike == 'string') {
    if (!isRecipeFile(schemaLike)) {
      return { from: schemaLike };
    }

    try {
      return tryResolveRecipeFile(schemaLike);
    } catch (e: any) {
      if (e?.code !== 'MODULE_NOT_FOUND') {
        throw e;
      }
    }

    return { from: schemaLike };
  } else if (!Array.isArray(schemaLike) && isRecipeFile(schemaLike?.from)) {
    try {
      return tryResolveRecipeFile(schemaLike.from, schemaLike);
    } catch (e: any) {
      if (e?.code !== 'MODULE_NOT_FOUND') {
        throw e;
      }
    }
  }

  return schemaLike;
};

/**
 * { function_description }
 *
 * @param  {(RecipeSchema|string)}  schemaLike           The schema like
 * @param  {}                       options?:CliOptions  The options cli options
 *
 * @return {Recipe[]}               { description_of_the_return_value }
 */
export const parseRecipeFile = (schemaLike: string | RecipeSchema, options?: CliOptions): Recipe[] => {
  logger.debug('parseRecipeFile input', JSON.stringify({ schemaLike, options }, null, 2));

  let schema: RecipeSchema = getSchema(schemaLike);

  logger.debug('parseRecipeFile schema', JSON.stringify(schema, null, 2));

  if (!Array.isArray(schema)) {
    schema = [schema];
  } else {
    schema = schema.slice();
  }

  let recipes: Recipe[] = [];

  while (schema.length) {
    const item: Recipe = schema.shift();
    logger.debug('parseRecipeFile item', item);

    if (item.scripts?.prerender && !/^\//.test(item.scripts.prerender)) {
      item.scripts.prerender = join(item.to, item.scripts.prerender);
    }

    const recipe = {
      ...item,
      ...resolveRecipePaths(item),
      ...options,
    };

    logger.debug('parseRecipeFile recipe', recipe);
    recipes.push(recipe);

    if (recipe.recipes?.length) {
      recipe.recipes = recipe.recipes.reduce((deps, dep) => {
        dep = typeof dep === 'string' ? { from: dep } : dep;
        dep.sourcePath = dep.sourcePath || recipe.to;

        return deps.concat(parseRecipeFile(dep, options));
      }, []);
    }
  }

  return recipes;
};
