import { promises } from 'fs';
import { basename, extname, join } from 'path';
import { LoggingService } from '../logging';
import { RecipeRuntimeError } from './errors';

export type PathGetter = (p?: string) => string;

const logger = new LoggingService('VirtualFile');

/**
 * A representation of a file in the source folder, prior to rendering
 *
 * @class VirtualFile (name)
 */
export class VirtualFile {
  id: Symbol;
  name: string;
  relativeSourcePath: string;
  fullSourcePath: string;
  isDir: boolean;
  children: VirtualFile[];
  outputs: string[];
  resolve: () => void;
  reject: (...args: any[]) => void;
  generated?: Promise<void>;
  baseUrl?: string;
  root?: VirtualFile;
  parent?: VirtualFile;
  ext?: string;
  action?: string;
  args?: Record<string, any>;
  waitSiblings?: boolean;
  skip?: boolean;

  constructor(type: string, relativeSourcePath: string) {
    this.id = Symbol('VirtualFile');
    this.relativeSourcePath = relativeSourcePath;
    this.name = basename(relativeSourcePath) || '/';
    this.isDir = type === 'dir';
    this.outputs = [];
    this.children = [];
    this.skip = false;
    if (!this.isDir) {
      this.ext = extname(this.name);
    }
    this.prepare();
  }

  addChild(child: VirtualFile): boolean {
    this.children.push(child);

    return true;
  }

  removeChild(child: VirtualFile): boolean {
    const len = this.children.length;
    this.children = this.children.filter((c) => c.id !== child.id);

    return this.children.length !== len;
  }

  setParent(parent: VirtualFile): boolean {
    if (!parent) {
      return false;
    }
    if (this.parent) {
      this.parent.removeChild(this);
    }
    this.parent = parent;

    return parent.addChild(this);
  }

  getSiblings(): VirtualFile[] {
    return this.parent?.children?.filter?.((n) => n.id !== this.id) || [];
  }

  async generateSiblings(): Promise<string[]> {
    this.waitSiblings = true;

    const outputs: string[] = [];
    const waiting = this.getSiblings().map(async (siblingNode) => {
      if (siblingNode.waitSiblings) {
        throw new RecipeRuntimeError('Multiple nodes are waiting for siblings');
      }

      await siblingNode.generated;

      outputs.push(...siblingNode.outputs);
    });

    await Promise.all(waiting);

    return outputs;
  }

  async generateFiles(name?: string | PathGetter): Promise<string[]> {
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

  getOutputs(name?: string | PathGetter): string[] {
    if (this.outputs.length) {
      return this.outputs;
    }

    const getFileName = this.getPathBuilder(name);

    return this.getPrevOut().map((out) => join(out, getFileName(out)));
  }

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

  async mkfile(name?: string | PathGetter): Promise<string[]> {
    const getFileName = this.getPathBuilder(name);

    await Promise.all(
      this.getPrevOut().map(async (out) => {
        const output = join(out, getFileName(out));
        const exists = await promises
          .access(output)
          .then(() => true)
          .catch(() => false);
        if (exists) {
          logger.debug(`${this.name}: exists ${output}`);
          return;
        }
        await promises.copyFile(this.fullSourcePath, output);
        this.outputs.push(output);
        logger.debug(`${this.name}: out ${output}`);

        return output;
      }),
    );

    return this.outputs;
  }

  toJSON(): Record<string, any> {
    return {
      ...this,
      name: this.name,
      parent: this.parent ? `VirtualFile<${this.parent.name}>` : null,
      children: this.children.map((c) => `VirtualFile<${c.name}>`),
    };
  }

  private getPathBuilder(name?: string | PathGetter): PathGetter {
    let getter: PathGetter = () => this.name;
    if (typeof name === 'function') {
      getter = name;
    } else if (typeof name === 'string') {
      getter = () => name;
    }

    return getter;
  }

  private getPrevOut(): string[] {
    return this.baseUrl ? [this.baseUrl] : this.parent?.outputs;
  }

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

      return { ...acc, [key]: /,/.test(value) ? value.split(',') : value };
    }, {});
  }
}
