/**
 * usage:
 *   {{ extend('path/to/model.yml', options) }}
 *
 * options is an object with any of these keys:
 *   omit: array of nested keys to remove
 *   require: array of nested keys to make required
 *   optional: array of nested keys to make optional
 *   include: array of arrays. first element is nested key, second is schema object
 *
 *
 * example:
 *   given a model (model.yml):
 *
 *   type: object
 *   required:
 *     - deletedAt
 *   properties:
 *     id:
 *       type: string
 *       format: uuid
 *     deletedAt:
 *       type: string
 *       format: date-time
 *     name:
 *       type: string
 *
 *   and another schema (post.yml):
 *   {{
 *     extend('./model.yml', {
 *       omit: [
 *         'properties.id'
 *       ],
 *       require: [
 *         'properties.name'
 *         'properties.codename'
 *       ],
 *       optional: [
 *         'properties.deletedAt'
 *       ],
 *       include: [
 *         ['properties.codename', { type: 'string' }]
 *       ]
 *     })
 *   }}
 *
 *   will produce (post.yml):
 *
 *   type: object
 *   required:
 *     - name
 *     - codename
 *   properties:
 *     deletedAt:
 *       type: string
 *       format: date-time
 *     name:
 *       type: string
 *     codename:
 *       type: string
 *
 */

const { resolve, join, dirname } = require('path');
const jsYaml = require('js-yaml');
const { readFileSync } = require('fs');

const getContainerObj = (object, key) => {
  let item = object;
  const parts = key.split(/[\.[\]]+/).filter(Boolean);
  const last = parts.pop();
  let lastProp = null;

  for (const part of parts) {
    if (part === 'properties') {
      lastProp = item;
    }
    item = item?.[part];
  }

  return { item, last, lastProp };
};

const deleteNested = (object, key) => {
  const { item, last } = getContainerObj(object, key);

  if (Array.isArray(item)) {
    item.splice(last, 1);
  } else {
    delete item?.[last];
  }

  return object;
};

const setNested = (object, key, value) => {
  const { item, last } = getContainerObj(object, key);
  item[last] = value;

  return object;
};

const required = (object, key, isRequired) => {
  const { last, lastProp } = getContainerObj(object, key);

  if (lastProp) {
    lastProp.required = lastProp.required || [];

    if (isRequired) {
      lastProp.required.push(last);
    } else {
      const index = lastProp.required.indexOf(last);
      if (index > -1) {
        lastProp.required.splice(index, 1);
      }
    }
  }

  return object;
};

// have to use function here to extract the 'this' scope from the helper loader
module.exports = (njk) =>
  function (modelPath, options) {
    const modelFilePath = join(dirname(this.env.globals.currentFilePointer), modelPath);
    const modelFile = resolve(modelFilePath);

    const content = readFileSync(modelFile, 'utf8');
    const modelObject = jsYaml.load(njk.renderString(content));

    (options?.require || []).forEach((requiredKey) => required(modelObject, requiredKey, true));
    (options?.optional || []).forEach((optionalKey) => required(modelObject, optionalKey, false));
    (options?.omit || []).forEach((omitKey) => deleteNested(modelObject, omitKey));
    (options?.include || []).forEach(([includeKey, def]) => setNested(modelObject, includeKey, def));

    return jsYaml.dump(modelObject);
  };
