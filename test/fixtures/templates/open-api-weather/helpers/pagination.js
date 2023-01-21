module.exports = (njk) => (options) => {
  let template = `$ref: "./model.yml"`;
  if (options?.path || typeof options === 'string') {
    template = `$ref: "${options?.path || options}"`;
  } else if (options?.template) {
    template = njk.renderString(options.template);
  }

  return `\
type: object
properties:
  meta:
    $ref: "#/components/schemas/Pagination"
  data:
    type: array
    items:
      ${template}
`;
};
