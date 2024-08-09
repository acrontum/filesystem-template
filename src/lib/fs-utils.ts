import { exec as execCb, ExecOptions } from 'child_process';
import { fdir, GroupOutput } from 'fdir';
import { createWriteStream, promises } from 'fs';
import * as http from 'http';
import * as https from 'https';
import { dirname, join, posix, resolve } from 'path';
import { fileURLToPath, URL } from 'url';
import { LoggingService } from '../logging';
import { RecipeRuntimeError } from './errors';
import { VirtualFile } from './virtual-file';

export interface SourceOptions {
  root?: string;
  subdirs?: string[];
  cache?: boolean;
  packageRoot?: string;
}

export interface TreeOptions {
  exclude?: string[];
}

export interface CacheInfo {
  path: string;
  branch?: string;
  origin?: string;
  repoName?: string;
}

const logger = new LoggingService('file-utils');
export const runtimeCache: Record<string, Promise<any>> = {};

const exec = (command: string, options: ExecOptions): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    execCb(command, options, (err, stdout, stderr) => (err ? reject(err) : resolve({ stdout, stderr })));
  });
};

export const exists = (path: string): Promise<boolean> =>
  promises
    .access(path)
    .then(() => true)
    .catch(() => false);

export const isRecipeFile = (file: string): boolean => /\.fstr\.js(on)?$/.test(file);

