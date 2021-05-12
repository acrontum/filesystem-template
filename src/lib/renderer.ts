import { basename, relative } from 'path';
import { promises } from 'fs';
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
  handlers: Record<string, Handler> = {};
  templaters: Record<string, Handler> = {};
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
  registerTemplater(ext: string, templater: Handler) {
    this.templaters[ext] = templater;
  }

  /**
   * { function_description }
   *
   * @param {string}   key      The key
   * @param {Handler}  handler  The handler
   */
  registerHandler(key: string, handler: Handler) {
    this.handlers[key] = handler;
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
    const handler = this.handlers[node.action];
    const engine = this.templaters[node.ext];

    if (handler) {
      await handler(node);
    } else {
      await node.generate();
    }

    if (engine) {
      await engine(node);
    }

    node.resolve();

    // TODO: add option to limit promise stack when rendering the nodes (a->[b,c]->[[d,e],[f,g]]->...)
    await Promise.all(node.children.map((child) => this.render(opt, child)));
  }

  /**
   * { function_description }
   */
  private registerDefaultHandlers(): void {
    this.registerHandler('each', (node) => {
      return Promise.all(node.args?.values?.map?.((v: string) => node.generate(v)));
    });

    this.registerHandler('dirname', (node) => {
      return node.generate((prev) => node.name.replace('{dirname}', basename(prev)));
    });
  }
}
