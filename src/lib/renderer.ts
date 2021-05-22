import { promises } from 'fs';
import { basename, relative } from 'path';
import { FNode } from './fnode';

export type Handler = (node: FNode) => Promise<any>;

export interface RenderOptions {
  /**
   * Remove dest folder before rendering
   */
  cleanFirst?: boolean;
  /**
   * Render all child nodes recursively
   */
  recursive?: boolean;
}

/**
 * This class describes a renderer.
 *
 * @class Renderer (name)
 */
export class Renderer {
  handlers: Record<string, Handler[]> = {};
  templaters: Record<string, Handler[]> = {};
  dest: string;
  root: FNode;

  constructor(root: FNode, dest: string) {
    this.dest = dest;
    this.root = root;
    this.root.baseUrl = relative(process.cwd(), dest);
    this.registerDefaultHandlers();
  }

  /**
   * { function_description }
   *
   * @param {string}   ext        The extent
   * @param {Handler}  templater  The templater
   */
  registerFilenameHandler(ext: string, templater: Handler) {
    this.templaters[ext] = [...(this.templaters[ext] || []), templater];
  }

  /**
   * { function_description }
   *
   * @param {string}   key      The key
   * @param {Handler}  handler  The handler
   */
  registerKeyHandler(key: string, handler: Handler) {
    this.handlers[key] = [...(this.handlers[key] || []), handler];
  }

  /**
   * { function_description }
   *
   * @param  {}               opt?:RenderOptions  The option render options
   * @param  {}               node?:FNode         The node f node
   *
   * @return {Promise<void>}  { description_of_the_return_value }
   */
  async render(opt?: RenderOptions, node?: FNode): Promise<void> {
    opt = opt || { recursive: true };

    if (!node) {
      node = this.root;
      if (opt.cleanFirst) {
        await promises.rmdir(this.dest, { recursive: true });
      }
    }
    const handlers = this.handlers[node.action];

    if (handlers?.length) {
      for (const handler of handlers) {
        await handler(node);
      }
    } else {
      await node.generate();
    }

    if (!node.isDir) {
      const engines = node.exts.reduce((exts, ext) => exts.concat([...(this.templaters[ext] || [])]), []);
      if (engines?.length) {
        for (const engine of engines) {
          await engine(node);
        }
      }
    }

    node.resolve();

    // TODO: add option to limit promise stack when rendering the nodes (a->[b,c]->[[d,e],[f,g]]->...)
    await Promise.all(node.children.map((child) => this.render(opt, child)));
  }

  /**
   * { function_description }
   */
  private registerDefaultHandlers(): void {
    this.registerKeyHandler('each', (node) => {
      return Promise.all(node.args?.values?.map?.((v: string) => node.generate(v)));
    });

    this.registerKeyHandler('dirname', (node) => {
      return node.generate((prev) => node.name.replace('{dirname}', basename(prev)));
    });
  }
}
