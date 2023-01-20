import { MoxyServer } from '@acrontum/moxy';
import { expect } from 'chai';
import { promises } from 'fs';
import { relative } from 'path';
import { fst } from '../src';
import { getFixture, testOutDir } from './shared/helpers';

describe(relative(process.cwd(), __filename), () => {
  const logging = process.env.FST_LOG;
  let moxy: MoxyServer;

  before(async () => {
    moxy = new MoxyServer({ logging: 'error' });
    await moxy.listen(9102);
    process.env.FST_LOG = 'none';
  });

  after(async () => {
    process.env.FST_LOG = logging;
    await moxy.close({ closeConnections: true });
  });

  beforeEach(async () => {
    await promises.rm(testOutDir, { recursive: true, force: true });
  });

  const runAndExpectError = async (file: string, errMessage: string): Promise<any> => {
    const err = await fst(getFixture(file), { output: testOutDir }).catch((e) => e);
    expect(`${err.name ? `${err.name}: ` : ''}${err.message}`).to.equal(errMessage);

    return err;
  };

  it('validates circular-3way.fstr.json', async () => {
    await runAndExpectError('recipes/invalid/circular-3way.fstr.json', 'InvalidSchemaError: recipes have circular dependencies (a -> b -> c -> a)');
  });

  it('validates circular-complex.fstr.json', async () => {
    await runAndExpectError(
      'recipes/invalid/circular-complex.fstr.json',
      'InvalidSchemaError: recipes have circular dependencies (parent 2 -> great grandchild -> parent 2)',
    );
  });

  it('validates circular-parent-to-child.fstr.json', async () => {
    await runAndExpectError(
      'recipes/invalid/circular-parent-to-child.fstr.json',
      'InvalidSchemaError: recipes cannot depend on sub-recipes (parent -> child)',
    );
  });

  it('validates circular-simple.fstr.json', async () => {
    await runAndExpectError(
      'recipes/invalid/circular-simple.fstr.json',
      'InvalidSchemaError: recipes have circular dependencies (after you, A -> after you, B -> after you, A)',
    );
  });

  it('validates source-does-not-exist.fstr.json', async () => {
    await runAndExpectError('recipes/invalid/source-does-not-exist.fstr.json', 'InvalidSchemaError: Source not found');
  });

  it('validates unmet-dependency.fstr.json', async () => {
    await runAndExpectError('recipes/invalid/unmet-dependency.fstr.json', 'RecipeRuntimeError: Unmet dependencies');
  });

  it('validates url-invalid.fstr.json', async () => {
    const err = await runAndExpectError('recipes/invalid/url-invalid.fstr.json', 'Failed to fetch from URL');

    expect(err.error.message).to.equal('getaddrinfo ENOTFOUND xyz.n');
  });

  it('validates url-not-found.fstr.json', async () => {
    moxy.on('/fstr/thing.fstr.json', { get: { status: 404 } });

    const err = await runAndExpectError('recipes/invalid/url-not-found.fstr.json', 'Failed to fetch from URL');
    expect(err.response.statusCode).to.equal(404);
  });
});
