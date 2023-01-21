import { MoxyServer } from '@acrontum/moxy';
import { expect } from 'chai';
import { rm } from 'fs/promises';
import { join, relative } from 'path';
import { fst, listAllFiles, RecipeSchema } from '../src';
import { fixtures, getFixturePath, listFiles, testOutDir, testOutDirname } from './shared/helpers';
import { moxyServeAsGit } from './shared/moxy-git';

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
    fixtureFiles = await listFiles(fixtures, { removePrefix: true });
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

    expect(await listFiles(testOutDir, { removePrefix: true })).to.deep.equals(fixtureFiles);
  });

  it('can generate from basic schema (chained)', async () => {
    const recipe: RecipeSchema = {
      name: 'nested project',
      to: `${testOutDir}/some/stub`,
      recipes: [basicRecipe],
    };

    await fst([recipe], { parallel: 1 });

    expect(await listFiles(testOutDir, { removePrefix: true })).to.deep.equals(
      fixtureFiles.map((fixture) => join('/some/stub/test-output', fixture)),
    );
  }).timeout(0);

  it('can generate from schema URI', async () => {
    moxy.on('/server/basic.fstr.json', {
      get: {
        status: 200,
        body: basicRecipe,
      },
    });

    await fst([{ from: `http://localhost:${moxy.port}/server/basic.fstr.json` }], { parallel: 1 });

    const output = await listFiles(testOutDir, { removePrefix: true });
    expect(output).to.deep.equals(fixtureFiles);
  });

  it('can generate from git', async () => {
    moxyServeAsGit(moxy, getFixturePath('templates'));

    const recipe = {
      name: 'http.git',
      from: `http://localhost:${moxy.port}/repos/open-api-weather.git`,
      to: join(testOutDir, 'http'),
      recipes: [
        {
          name: 'ssh.git',
          from: `ssh://localhost:${moxy.port}/repos/open-api-weather.git`,
          to: '../ssh',
          scripts: {
            after: 'echo ssh.git',
          },
        },
        {
          name: 'git',
          from: `ssh+git://git@localhost:${moxy.port}/repos/open-api-weather.git`,
          to: '../git',
          scripts: {
            after: 'echo git',
          },
        },
      ],
    };

    await fst([recipe], { cache: false });

    const specFiles = await listFiles(getFixturePath('templates/open-api-weather'), { removePrefix: true });
    const httpFiles = await listFiles(join(testOutDir, 'http'), { removePrefix: true });
    const sshFiles = await listFiles(join(testOutDir, 'ssh'), { removePrefix: true });
    const gitFiles = await listFiles(join(testOutDir, 'git'), { removePrefix: true });

    expect(httpFiles).to.deep.equals(specFiles);
    expect(sshFiles).to.deep.equals(specFiles);
    expect(gitFiles).to.deep.equals(specFiles);
  });

  it('can exclude files', async () => {
    moxyServeAsGit(moxy, getFixturePath('templates'));

    const recipe: RecipeSchema = {
      name: 'http.git',
      from: `http://localhost:${moxy.port}/repos/open-api-weather.git`,
      to: testOutDir,
      excludeDirs: ['src', 'helpers'],
    };

    await fst([recipe], { cache: false });

    const files = await listFiles(testOutDir, { removePrefix: true });

    expect(files).to.deep.equals(['/.boatsrc', '/.gitignore', '/package.json']);
  });
});
