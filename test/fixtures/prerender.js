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
    swaggerFilePath: './test/fixtures/api.json',
    targetDir: './test-output',
    template: 'egal',
    mockServer: false,
    dontUpdateTplCache: true,
    dontRunComparisonTool: true,
};
const camelCase = (input) => input.replace(/([0-9].)|[^a-zA-Z0-9]+(.)?/g, (_, s = '', q = '', i) => (i ? (s || q).toUpperCase() : s || q));
const pascalCase = (input) => {
    const camel = camelCase(input);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
};
const openapiFiles = (config) => {
    const files = {};
    const ops = Object.entries(config.swagger.paths);
    for (const [fullPath, pathProperties] of ops) {
        const groupName = pathProperties.groupName;
        const colonVarPath = fullPath.replace(/}/g, '').replace(/{/g, ':');
        files[groupName] = (files[groupName] || []).concat({
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
    swagger2openapi.convertFile(filePath, {}, (err, opts) => (err ? reject(err) : resolve(opts)));
});
void [oa2ToOa3];
let mapped = null;
const gen = () => __awaiter(void 0, void 0, void 0, function* () {
    if (mapped) {
        return mapped;
    }
    let extendedConfig = Object.assign(Object.assign({}, config), { templates: 'source-path', interfaceStyle: 'interface', nodegenRc: {} });
    OpenAPIBundler_1.default.copyInputFileToProject = () => null;
    extendedConfig.swagger = yield OpenAPIBundler_1.default.bundle(config.swaggerFilePath, extendedConfig);
    mapped = openapiFiles(extendedConfig);
    fs_1.promises.writeFile('/tmp/swag.json', JSON.stringify(mapped, null, 2));
    return mapped;
});
const helpers = {
    pathMethodsHaveAttr(ops, ...parts) {
        const merged = parts.reduce((a, p) => a.concat(p.split('.')), []);
        let result = ops.reduce((a, o) => a.concat(Object.values(o.path)), []);
        while (merged.length) {
            const next = merged.shift();
            if (Array.isArray(result)) {
                result = result.reduce((a, r) => (typeof r === 'object' && next in r ? a.concat(r[next]) : a), []);
            }
            else {
                result = result === null || result === void 0 ? void 0 : result[next];
            }
            if (typeof result === 'undefined' || (result === null || result === void 0 ? void 0 : result.length) === 0) {
                return false;
            }
        }
        return !!result;
    },
    importInterfaces() {
        return ['asdf'];
    },
    ucFirst: pascalCase,
    isValidMethod(method) {
        void [method];
        return true;
    },
    getSecurityNames() {
        return '';
    },
    getSingleSuccessResponse(responses) {
        const codes = Object.keys(responses).filter(code => /^2[0-9]+$/.test(code));
        return (codes === null || codes === void 0 ? void 0 : codes.length) === 1 ? parseInt(codes[0], 10) : undefined;
    },
};
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
        void [outputs, rest];
    }), { stopPropagation: true });
    renderer.registerFilenameHandler('___mock.ts.njk', (node) => __awaiter(void 0, void 0, void 0, function* () {
        const outputs = node.getOutputs();
        const { root, parent } = node, rest = __rest(node, ["root", "parent"]);
        void [outputs.length > 1 ? outputs.join(' ') : outputs[0], rest];
    }), { stopPropagation: true });
    renderer.registerFilenameHandler('___op.ts.njk', (node) => __awaiter(void 0, void 0, void 0, function* () {
        const parentPath = node.parent.outputs[0];
        const suffix = pascalCase((0, path_1.basename)(parentPath));
        const outputs = [];
        const _a = yield gen(), { config } = _a, opMap = __rest(_a, ["config"]);
        for (let [name, operations] of Object.entries(opMap)) {
            if (/interface/i.test(parentPath)) {
                name = name.charAt(0).toUpperCase() + name.slice(1);
            }
            const res = require('nunjucks').render(node.realPath, Object.assign(Object.assign(Object.assign({}, config), helpers), { operations, operation_name: name }));
            const outPath = (0, path_1.join)(parentPath, `${name}${suffix}.ts`);
            yield fs_1.promises.writeFile(outPath, res);
            outputs.push(outPath);
        }
        return outputs;
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