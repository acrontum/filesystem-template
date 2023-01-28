import { createHash } from 'crypto';
import { promises } from 'fs';
import { relative } from 'path';
import { VirtualFile } from './virtual-file';

export type HandlerMethod = (node: VirtualFile) => string[] | void | Promise<string[] | void>;
export type HandlerOptions = {
  /*
   * Prevent other handlers from running after
   */
  stopPropagation?: boolean;
};

export type Handler = {
  run: HandlerMethod;
  options?: HandlerOptions;
};

export interface RenderOptions {
  /**
   * Recursively remove dest folder before rendering
   * default: false
   */
  cleanFirst?: boolean;
}

export class Renderer {
  handlers: Handler[] = [];
  dest: string;
  root: VirtualFile;
  cache: Record<string, Function> = {};

  constructor(root: VirtualFile, dest: string) {
    this.dest = dest;
    this.root = root;
    this.root.baseUrl = relative(process.cwd(), dest) || '.';
  }

  /**
   * Add a handler which is called on each file during render
   *
   * @param {HandlerMethod}  run      Handler callback
   * @param {HandlerOptions} options  The handler options
   */
  onFile(run: HandlerMethod, options?: HandlerOptions): void {
    options = { stopPropagation: false, ...options };
    this.handlers.push({ run, options });
  }

  async renderTree(opt?: RenderOptions): Promise<void> {
    if (opt?.cleanFirst) {
      await promises.rm(this.dest, { recursive: true, force: true });
    }

    await this.render([this.root]);
  }

  async render(nodes?: VirtualFile[]): Promise<void> {
    while (nodes.length) {
      const batch = nodes.splice(0, 10);

      await Promise.all(
        batch.map(async (node) => {
          for (const handler of this.handlers) {
            await handler.run(node);
            if (handler.options?.stopPropagation) {
              break;
            }
          }

          if (!node.outputs.length && !node.skip) {
            await node.generateFiles();
          }

          node.resolve();
          nodes.push(...node.children);
        }),
      );
    }
  }

  /**
   * Simple template render function
   *
   * Treats a file as a js template string using interpolation to render
   *
   * @param  {string}  template           The template
   * @param  {any}     [templateVars={}]  The template variables
   *
   * @return {string}  Rendered template
   */
  renderAsTemplateString(template: string, templateVars: any = {}): string {
    const data = { _indent: this.indent, ...templateVars };

    const contentHash = createHash('md5').update(template).digest('base64');

    if (!this.cache[contentHash]) {
      const params = Object.keys(data).join(', ');
      const indenter = typeof data._indent === 'function' ? '_indent' : '';
      this.cache[contentHash] = new Function('data', `return ((${params}) => ${indenter}\`${template}\`)(...Object.values(data));`);
    }

    return this.cache[contentHash](data);
  }

  private indent(strings: string[], ...templateVars: string[]): string {
    let result = '';
    for (let i = 0; i < strings.length; ++i) {
      let arg = templateVars?.[i];
      if (typeof arg === 'string' && arg?.indexOf?.('\n') !== -1) {
        const indent = (strings[i]?.replace?.(/.*\n/g, '') ?? '')?.length;
        if (indent) {
          arg = arg.replace(/\n+/g, `\n${' '.repeat(indent)}`);
        }
      }
      result += `${strings[i] ?? ''}${arg ?? ''}`;
    }

    return result;
  }
}
