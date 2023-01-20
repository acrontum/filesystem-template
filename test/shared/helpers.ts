import { resolve } from 'path';
import { listAllFiles } from '../../src';

export const root = resolve(`${__dirname}/../../..`);

export const fixtures = resolve(`${root}/test/fixtures`);

export const getFixturePath = (name: string) => resolve(`${fixtures}/${name}`);

export const getFixture = (name: string) => require(getFixturePath(name));

export const testOutDirname = 'test-output';

export const testOutDir = resolve(`${__dirname}/../../../${testOutDirname}`);

export const listFiles = async (path: string, removePrefix = false): Promise<string[]> => {
  const files = await listAllFiles(path);

  return files.reduce((acc, { files }) => {
    if (removePrefix) {
      files = files.map((file) => file.replace(path, ''));
    }

    return acc.concat(files);
  }, []);
};
