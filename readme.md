# filesystem-template

---

## Usage

Quickstart:  
`npm install --save-dev filesystem-template`  

Basic usage:  
`npx fst [options] <path_to_recipe_file>`

See `npx fst --help` for more options, or see [API](#api).  

---

## Recipe file

#### Schema


```typescript
interface RecipeSchema {
  data?: any;                                     // arbitrary data store
  depends?: string[];                             // array of names of other recipes which must be built first
  excludeDirs?: string[];                         // list of folders to skip when copying or generating
  fileHandler?: string | RenderFunction;          // path to render handler js file or handler function
  from?: string;                                  // file, recipe, path to file(s), url, or repository to fetch templates from
  includeDirs?: string[];                         // when cloning, only clone certain folders
  name?: string;                                  // unique name of the recipe (for use with depends and passing data between files)
  recipes?: RecipeSchema[];                       // dependent / sub recipes
  scripts?: { before?: string; after?: string };  // lifecycle cli / shell commands
  to?: string;                                    // output folder
}
```

key|type|description
---|---|---
name        | `string`             |just a label - has no functional use (yet)
from        | `string`             |source path - either a URL or a location on disk.<br>URL can be a remote recipe file or repository.
to          | `string`             |Root output path.
recipes     | `string \| Recipe[]` |Array of recipes to run after parent.<br>When a recipe is a string (eg `"<something>"`), it is just a short form for `{ "from": "<something>", "to": "./" }`.
hooks       | `string[]`           |Array of scripts to run.
recursive   | `boolean`            |If true, when other recipe files are found in the source path, queue them for parsing. Default is false.
includeDirs | `string[]`           |Array of paths to limit parsing to.
excludeDirs | `string[]`           |Array of paths to exclude from parsing.


#### Example

```json
{
  "recipes": [
    {
      "name": "server",
      "from": "../templates/server",
      "to": "../../out/simple/src/server",
      "recursive": false,
      "hooks": ["server-builder.js"],
      "recipes": [
        {
          "name": "client",
          "from": "./client",
          "hooks": [
            "link-client.js"
          ]
        }
      ]
    },
    {
      "from": "../../filesystem-template",
      "to": "../out/simple/src/fst-test",
      "excludeDirs": ["dist", "test"]
    }
  ]
}
```


#### Understanding relative paths

All recipe block paths are relative to the parent recipe's `"to"` section (defaulting to `'./'` when not present. In the case of the root, it's raltive to the recipe file path (`'./'`).  
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
  "hooks": ["scripts/parent-script.js"],
  "recipes": [
    {
      "name": "demo-sub-recipe",
      "from": "../sub-template",
      "to": "sub-folder",
      "hooks": ["../scripts/child-script.js"]
    }
  ]
}
```

Note that for `demo-sub-recipe`, both `"from"` and `"hooks"` are relative to the parent `"to"`, wheras the top-level script path (`'scripts/parent-script.js'`) is relative to the recipe file (in this case, `'./'`).  

For the sub-recipe, since both `"from"` and `"hooks"` read from folders in the root, their paths are parsed as `./demo-output/../sub-template` and `./demo-output/../scripts/child-script.js` (respectively).  

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




### Hooks

Import and run scripts at different points in the runtime.  

Each hooks script is parsed for exports:

<b>exports.before:</b>  
Runs after source material exists on disk (after pulling from remote, or on finding local path).  
```typescript
before?: ((recipe: Recipe) => void | Promise<void>)[];
```

<b>exports.prerender:</b>  
Runs after building source tree and initializing rendered. Used when registering callbacks for during render.  
```typescript
prerender?: ((recipe: Recipe, renderer: Renderer) => void | Promise<void>)[];
```

<b>exports.after:</b>  
Runs after render and all files copied. Useful for cleanup or logging.  
```typescript
after?: ((recipe: Recipe) => void | Promise<void>)[];
```

#### Example

```javascript
const childProcess = require('child_process');
const { promisify } = require('util');
const { join } = require('path');

const exec = promisify(childProcess.exec);

exports.before = async () => {
  const runtimePath = join(__dirname, 'src');
  let stderr;
  ({ stderr } = await exec('npm install', { cwd: runtimePath }));
  if (stderr) {
    console.warn(`build-hook.js: ${stderr}`);
  }
  ({ stderr } = await exec('npm run build', { cwd: runtimePath }));
  if (stderr) {
    console.warn(`build-hook.js: ${stderr}`);
  }
}

```

---

## API

// TODO


Try:  
`npx fst --help`
