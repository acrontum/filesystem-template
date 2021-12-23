import { expect } from 'chai';
import { resolve, join } from 'path';
import { getSchema, parseRecipeFile, Recipe } from '../../src';
import { fixtures, getFixture, getFixturePath, root } from '../shared/helpers';

describe('recipe.unit.spec.ts', () => {
  let parsed: Recipe[];

  it('can parse recipe files', async () => {
    parsed = parseRecipeFile({});
    expect(parsed).to.eql([
      {
        from: null,
        to: root,
        type: 'stub',
      },
    ]);
  });

  it('can parse recipe files', async () => {
    parsed = parseRecipeFile({
      from: 'github.com:p-mcgowan/test',
      to: 'src',
      recipes: [],
      scripts: {
        before: 'rm -rf *',
        after: 'chown -R $(id -u):$(id -r) .',
      },
    });
    expect(parsed).to.eql([
      {
        from: 'github.com:p-mcgowan/test',
        to: `${root}/src`,
        recipes: [],
        scripts: { before: 'rm -rf *', after: 'chown -R $(id -u):$(id -r) .' },
        type: 'repo',
      },
    ]);
  });

  it('can parse fixture files [dsd-demo.fstr.json]', async () => {
    parsed = parseRecipeFile(getFixture('dsd-demo.fstr.json'));
    expect(parsed).to.eql([
      {
        name: 'dsd-demo',
        to: `${root}/generated`,
        recipes: [
          {
            name: 'swagger',
            from: 'ssh://git@repos.acrontum.net/dsd/backend_main_swagger',
            to: `${root}/generated/backend_main_swagger`,
            scripts: {
              after: 'npm i && npm run build:yaml -- --yes',
            },
            recipes: [
              {
                name: 'backend',
                from: 'ssh://git@repos.acrontum.net/dsd/backend_main',
                to: `${root}/generated/backend`,
                scripts: {
                  after: 'npm i && npm run generate:nodegen -- --yes',
                  before: "node -e \"process.stderr.write(path.resolve('../../fstr-scripts/backend-prerender.js') + '\\n')\"",
                },
                sourcePath: `${root}/generated/backend_main_swagger`,
                type: 'repo',
              },
              {
                name: 'frontend',
                from: 'ssh://git@repos.acrontum.net/dsd/frontend',
                to: `${root}/generated/frontend`,
                recipes: [
                  {
                    from: 'ssh://git@repos.acrontum.net/dsd/authentication_swagger',
                    to: `${root}/generated/frontend/swagger_auth`,
                    sourcePath: `${root}/generated/frontend`,
                    type: 'repo',
                  },
                  {
                    from: 'ssh://git@repos.acrontum.net/dsd/car-park-backend-swagger',
                    to: `${root}/generated/frontend/swagger_carpark`,
                    sourcePath: `${root}/generated/frontend`,
                    type: 'repo',
                  },
                  {
                    from: `${root}/generated/backend_main_swagger`,
                    to: `${root}/generated/frontend/swagger_main`,
                    sourcePath: `${root}/generated/frontend`,
                    type: 'disk',
                  },
                  {
                    from: 'ssh://git@repos.acrontum.net/dsd/recommendations-service-swagger.git',
                    to: `${root}/generated/frontend/swagger_recommendations`,
                    sourcePath: `${root}/generated/frontend`,
                    type: 'repo',
                  },
                ],
                sourcePath: `${root}/generated/backend_main_swagger`,
                type: 'repo',
              },
            ],
            sourcePath: `${root}/generated`,
            type: 'repo',
          },
        ],
        from: null,
        type: 'stub',
      },
    ]);

    parsed = parseRecipeFile(getFixturePath('dsd-demo.fstr.json'));
    expect(parsed).to.eql([
      {
        name: 'dsd-demo',
        to: `${root}/test/fixtures/generated`,
        recipes: [
          {
            name: 'swagger',
            from: 'ssh://git@repos.acrontum.net/dsd/backend_main_swagger',
            to: `${root}/generated/backend_main_swagger`,
            scripts: {
              after: 'npm i && npm run build:yaml -- --yes',
            },
            recipes: [
              {
                name: 'backend',
                from: 'ssh://git@repos.acrontum.net/dsd/backend_main',
                to: `${root}/generated/backend`,
                scripts: {
                  after: 'npm i && npm run generate:nodegen -- --yes',
                  before: "node -e \"process.stderr.write(path.resolve('../../fstr-scripts/backend-prerender.js') + '\\n')\"",
                },
                sourcePath: `${root}/generated/backend_main_swagger`,
                type: 'repo',
              },
              {
                name: 'frontend',
                from: 'ssh://git@repos.acrontum.net/dsd/frontend',
                to: `${root}/generated/frontend`,
                recipes: [
                  {
                    from: 'ssh://git@repos.acrontum.net/dsd/authentication_swagger',
                    to: `${root}/generated/frontend/swagger_auth`,
                    sourcePath: `${root}/generated/frontend`,
                    type: 'repo',
                  },
                  {
                    from: 'ssh://git@repos.acrontum.net/dsd/car-park-backend-swagger',
                    to: `${root}/generated/frontend/swagger_carpark`,
                    sourcePath: `${root}/generated/frontend`,
                    type: 'repo',
                  },
                  {
                    from: `${root}/generated/backend_main_swagger`,
                    to: `${root}/generated/frontend/swagger_main`,
                    sourcePath: `${root}/generated/frontend`,
                    type: 'disk',
                  },
                  {
                    from: 'ssh://git@repos.acrontum.net/dsd/recommendations-service-swagger.git',
                    to: `${root}/generated/frontend/swagger_recommendations`,
                    sourcePath: `${root}/generated/frontend`,
                    type: 'repo',
                  },
                ],
                sourcePath: `${root}/generated/backend_main_swagger`,
                type: 'repo',
              },
            ],
            sourcePath: `${root}/generated`,
            type: 'repo',
          },
        ],
        sourcePath: `${root}/test/fixtures`,
        from: null,
        type: 'stub',
      },
    ]);
  });

  it('can parse fixture files [dsd-demo-preclean.fstr.json]', async () => {
    parsed = parseRecipeFile(getFixture('dsd-demo-preclean.fstr.json'));
    expect(parsed).to.eql([
      {
        name: 'pregen',
        scripts: {
          before: "rm -rf generated && echo 'before done' >&2",
        },
        recipes: [
          {
            from: `${root}/dsd-demo.fstr.json`,
            sourcePath: root,
            to: root,
            type: 'disk',
          },
        ],
        from: null,
        to: root,
        type: 'stub',
      },
    ]);

    parsed = parseRecipeFile(getFixturePath('dsd-demo-preclean.fstr.json'));
    expect(parsed).to.eql([
      {
        name: 'pregen',
        scripts: {
          before: "rm -rf generated && echo 'before done' >&2",
        },
        recipes: [
          {
            name: 'dsd-demo',
            to: `${root}/test/fixtures/generated`,
            recipes: [
              {
                name: 'swagger',
                from: 'ssh://git@repos.acrontum.net/dsd/backend_main_swagger',
                to: `${root}/generated/backend_main_swagger`,
                scripts: {
                  after: 'npm i && npm run build:yaml -- --yes',
                },
                recipes: [
                  {
                    name: 'backend',
                    from: 'ssh://git@repos.acrontum.net/dsd/backend_main',
                    to: `${root}/generated/backend`,
                    scripts: {
                      after: 'npm i && npm run generate:nodegen -- --yes',
                      before: "node -e \"process.stderr.write(path.resolve('../../fstr-scripts/backend-prerender.js') + '\\n')\"",
                    },
                    sourcePath: `${root}/generated/backend_main_swagger`,
                    type: 'repo',
                  },
                  {
                    name: 'frontend',
                    from: 'ssh://git@repos.acrontum.net/dsd/frontend',
                    to: `${root}/generated/frontend`,
                    recipes: [
                      {
                        from: 'ssh://git@repos.acrontum.net/dsd/authentication_swagger',
                        to: `${root}/generated/frontend/swagger_auth`,
                        sourcePath: `${root}/generated/frontend`,
                        type: 'repo',
                      },
                      {
                        from: 'ssh://git@repos.acrontum.net/dsd/car-park-backend-swagger',
                        to: `${root}/generated/frontend/swagger_carpark`,
                        sourcePath: `${root}/generated/frontend`,
                        type: 'repo',
                      },
                      {
                        from: `${root}/generated/backend_main_swagger`,
                        to: `${root}/generated/frontend/swagger_main`,
                        sourcePath: `${root}/generated/frontend`,
                        type: 'disk',
                      },
                      {
                        from: 'ssh://git@repos.acrontum.net/dsd/recommendations-service-swagger.git',
                        to: `${root}/generated/frontend/swagger_recommendations`,
                        sourcePath: `${root}/generated/frontend`,
                        type: 'repo',
                      },
                    ],
                    sourcePath: `${root}/generated/backend_main_swagger`,
                    type: 'repo',
                  },
                ],
                sourcePath: `${root}/generated`,
                type: 'repo',
              },
            ],
            sourcePath: `${root}/test/fixtures`,
            from: null,
            type: 'stub',
          },
        ],
        sourcePath: `${root}/test/fixtures`,
        from: null,
        to: `${root}/test/fixtures`,
        type: 'stub',
      },
    ]);
  });

  it('can parse fixture files [gen-it.fstr.json]', async () => {
    parsed = parseRecipeFile(getFixture('gen-it.fstr.json'));
    expect(parsed).to.eql([
      {
        name: 'generate-it-typescript-server',
        from: 'https://github.com/acr-lfr/generate-it-typescript-server',
        to: `${root}/generated/gen-it`,
        scripts: {
          after: './scripts/gen-shim.js',
        },
        type: 'repo',
      },
    ]);

    parsed = parseRecipeFile(getFixturePath('gen-it.fstr.json'));
    expect(parsed).to.eql([
      {
        name: 'generate-it-typescript-server',
        from: 'https://github.com/acr-lfr/generate-it-typescript-server',
        to: `${root}/test/fixtures/generated/gen-it`,
        scripts: { after: './scripts/gen-shim.js' },
        sourcePath: `${root}/test/fixtures`,
        type: 'repo',
      },
    ]);
  });

  it('can parse fixture files [john.fstr.json]', async () => {
    parsed = parseRecipeFile(getFixture('john.fstr.json'));
    expect(parsed).to.eql([
      {
        name: 'johns fun house',
        to: `${root}/generated/johns-fun-house`,
        recipes: [
          {
            from: `${root}/generated/templates/`,
            to: `${root}/generated/johns-fun-house/templates/`,
            recursive: true,
            sourcePath: `${root}/generated/johns-fun-house`,
            type: 'disk',
          },
          {
            from: 'https://github.com/acrontum/openapi-nodegen-typescript-server-client.git',
            to: `${root}/generated/johns-fun-house/modules/channel/`,
            sourcePath: `${root}/generated/johns-fun-house`,
            type: 'repo',
          },
          {
            from: 'https://github.com/acrontum/openapi-nodegen-typescript-server-client.git',
            to: `${root}/generated/johns-fun-house/modules/image-write`,
            sourcePath: `${root}/generated/johns-fun-house`,
            type: 'repo',
          },
          {
            from: 'https://github.com/acrontum/generate-it-asyncapi-rabbitmq-fanout.git',
            to: `${root}/generated/johns-fun-house/modules/events`,
            sourcePath: `${root}/generated/johns-fun-house`,
            type: 'repo',
          },
        ],
        from: null,
        type: 'stub',
      },
    ]);
  });

  it('can parse fixture files [simple.fstr.json]', async () => {
    const parentDir = resolve(join(root, '../'));
    const grandparentDir = resolve(join(root, '../../'));

    parsed = parseRecipeFile(getFixture('simple.fstr.json'));
    expect(parsed).to.eql([
      {
        recipes: [
          {
            name: 'server',
            from: `${parentDir}/templates/server`,
            to: `${grandparentDir}/out/simple/src/server`,
            recursive: false,
            recipes: [
              {
                name: 'async',
                from: 'https://github.com/acrontum/generate-it-asyncapi-models-to-json',
                to: `${grandparentDir}/out/simple/src/server/src/async`,
                recursive: true,
                sourcePath: `${grandparentDir}/out/simple/src/server`,
                type: 'repo',
              },
            ],
            sourcePath: root,
            type: 'disk',
          },
          {
            from: `${grandparentDir}/filesystem-template`,
            to: `${parentDir}/out/simple/src/fst-test`,
            excludeDirs: ['dist', 'test'],
            sourcePath: root,
            type: 'disk',
          },
        ],
        from: null,
        to: root,
        type: 'stub',
      },
    ]);

    parsed = parseRecipeFile(getFixturePath('simple.fstr.json'));
    expect(parsed).to.eql([
      {
        recipes: [
          {
            name: 'server',
            from: `${parentDir}/templates/server`,
            to: `${grandparentDir}/out/simple/src/server`,
            recursive: false,
            recipes: [
              {
                name: 'async',
                from: 'https://github.com/acrontum/generate-it-asyncapi-models-to-json',
                to: `${grandparentDir}/out/simple/src/server/src/async`,
                recursive: true,
                sourcePath: `${grandparentDir}/out/simple/src/server`,
                type: 'repo',
              },
            ],
            sourcePath: `${parentDir}/filesystem-template`,
            type: 'disk',
          },
          {
            from: `${grandparentDir}/filesystem-template`,
            to: `${parentDir}/out/simple/src/fst-test`,
            excludeDirs: ['dist', 'test'],
            sourcePath: `${parentDir}/filesystem-template`,
            type: 'disk',
          },
        ],
        sourcePath: `${parentDir}/filesystem-template/test/fixtures`,
        from: null,
        to: `${parentDir}/filesystem-template/test/fixtures`,
        type: 'stub',
      },
    ]);
  });

  it('can parse fixture files [test.fstr.json]', async () => {
    parsed = parseRecipeFile(getFixture('test.fstr.json'));
    expect(parsed).to.eql([
      {
        from: `${root}/trees/less-simple`,
        to: `${root}/out`,
        scripts: {
          prerender: 'out/fstr-files/njkHandler.js',
        },
        type: 'disk',
      },
    ]);

    parsed = parseRecipeFile(getFixturePath('test.fstr.json'));
    expect(parsed).to.eql([
      {
        from: `${root}/test/fixtures/trees/less-simple`,
        to: `${root}/test/fixtures/out`,
        scripts: {
          prerender: 'out/out/fstr-files/njkHandler.js',
        },
        sourcePath: `${root}/test/fixtures`,
        type: 'disk',
      },
    ]);
  });

  it('can parse recipe schemas', async () => {
    const expected = {
      name: 'dsd-demo',
      to: './generated',
      recipes: [
        {
          name: 'swagger',
          from: 'ssh://git@repos.acrontum.net/dsd/backend_main_swagger',
          to: 'backend_main_swagger',
          scripts: {
            after: 'npm i && npm run build:yaml -- --yes',
          },
          recipes: [
            {
              name: 'backend',
              from: 'ssh://git@repos.acrontum.net/dsd/backend_main',
              to: '../backend',
              scripts: {
                after: 'npm i && npm run generate:nodegen -- --yes',
                before: "node -e \"process.stderr.write(path.resolve('../../fstr-scripts/backend-prerender.js') + '\\n')\"",
              },
              sourcePath: `${root}/generated/backend_main_swagger`,
            },
            {
              name: 'frontend',
              from: 'ssh://git@repos.acrontum.net/dsd/frontend',
              to: '../frontend',
              recipes: [
                {
                  from: 'ssh://git@repos.acrontum.net/dsd/authentication_swagger',
                  to: 'swagger_auth',
                  sourcePath: `${root}/generated/frontend`,
                },
                {
                  from: 'ssh://git@repos.acrontum.net/dsd/car-park-backend-swagger',
                  to: 'swagger_carpark',
                  sourcePath: `${root}/generated/frontend`,
                },
                {
                  from: '../backend_main_swagger',
                  to: 'swagger_main',
                  sourcePath: `${root}/generated/frontend`,
                },
                {
                  from: 'ssh://git@repos.acrontum.net/dsd/recommendations-service-swagger.git',
                  to: 'swagger_recommendations',
                  sourcePath: `${root}/generated/frontend`,
                },
              ],
              sourcePath: `${root}/generated/backend_main_swagger`,
            },
          ],
          sourcePath: `${root}/generated`,
        },
      ],
      sourcePath: `${root}/test/fixtures`,
    };

    let schema = getSchema(`${fixtures}/dsd-demo.fstr.json`);
    expect(schema).to.eql(expected);

    schema = getSchema({ from: `${fixtures}/dsd-demo.fstr.json` });
    expect(schema).to.eql(expected);
  });
});
