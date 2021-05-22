import { fdir } from 'fdir';
import { lstatSync } from 'fs';
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
  prerender?: string[];
  postrender?: string[];
  sourcePath?: string;
  meta?: any;
}

/**
 * Determines whether the specified file is recipe file.
 *
 * @param  {string}   file  The file
 *
 * @return {boolean}  True if the specified file is recipe file, False otherwise.
 */
export const isRecipeFile = (file: string): boolean => /\.fstr\.js(on)?/.test(file);

/**
 * Collect javascript files from a folder
 *
 * @param  {string}    fileOrFolder  The file or folder
 *
 * @return {string[]}  An array of full paths
 */
export const collectScriptFiles = (fileOrFolder: string): string[] => {
  if (lstatSync(fileOrFolder).isDirectory()) {
    return new fdir().crawlWithOptions(fileOrFolder, { includeBasePath: true, filters: [(p) => p.endsWith('.js')] }).sync() as string[];
  }

  return [fileOrFolder];
};

/**
 * { function_description }
 *
 * @param  {Recipe}  recipe  The recipe
 *
 * @return {Recipe}  { description_of_the_return_value }
 */
export const resolveRecipePaths = (recipe: Recipe): Recipe => {
  logger.log('resolveRecipePaths input', JSON.stringify({ recipe }, null, 2));

  const root = resolve(recipe.sourcePath || '.');
  const to = join(root, recipe?.to || '.');

  let output: Recipe = {
    from: recipe.from ? join(root, recipe.from) : null,
    to,
    type: recipe.from ? 'disk' : 'stub',
    prerender: recipe.prerender?.map((iPath) => join(root, iPath)),
    postrender: recipe.postrender?.map((iPath) => join(root, iPath)),
  };

  output.prerender = output.prerender?.reduce?.((files, path) => files.concat(collectScriptFiles(path)), []);
  output.postrender = output.postrender?.reduce?.((files, path) => files.concat(collectScriptFiles(path)), []);

  try {
    const url = new URL(recipe.from);

    output.from = recipe.from;
    output.type = /\.fstr\.js(on)?$/.test(url.pathname) ? 'remote' : 'repo';
  } catch (e) {}

  logger.log('resolveRecipePaths output', output);

  return output;
};

/**
 * Gets the schema.
 *
 * @param  {(RecipeSchema|string)}  schemaLike  The schema like
 *
 * @return {RecipeSchema}           The schema.
 */
const getSchema = (schemaLike: string | RecipeSchema): RecipeSchema => {
  if (typeof schemaLike == 'string') {
    if (!isRecipeFile(schemaLike)) {
      return { from: schemaLike };
    }

    try {
      let schema: RecipeSchema = require(resolve(schemaLike));
      (schema as Recipe).sourcePath = resolve(dirname(schemaLike));

      return schema;
    } catch (e) {
      if (e?.code !== 'MODULE_NOT_FOUND') {
        throw e;
      }
    }

    return { from: schemaLike };
  } else if (!Array.isArray(schemaLike) && isRecipeFile(schemaLike?.from)) {
    try {
      let schema: RecipeSchema = require(resolve(schemaLike.from));
      (schema as Recipe).sourcePath = resolve(dirname(schemaLike.from));

      return schema;
    } catch (e) {
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

    const recipe = {
      ...item,
      ...resolveRecipePaths(item),
      ...(options || {}),
    };

    logger.debug('parseRecipeFile recipe', recipe);
    recipes.push(recipe);

    if (recipe.recipes?.length) {
      recipe.recipes = recipe.recipes.reduce((deps, dep) => {
        dep.sourcePath = dep.sourcePath || recipe.to;
        return deps.concat(parseRecipeFile(getSchema(dep), options));
      }, []);
    }
  }

  return recipes;
};
