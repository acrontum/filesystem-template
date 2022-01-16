import { fst, walk } from '../../src';
import { testOutDir, getFixturePath } from '../../test/shared/helpers';
import { relative } from 'path';

describe('fst e2e', () => {
  it('can generate a codebase', async () => {
    // process.env.FST_LOG = 'debug';
    process.env.FST_LOG = 'info';

    const result = await fst(
      [
        {
          name: 'gen server',
          from: 'https://github.com/acr-lfr/generate-it-typescript-server',
          to: testOutDir,
          scripts: {
            before: '[ -d node_modules ] || { npm init --yes && npm i generate-it generate-it-mockers prettier; }',
            after: 'echo all done here',
            prerender: getFixturePath('prerender.js'),
          },
        },
      ],
      { cache: true },
    );

    void [walk, relative];
    // const files = await walk(testOutDir);

    console.log({ result, testOutDir });
  }).timeout(0);
});
