import { MoxyServer } from '@acrontum/moxy';
import { expect } from 'chai';
import { rm } from 'fs/promises';
import { join, relative } from 'path';
import { fst, RecipeSchema, listAllFiles } from '../src';
import { fixtures, listFiles, testOutDir, testOutDirname } from './shared/helpers';

const basicRecipe: RecipeSchema = {
  from: fixtures,
  to: testOutDirname,
};

describe(relative(process.cwd(), __filename), () => {
  let moxy: MoxyServer;
  let fixtureFiles: string[];

  before(async () => {
    moxy = new MoxyServer({ logging: 'error' });
    await moxy.listen();
    fixtureFiles = await listFiles(fixtures, true);
  });

  beforeEach(async () => {
    await rm(testOutDir, { recursive: true, force: true }).catch(() => {});
    expect(await listAllFiles(testOutDir).catch((e) => e.code)).to.equal('ENOENT');

    moxy.resetRoutes();
  });

  after(async () => {
    await moxy.close({ closeConnections: true });
  });

  it('can generate from basic schema', async () => {
    await fst([basicRecipe], { parallel: 1 });

    expect(await listFiles(testOutDir, true)).to.deep.equals(fixtureFiles);
  });

  it('can generate from basic schema (chained)', async () => {
    const recipe: RecipeSchema = {
      name: 'nested project',
      to: `${testOutDir}/some/stub`,
      recipes: [basicRecipe],
    };

    await fst([recipe], { parallel: 1 });

    expect(await listFiles(testOutDir, true)).to.deep.equals(fixtureFiles.map((fixture) => join('/some/stub/test-output', fixture)));
  }).timeout(0);

  it('can generate from schema URI', async () => {
    moxy.on('/server/basic.fstr.json', {
      get: {
        status: 200,
        body: basicRecipe,
      },
    });

    await fst([{ from: `http://localhost:${moxy.port}/server/basic.fstr.json` }], { parallel: 1 });

    const output = await listFiles(testOutDir, true);
    expect(output).to.deep.equals(fixtureFiles);
  });

  it('can generate from git', async () => {
    return true;
  });
});
