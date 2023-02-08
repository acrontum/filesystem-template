# filesystem-template

**NOTE** fst is in early beta, docs are subject to change and may not be accurate.

---

## Usage

Quickstart:  
`npm install --save-dev @acrontum/filesystem-template`  

Basic usage:  
`npx fst [options] <path_to_recipe_file>`

See `npx fst --help` for more options, or see [API](#api).  

---

## Recipe file

#### Schema


```typescript
interface RecipeSchema {
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
```

#### Example

```json
{
  "recipes": [
    {
      "name": "openapi-spec",
      "to": "spec",
      "scripts": {
        "after": "npm run build"
      }
    },
    {
      "name": "server",
      "from": "https://mytemplates.test/server-template",
      "to": "backend",
      "fileHandler": "server-builder.js",
      "recipes": [
        {
          "name": "client",
          "from": "./client",
          "to": "./client",
          "scripts": {
            "after": "node link-client.js"
          }
        }
      ]
    },
    {
      "name": "docker-compose",
      "from": "https://fstr-std.com/compose",
      "to": "docker",
      "depends": ["openapi-spec", "server", "client"],
      "excludeDirs": ["volumes"]
    }
  ]
}
```


#### Understanding relative paths

All recipe block paths are relative to the parent recipe's `"to"` section (defaulting to `'./'` when not present. In the case of the root, it's relative to where the recipe was called from (cwd).  
Eg:  

For this file setup:
```
.
├── demo.fstr.json
├── scripts
│   ├── child-script.js
│   └── parent-script.js
└── sub-template
    └── readme.txt

```

With `demo.fstr.json`:  
```json
{
  "name": "demo",
  "to": "./demo-output",
  "fileHandler": "scripts/parent-script.js",
  "recipes": [
    {
      "name": "demo-sub-recipe",
      "from": "../sub-template",
      "to": "sub-folder",
      "fileHandler": "scripts/child-script.js",
      "scripts": {
        "before": "touch readme.txt"
      }
    }
  ]
}
```

Note that for `demo-sub-recipe`, both `"from"` and `"scripts"` are relative to the parent `"to"`, wheras the top-level script path (`'scripts/parent-script.js'`) is relative to the recipe file (in this case, `'./'`).  

For the sub-recipe, since both `"from"` and `"scripts"` read from folders in the root, their paths are parsed as `./demo-output/../sub-template` and `./demo-output/../scripts/child-script.js` (respectively).  

Running the recipe file would then generate this folder structure:  
```
.
├── demo.fstr.json
├── demo-output          <-- generated
│   └── sub-folder
│       └── readme.txt
├── scripts
│   ├── child-script.js
│   └── parent-script.js
└── sub-template
    └── readme.txt
```


### Lifecycle scripts

Import and run scripts at different points in the runtime.  

#### scripts.before:
Runs after source material exists on disk (after pulling from remote, or on finding local path), but before the render.  
```json
{
  // ...
  "scripts": {
    "before": "rm -rf old-files"
  }
}
```

#### scripts.after:
Runs after render and all files copied. Useful for cleanup or logging.  
```json
{
  // ...
  "scripts": {
    "after": "./build.sh && cp output ../release"
  }
}
```

### fileHandler (rendering callback):

Used when registering callbacks for during render.  
```typescript
fileHandler?: (recipe: Recipe, renderer: Renderer) => void | Promise<void>;
```

FST will search in the current directory of the recipe for the file handler script and, if that does not exist, in the temp template source folder.  

```typescript
import * as nunjucks from 'nunjucks';
import { promises } from 'fs';
import { RenderFunction, Recipe, Renderer, VirtualFile } from '@acrontum/filesystem-template';

const render: RenderFunction = (recipe: Recipe, renderer: Renderer) => {
  // recipe contains a name-indexed map of other recipes that have run
  const parentRecipeData = recipe.map['parent-name'].data;

  renderer.onFile(async (node: VirtualFile) => {
    if (node.name === 'ignore-me.txt') {
      node.skip = true; // skip generating this file

      return;
    }

    if (!node.name.endsWith('.njk')) {
      // if node is not skipped, and has no outputs, the default rendering will be to copy the file or folder
      return;
    }

    const njkTemplate = await promises.readFile(node.fullSourcePath, 'utf8');

    // the parent node may be a folder which generated in multiple places, meaning the source file will have multple outputs
    for (const output of node.getGenerationTargets()) {
      const content = await nunjunks.renderFile(njkTemplate, { ...parentRecipeData, ...recipe.data });
      await promises.writeFile(output, content);
      node.outputs.push(output);
    }
  });
};
````

---

## API

```
fst <options | RECIPE>

options:
  -c, --cache             Do not delete fetched files between runs
  -o, --output PATH       Folder to output files
  -p, --parallel COUNT    Max number of concurrent recipe parsing (default 10)
  -r, --recipe RECIPE     Add recipe to builder (file or URL)
  -s, --silent            Log less verbosely
  -v, --verbose           Log more verbosely
  -e, --exclude PATHS     Skip PATHS in template generation (default node_modules,.git)
  -b, --no-buffer         Disable log buffering (default true unless not tty, CI=true, or TERM=dumb)
```

Try:  
`npx fst --help`


## Roadmap

- [ ] write more tests  
- [ ] update docs  
- [ ] re-implement cli params (include / exclude files, cache, parallel, etc)  
- [ ] re-implement recipe params (include / exclude files, cache, parallel, etc)  
