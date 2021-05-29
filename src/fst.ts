import { promises } from 'fs';
import { CliOptions } from './cli';
import { collectRecipeHooks, fetchSource, FNode, Handler, LoggingService, parseRecipeFile, Recipe, Renderer, SourceOptions, tree } from './lib';

const logger = new LoggingService('fst');

/**
 * { function_description }
 *
 * @param  {Recipe[]}  recipes              The recipes
 * @param  {}          options?:CliOptions  The options cli options
 *
 * @return {Handler}   { description_of_the_return_value }
 */
export const recipeHandler =
  (recipes: Recipe[], options?: CliOptions): Handler =>
  async (node: FNode): Promise<void> => {
    node.outputs.forEach((output) => recipes.push(...parseRecipeFile(output, options)));
  };

/**
 * { function_description }
 *
 * @param {Recipe[]}          recipes         The recipes
 * @param {CliOptions}        options         The options
 * @param {(Array|string[])}  [remotes=null]  The remotes
 */
export const prefetchRemotes = async (recipes: Recipe[], options: CliOptions, remotes: string[] = null) => {
  const first = remotes === null;
  remotes = remotes || [];

  for (const r of recipes) {
    if (r?.type == 'repo' || r.type === 'remote') {
      remotes.push(r.from);
    }

    if (r.recipes?.length) {
      await prefetchRemotes(r.recipes, options, remotes);
    }
  }

  if (first) {
    await Promise.all([...new Set(remotes)].map((repo) => fetchSource(repo, options)));
  }
};

/**
 * { function_description }
 *
 * @param {Recipe}            recipe                             The recipe
 * @param {Handler}           handler                            The handler
 * @param {(Array|string[])}  sourceDirs                         The source dirs
 * @param {<type>}            options?:CliOptions&SourceOptions  The options cli options source options
 */
export const runRecipe = async (recipe: Recipe, handler: Handler, sourceDirs: string[], options?: CliOptions & SourceOptions) => {
  logger.debug({ recipe });

  if (!recipe.from) {
    return;
  }

  const source = await fetchSource(recipe.from, { subdirs: recipe.includeDirs, cache: options?.cache });
  if (recipe.type == 'repo' || recipe.type == 'remote') {
    sourceDirs.push(source);
  }

  const root = await tree(source, { exclude: recipe.excludeDirs });

  const renderer = new Renderer(root, recipe.to);
  if (options?.recursive || recipe.recursive) {
    renderer.registerFilenameHandler('.fstr.json', handler);
    renderer.registerFilenameHandler('.fstr.js', handler);
  }

  await Promise.all(recipe.prerender?.map?.((callback) => callback(recipe, renderer)));

  await renderer.render();
};

/**
 * { function_description }
 *
 * @param  {Recipe[]}       recipes              The recipes
 * @param  {Handler}        handler              The handler
 * @param  {string[]}       sourceDirs           The source dirs
 * @param  {}               options?:CliOptions  The options cli options
 *
 * @return {Promise<void>}  { description_of_the_return_value }
 */
export const runRecipes = async (recipes: Recipe[], handler: Handler, sourceDirs: string[], options?: CliOptions): Promise<void> => {
  const maxConcurrent = options.parallel || 10;

  while (recipes.length) {
    const batch = recipes.splice(0, maxConcurrent).map(async (recipe) => {
      collectRecipeHooks(recipe);

      await Promise.all(recipe.before?.map?.((callback) => callback(recipe)));

      await runRecipe(recipe, handler, sourceDirs, options);

      await Promise.all(recipe.after?.map?.((callback) => callback(recipe)));

      if (recipe.recipes?.length) {
        recipes.push(...recipe.recipes);
      }
    });

    await Promise.all(batch);
  }
};

/**
 * TODO: support inline recipes
 * export const fst = async (pathlike: (string | RecipeSchema)[], options?: CliOptions): Promise<void> => {
 *
 * { function_description }
 *
 * @param  {string[]}       pathlike             The pathlike
 * @param  {}               options?:CliOptions  The options cli options
 *
 * @return {Promise<void>}  { description_of_the_return_value }
 */
export const fst = async (pathlike: string[], options?: CliOptions): Promise<void> => {
  options = options || {};

  const recipes = [];
  const sourceDirs: string[] = [];
  let handler: Handler = null;

  try {
    for (const file of pathlike) {
      recipes.push(...parseRecipeFile(file, options));
    }
    logger.log('fst parsed input', logger.blu(JSON.stringify({ recipes }, null, 2)));

    handler = recipeHandler(recipes, options);

    await runRecipes(recipes, handler, sourceDirs, options);
  } catch (e) {
    logger.trace('Error parsing recipes\n', e, '\n', JSON.stringify({ sourceDirs, recipes }));
  }

  if (!options?.cache) {
    await Promise.all(sourceDirs.map((dir) => promises.rmdir(dir).catch(() => null)));
  }

  return null;
};
