import { MoxyServer } from '@acrontum/moxy';
import { expect } from 'chai';
import { rm } from 'fs/promises';
import { relative } from 'path';
import { fst, listAllFiles, RecipeSchema } from '../src';
import { e2eFiles } from './fixtures/e2e-files';
import { getFixturePath, listFiles, testOutDir } from './shared/helpers';
import { moxyServeAsGit } from './shared/moxy-git';

const recipe = (port: number): RecipeSchema => ({
  name: 'project scaffold quick start',
  to: testOutDir,
  recipes: [
    {
      name: 'weather spec',
      from: `http://localhost:${port}/repos/open-api-weather.git`,
      to: 'spec',
      scripts: {
        after: 'npm install 2>/dev/null && npm run build',
      },
      recipes: [
        {
          name: 'angular frontend',
          to: '../',
          scripts: {
            after: 'npx -p @angular/cli@15.0.4 ng new frontend 2>/dev/null',
          },
          recipes: [
            {
              name: 'nginx SPA',
              to: 'frontend',
              from: getFixturePath('templates/extensions/frontend'),
            },
          ],
        },
      ],
    },
    {
      name: 'ts express backend',
      to: 'backend',
      depends: ['weather spec'],
      from: getFixturePath('templates/extensions/backend'),
      scripts: {
        after: `\
          npm init --yes && \
          npm i -D generate-it@5.50.1 2>/dev/null && \
          npx generate-it --yes --template https://github.com/acr-lfr/generate-it-typescript-server#5.35.7 --mocked ../spec/latest.yml 2>/dev/null
        `,
      },
      recipes: [
        {
          name: 'backend overrides',
          from: getFixturePath('templates/extensions/backend'),
          scripts: {
            after: 'npm install 2>/dev/null && rm -rf .openapi-nodegen',
          },
        },
      ],
    },
    {
      name: 'mocker compose',
      from: getFixturePath('templates/extensions/docker'),
      to: 'docker',
    },
  ],
});

describe(relative(process.cwd(), __filename), () => {
  let moxy: MoxyServer;

  before(async () => {
    moxy = new MoxyServer({ logging: 'error' });
    await moxy.listen();
    moxyServeAsGit(moxy, getFixturePath('templates'));
  });

  beforeEach(async () => {
    await rm(testOutDir, { recursive: true, force: true }).catch(() => {});
    expect(await listAllFiles(testOutDir).catch((e) => e.code)).to.equal('ENOENT');
  });

  after(async () => {
    await moxy.close({ closeConnections: true });
  });

  it('can generate a codebase', async () => {
    await fst([recipe(moxy.port)], { cache: false });
    expect(await listFiles(testOutDir, { removePrefix: true })).to.deep.equals(e2eFiles);
  }).timeout(0);
});
