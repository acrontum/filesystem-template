import { promises } from 'fs';
import { basename, join } from 'path';
import { LoggingService } from './log.service';

export type PathGetter = (p?: string) => string;

const logger = new LoggingService('FNode');

/**
 * This class describes a f node.
 *
 * @class FNode (name)
 */
export class FNode {
  id: Symbol;
  name: string;
  relativePath: string;
  realPath: string;
  isDir: boolean;
  children: FNode[];
  outputs: string[];
  resolve: () => void;
  reject: (...args: any[]) => void;
  generated?: Promise<void>;
  baseUrl?: string;
  root?: FNode;
  parent?: FNode;
  exts?: string[];
  action?: string;
  args?: Record<string, any>;
  waitSiblings?: boolean;

  constructor(type: string, relativePath: string) {
    this.id = Symbol('FNode');
    this.relativePath = relativePath;
    this.name = basename(relativePath) || '/';
    this.isDir = type === 'dir';
    this.outputs = [];
    this.children = [];
    this.exts = [];
    if (!this.isDir) {
      const exts = this.name.split('.');
      let prefix = '';
      while (exts?.length) {
        this.exts.push(`${prefix}${exts.join('.')}`);
        exts.shift();
        prefix = '.';
      }
    }
    this.prepare();
  }

  /**
   * Adds a child.
   *
   * @param  {FNode}    child  The child
   *
   * @return {boolean}  { description_of_the_return_value }
   */
  addChild(child: FNode): boolean {
    this.children.push(child);

    return true;
  }

  /**
   * Removes a child.
   *
   * @param  {FNode}    child  The child
   *
   * @return {boolean}  { description_of_the_return_value }
   */
  removeChild(child: FNode): boolean {
    const len = this.children.length;
    this.children = this.children.filter((c) => c.id !== child.id);

    return this.children.length !== len;
  }

  /**
   * Sets the parent.
   *
   * @param  {FNode}    parent  The parent
   *
   * @return {boolean}  { description_of_the_return_value }
   */
  setParent(parent: FNode): boolean {
    if (!parent) {
      return false;
    }
    if (this.parent) {
      this.parent.removeChild(this);
    }
    this.parent = parent;

    return parent.addChild(this);
  }

  /**
   * Gets the siblings.
   *
   * @return {FNode[]}  The siblings.
   */
  getSiblings(): FNode[] {
    return this.parent?.children?.filter?.((n) => n.id !== this.id) || [];
  }

  /**
   * { function_description }
   *
   * @return {Promise<string[]>}  { description_of_the_return_value }
   */
  async generateSiblings(): Promise<string[]> {
    this.waitSiblings = true;

    const outputs: string[] = [];
    const waiting = this.getSiblings().map(async (siblingNode) => {
      if (siblingNode.waitSiblings) {
        throw new Error('Multiple nodes are waiting for siblings');
      }

      await siblingNode.generated;

      outputs.push(...siblingNode.outputs);
    });

    await Promise.all(waiting);

    return outputs;
  }

  /**
   * { function_description }
   *
   * @param  {}                   name?:string|PathGetter  The name string path getter
   *
   * @return {Promise<string[]>}  { description_of_the_return_value }
   */
  async generate(name?: string | PathGetter): Promise<string[]> {
    logger.debug(`${this.name}: generate`);
    try {
      if (this.isDir) {
        await this.mkdir(name);
      } else {
        await this.mkfile(name);
      }

      return this.outputs;
    } catch (e) {
      this.reject(e);

      return [];
    }
  }

  /**
   * { function_description }
   *
   * @param  {}                   name?:string|PathGetter  The name string path getter
   *
   * @return {Promise<string[]>}  { description_of_the_return_value }
   */
  async mkdir(name?: string | PathGetter): Promise<string[]> {
    const getFileName = this.getPathBuilder(name);

    const prev = this.getPrevOut();
    if (prev?.length) {
      await Promise.all(
        prev.map(async (out) => {
          const dir = join(out, getFileName(out));
          await promises.mkdir(dir, { recursive: true });
          this.outputs.push(dir);
          logger.debug(`${this.name}: out ${dir}`);

          return dir;
        }),
      );
    }

    return this.outputs;
  }

  /**
   * { function_description }
   *
   * @param  {}                   name?:string|PathGetter  The name string path getter
   *
   * @return {Promise<string[]>}  { description_of_the_return_value }
   */
  async mkfile(name?: string | PathGetter): Promise<string[]> {
    const getFileName = this.getPathBuilder(name);

    await Promise.all(
      this.getPrevOut().map(async (out) => {
        const dir = join(out, getFileName(out));
        await promises.copyFile(this.realPath, dir);
        this.outputs.push(dir);
        logger.debug(`${this.name}: out ${dir}`);

        return dir;
      }),
    );

    return this.outputs;
  }

  /**
   * Gets the path builder.
   *
   * @param  {}            name?:string|PathGetter  The name string path getter
   *
   * @return {PathGetter}  The path builder.
   */
  private getPathBuilder(name?: string | PathGetter): PathGetter {
    let getter: PathGetter = () => this.name;
    if (typeof name === 'function') {
      getter = name;
    } else if (typeof name === 'string') {
      getter = () => name;
    }

    return getter;
  }

  /**
   * Gets the previous out.
   *
   * @return {string[]}  The previous out.
   */
  private getPrevOut(): string[] {
    return this.baseUrl ? [this.baseUrl] : this.parent?.outputs;
  }

  /**
   * { function_description }
   */
  private prepare(): void {
    this.generated = new Promise<void>((resolve, reject) => {
      this.resolve = () => {
        logger.debug(`${this.name}: resolved`);
        resolve();
      };
      this.reject = reject;
    });

    const parts = this.name.match(/\{([^:]+)(:([^\}]+))?\}/);
    if (!parts) {
      return;
    }

    this.action = parts[1];
    this.args = parts[3]?.split?.(';')?.reduce?.((acc: Record<string, string | string[]>, v) => {
      const [key, value] = v.split('=');

      return Object.assign(acc, {
        [key]: /,/.test(value) ? value.split(',') : value,
      });
    }, {});
  }

  toJSON(): Record<string, any> {
    return {
      ...this,
      name: this.name,
      parent: this.parent ? `FNode<${this.parent.name}>` : null,
      children: this.children.map((c) => `FNode<${c.name}>`),
      // children: this.children,
    };
  }
}