export const isRepo = (file: string): boolean => /\.git([?#].*)?$/.test(file);

/**
 * Build an in-memory filesystem from root folder "dirPath". By default, node_modules and .git are excluded and
 * can be included by including inverted names in opts.ignore: ['dist', '!.git', '!node_modules'].
 *
 * @param  {string}            dirPath        Root dir to list
 * @param  {string[]}          opts.exclude   Array of strings to skip (exact match files / folders).
 *
 * @return {Promise<VirtualFile>}  The root of the file tree, with all child nodes built
 */
export const generateVirtualFileTree = async (dirPath: string, opts?: TreeOptions): Promise<VirtualFile> => {
  const fsTree: Record<string, VirtualFile> = {};
  let root: VirtualFile = null;

  const getVirtualFile = (type: string, fullSourcePath: string, rootPath = dirPath) => {
    fullSourcePath = fullSourcePath.replace(/\/+$/, '');
    const name = fullSourcePath.replace(rootPath, '') || '/';
    const node = new VirtualFile(type, { root, fullSourcePath, relativeSourcePath: name });

    if (!root) {
      root = node;
    }

    const parentName = dirname(name || '/');

    node.setParent(fsTree[parentName]);
    fsTree[name] = node;

    return node;
  };

  if ((await promises.stat(dirPath)).isFile()) {
    getVirtualFile('dir', dirPath);
    getVirtualFile('file', dirPath, dirname(dirPath));

    return root;
  }

  const allExcludes = ['.git', 'node_modules'];
  if (Array.isArray(opts?.exclude) && opts.exclude.length) {
    allExcludes.push(...opts.exclude);
  }

  const ignore: Record<string, boolean> = {};
  for (const dir of allExcludes) {
    const negate = dir[0] === '!';
    if (negate) {
      delete ignore[dir.slice(1)];
    } else {
      ignore[dir] = true;
    }
  }

  for (const key in ignore) {
    if (!ignore[key]) {
      delete ignore[key];
    }
  }

  const groups = await listAllFiles(dirPath, ignore);
  for (const { directory, files } of groups) {
    getVirtualFile('dir', directory);

    for (const file of files) {
      getVirtualFile('file', file);
    }
  }

  return root;
};

/**
 * Recursively list all files.
 *
 * @param  {string}                   dir      Root dir to list
 * @param  {Record<string, boolean>}  ignore   Object with keys = files / folders, values = true / false
 *
 * @return {Promise<Group[]>}  An array of groups of folders and files
 */
export const listAllFiles = (dir: string, ignore?: Record<string, boolean>): Promise<GroupOutput> => {
  const ignores = Object.keys(ignore);
  const rootFilePath = dir + '/';

  return new fdir<GroupOutput>({
    includeBasePath: true,
    group: true,
    filters: [
      (path: string) => {
        if (ignore[path]) {
          return false;
        }
        const relpath = path.replace(rootFilePath, '');
        if (ignore[relpath]) {
          return false;
        }

        for (const ignore of ignores) {
          if (path.indexOf(ignore) === 0 || relpath.indexOf(ignore) === 0) {
            return false;
          }
        }

        return true;
      },
    ],
  })
    .crawl(dir)
    .withPromise();
  // .then((groups) => groups.sort((a, b) => a.directory.localeCompare(b.directory)));
};

export const fetchSource = async (pathlike: string, options?: SourceOptions): Promise<string> => {
  options = options || {};
  options.packageRoot ||= process.cwd();

  if (await exists(pathlike)) {
    logger.log(`will copy ${logger.grn(pathlike)}`);

    return pathlike;
  }

  let url: URL;
  try {
    url = new URL(pathlike);
  } catch (e) {
    // not a url
    throw new RecipeRuntimeError(`file not found ${pathlike}`);
  }

  const cache = await getChacheInfo(url, options.packageRoot);

  if (cache?.path in runtimeCache) {
    return await runtimeCache[cache?.path].catch((e) => {
      console.trace(e);
      throw e;
    });
  }

  runtimeCache[cache?.path] = new Promise<string>(async (resolve, reject) => {
    try {
      if (await exists(cache?.path)) {
        logger.log(`cache hit on ${cache?.path}`);

        return cache?.path;
      }

      let result: string;
      if (isRepo(url.pathname)) {
        result = await fetchRepo(cache, options);
      } else {
        result = await fetchFileFromUrl(url, cache, options);
      }

      return resolve(result);
    } catch (e) {
      return reject(e);
    }
  });

  return await runtimeCache[cache?.path];
};

export const getChacheInfo = async (url: URL, packageRoot: string): Promise<CacheInfo> => {
  const projectDir = packageRoot;

  if (!isRepo(url.pathname)) {
    const filename = `.fst/remote/${url.hostname}${url.pathname}${url.search?.replace?.('?', '-')}`;

    return { path: join(projectDir, filename) };
  }

  let branch = url?.hash?.slice?.(1);
  const repoName = `.fst/remote/${url.pathname.slice(1) || url.hostname}`;
  const repo = posix.join(projectDir, repoName);
  const origin = url.href.replace(url.hash, '').replace(url.search, '');

  return { path: repo, origin, repoName, branch };
};

export const fetchFileFromUrl = async (url: URL, cacheInfo: CacheInfo, options?: SourceOptions): Promise<string> => {
  const output = resolve(cacheInfo.path);

  if (options?.cache && (await exists(output))) {
    logger.info(`will copy ${logger.grn(output)} (cached)`);

    return output;
  }

  await new Promise<string>((resolve, reject) => {
    const req = (url.protocol == 'http:' ? http : https).request(url, async (res) => {
      if (res.statusCode < 300) {
        await promises.mkdir(dirname(output), { recursive: true });

        return res
          .pipe(createWriteStream(output))
          .on('finish', () => resolve(output))
          .on('error', reject);
      }

      if (res.statusCode < 400) {
        return fetchFileFromUrl(new URL(res.headers.location), cacheInfo, options);
      }

      res.on('error', (error) => reject({ message: `Failed to fetch from URL`, url: url.href, error }));

      let data = '';
      res.on('data', (d) => (data += d.toString()));
      res.on('end', () => {
        const { statusCode, headers } = res;
        reject({ message: `Failed to fetch from URL`, url: url.href, response: { statusCode, headers, body: data } });
      });
    });

    req.on('error', (error) => reject({ message: `Failed to fetch from URL`, url: url.href, error }));
    req.end();
  });

  return output;
};

export const fetchRepo = async (cacheInfo: CacheInfo, options?: SourceOptions): Promise<string> => {
  let branch = cacheInfo.branch;
  const { path: repo, origin, repoName } = cacheInfo;

  if (options?.cache && (await exists(repo))) {
    logger.info(`will copy repo ${logger.grn(repoName)} (cached)`);

    return repo;
  }

  logger.debug({ branch, repo, origin });
  logger.info(`will clone ${branch ? `${logger.blu(branch)} of ` : ''}${logger.ylw(origin)} into ${logger.grn(repoName)}`);

  const cwd = repo;
  try {
    await promises.mkdir(repo, { recursive: true });

    if (!(await exists(join(cwd, '.git')))) {
      await exec('git init', { cwd });
      await exec(`git remote add -f origin ${origin}`, { cwd }).catch((e) => {
        if (e?.message?.indexOf('remote origin already exists') !== -1) {
          return;
        }
        throw e;
      });
    }

    if (options?.subdirs?.length) {
      await exec('git config core.sparseCheckout true', { cwd });
      await promises.writeFile(join(cwd, '.git/info/sparse-checkout'), options.subdirs.join('\n'), { encoding: 'utf8' });
    }

    if (!branch) {
      const remote = await exec('git remote show origin', { cwd });
      const head = 'HEAD branch: ';
      const start = remote.stdout.indexOf(head);
      const end = remote.stdout.indexOf('\n', start);
      branch = remote.stdout.slice(start + head.length, end);
    }

    await exec(`git fetch origin ${branch}`, { cwd });
    await exec(`git reset --hard origin/${branch}`, { cwd });

    return repo;
  } catch (e) {
    console.trace(e);
    await promises.rm(repo, { recursive: true, force: true } as any).catch(() => null);
    throw e;
  }
};
