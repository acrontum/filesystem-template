"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
const OpenAPIBundler_1 = require("generate-it/build/lib/openapi/OpenAPIBundler");
const swagger2openapi = require("swagger2openapi");
const fs_1 = require("fs");
const path_1 = require("path");
const config = {
    verbose: false,
    veryVerbose: false,
    swaggerFilePath: '/home/pat/source/acrontum/github/fstr/examples/templates/server/api.json',
    targetDir: './out',
    template: 'egal',
    mockServer: false,
    dontUpdateTplCache: true,
    dontRunComparisonTool: true,
};
const camelCase = (input) => input.replace(/([0-9].)|[^a-zA-Z0-9]+(.)?/g, (_, s = '', q = '', i) => (i ? (s || q).toUpperCase() : s || q));
const openapiFiles = (config) => {
    void [openapiFiles];
    const files = {};
    for (const [fullPath, pathProperties] of Object.entries(config.swagger.paths)) {
        const groupName = pathProperties.groupName;
        files[groupName] = files[groupName] || [];
        const colonVarPath = fullPath.replace(/}/g, '').replace(/{/g, ':');
        files[groupName].push({
            responses: {},
            path_name: colonVarPath,
            path: pathProperties,
            subresource: colonVarPath.replace(/\/[^/]+\//, ''),
        });
    }
    const tplVars = { config };
    for (const [operationName, operations] of Object.entries(files)) {
        tplVars[camelCase(operationName.replace(/[{}]/g, ''))] = operations;
    }
    return tplVars;
};
const oa2ToOa3 = (filePath) => new Promise((resolve, reject) => {
    swagger2openapi.convertFile(filePath, {}, (err, opts) => {
        return err ? reject(err) : resolve(opts);
    });
});
void [oa2ToOa3];
let mapped;
const gen = () => __awaiter(void 0, void 0, void 0, function* () {
    if (mapped) {
        return mapped;
    }
    let extendedConfig = Object.assign(Object.assign({}, config), { templates: 'source-path', interfaceStyle: 'interface', nodegenRc: {} });
    OpenAPIBundler_1.default.copyInputFileToProject = () => null;
    extendedConfig.swagger = yield OpenAPIBundler_1.default.bundle(config.swaggerFilePath, extendedConfig);
    mapped = openapiFiles(extendedConfig);
    return mapped;
});
const render = (recipe, renderer) => {
    void [recipe, renderer];
    renderer.registerFilenameHandler('___eval.ts', (node) => __awaiter(void 0, void 0, void 0, function* () {
        const output = (0, path_1.resolve)(node.getOutputs()[0].replace('.ts', '.js'));
        const res = require('typescript').transpileModule(yield fs_1.promises.readFile(node.realPath, 'utf8'), {});
        yield fs_1.promises.writeFile(output, res.outputText);
        yield require(output).default(Object.assign(Object.assign({}, (yield gen()).config), { dest: (0, path_1.dirname)(output), nodegenRc: { helpers: { tests: {} } } }));
        yield fs_1.promises.unlink(output);
        return [output.replace(/___.*/, 'index.ts')];
    }));
    renderer.registerFilenameHandler('___stub.ts.njk', (node) => __awaiter(void 0, void 0, void 0, function* () {
        const { root, parent } = node, rest = __rest(node, ["root", "parent"]);
        const outputs = node.getOutputs()[0];
        void ([
            outputs,
            rest
        ]);
    }), { stopPropagation: true });
    renderer.registerFilenameHandler('___mock.ts.njk', (node) => __awaiter(void 0, void 0, void 0, function* () {
        const outputs = node.getOutputs();
        const { root, parent } = node, rest = __rest(node, ["root", "parent"]);
        void ([outputs.length > 1 ? outputs.join(' ') : outputs[0], rest]);
    }), { stopPropagation: true });
    renderer.registerFilenameHandler('___op.ts.njk', (node) => __awaiter(void 0, void 0, void 0, function* () {
        const outputs = node.getOutputs();
        const { root, parent } = node, rest = __rest(node, ["root", "parent"]);
        void ([outputs.length > 1 ? outputs.join(' ') : outputs[0], rest]);
    }), { stopPropagation: true });
    renderer.registerFilenameHandler('___interface.ts.njk', (node) => __awaiter(void 0, void 0, void 0, function* () {
        const outdir = node.parent.outputs[0];
        const outputs = [];
        const config = yield gen();
        const interfaces = config.config.swagger.interfaces;
        for (const int of interfaces) {
            const filename = `${outdir}/${int.name}.ts`;
            yield fs_1.promises.writeFile(filename, int.content.outputString);
            outputs.push(filename);
        }
        return outputs;
    }), { stopPropagation: true });
    renderer.registerFilenameHandler('.njk', (node) => __awaiter(void 0, void 0, void 0, function* () {
        const output = node.getOutputs()[0].replace('.njk', '');
        void ([`shouldnt have spetzle -> ${output}`]);
        const res = require('nunjucks').render(node.realPath, (yield gen()).config);
        yield fs_1.promises.writeFile(output, res);
        return [output];
    }));
};
if (require.main === module) {
    gen().catch(console.error);
}
module.exports = render;
//# sourceMappingURL=gen-shim.js.map