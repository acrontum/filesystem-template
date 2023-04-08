import { InvalidSchemaError } from './errors';
import { Recipe, RecipeSchema } from './recipe';

type Dependencies = Record<string, Record<string, string>>;

const flattenDependencies = (recipe: Recipe | RecipeSchema, dependencies: Dependencies = {}, parents: string[] = []): Dependencies => {
  dependencies[recipe.name] = [...(recipe.depends || []), ...parents].reduce((acc, dep) => ({ ...acc, [dep]: true }), {});

  for (const child of recipe.recipes || []) {
    if (dependencies[recipe.name][child.name]) {
      throw new InvalidSchemaError(`recipes cannot depend on sub-recipes (${recipe.name} -> ${child.name})`);
    }
    flattenDependencies(child, dependencies, [...parents, recipe.name]);
  }

  return dependencies;
};

const assertNotCircular = (
  deps: Record<string, string>,
  seen: Map<string, boolean>,
  dependencies: Dependencies,
  alreadyValid: Record<string, boolean> = {},
): void => {
  const dependencyNames = Object.keys(deps || {});
  if (!dependencyNames.length) {
    return;
  }

  for (const key of dependencyNames) {
    if (alreadyValid[key]) {
      return;
    }

    if (seen.get(key)) {
      throw new InvalidSchemaError(`recipes have circular dependencies (${[...seen.keys(), key].join(' -> ')})`);
    }

    seen.set(key, true);
    assertNotCircular(dependencies[key], seen, dependencies, alreadyValid);
    seen.delete(key);
    alreadyValid[key] = true;
  }
};

export const assertNoCircularDependencies = (recipes: Recipe[]) => {
  const dependencies: Dependencies = recipes.reduce((deps, node) => flattenDependencies(node, deps), {});

  for (const recipeName of Object.keys(dependencies)) {
    assertNotCircular(dependencies[recipeName], new Map([[recipeName, true]]), dependencies);
  }
};
