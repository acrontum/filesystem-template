import { resolve } from 'path';

export const root = resolve(`${__dirname}/../../..`);
// export const root = resolve(process.cwd());

export const fixtures = resolve(`${root}/test/fixtures`);

export const getFixturePath = (name: string) => resolve(`${fixtures}/${name}`);

export const getFixture = (name: string) => require(getFixturePath(name));

export const testOutDir = resolve(`${__dirname}/../../test-output`);
