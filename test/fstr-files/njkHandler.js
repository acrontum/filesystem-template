const { promises } = require('fs');

exports.prerender = (_recipe, renderer) => {
  renderer.registerFilenameHandler('.njk', async (node) => {
    await Promise.all(
      node.outputs.map(async (outputPath) => {
        const content = `// this file was created by njk!\n${await promises.readFile(outputPath)}`;
        return promises.writeFile(outputPath.replace('.njk', ''), content).then(() => promises.unlink(outputPath));
      })
    );
  })
};
