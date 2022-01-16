import { promises } from 'fs';
import { basename, relative } from 'path';
import { FNode } from './fnode';
import { LoggingService } from './log.service';

export type HandlerMethod = (node: FNode) => string[] | void | Promise<string[] | void>;
export type HandlerOptions = {
  /*
   * Prevent oter handlers from running after
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
  /**
   * Render all child nodes recursively
   * default: true. Does nothing when false at the moment...
   */
  recursive?: boolean;
}

const logger = new LoggingService('renderer');

/**
 * This class describes a renderer.
 *
 * @class Renderer (name)
 */
export class Renderer {
  keyHandlers: Record<string, Handler[]> = {};
  filenameHandlers: Record<string, Handler[]> = {};
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
  registerFilenameHandler(ext: string, run: HandlerMethod, options?: HandlerOptions) {
    options = { stopPropagation: false, ...options };
    this.filenameHandlers[ext] = (this.filenameHandlers[ext] || []).concat({ run, options });
    logger.debug(`registered templater for ${ext}`);
  }

  /**
   * { function_description }
   *
   * @param {string}   key      The key
   * @param {Handler}  handler  The handler
   */
  registerKeyHandler(key: string, run: HandlerMethod, options?: HandlerOptions) {
    options = { stopPropagation: false, ...options };
    this.keyHandlers[key] = (this.keyHandlers[key] || []).concat({ run, options });
    logger.debug(`registered handler for ${key}`);
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

    const keyHandler = this.keyHandlers[node.action];
    if (keyHandler?.length) {
      for (const handler of keyHandler) {
        node.outputs = [...node.outputs, ...((await handler.run(node)) || [])];
        if (handler.options.stopPropagation) {
          break;
        }
      }
    }

    if (!node.isDir) {
      const engines = node.exts.reduce((exts, ext) => exts.concat([...(this.filenameHandlers[ext] || [])]), []);
      if (engines?.length) {
        for (const engine of engines) {
          node.outputs = [...node.outputs, ...((await engine.run(node)) || [])];
          if (engine.options.stopPropagation) {
            break;
          }
        }
      }
    }

    if (!node.outputs.length) {
      await node.generate();
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
