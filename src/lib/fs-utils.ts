import { exec as execCb } from 'child_process';
import { fdir } from 'fdir';
import { promises } from 'fs';
import * as http from 'http';
import * as https from 'https';
import { basename, dirname, join, resolve } from 'path';
import { URL } from 'url';
import { promisify } from 'util';
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

export interface Group {
  dir: string;
  files: string[];
}

export interface CacheInfo {
  path: string;
  branch?: string;
  origin?: string;
  repoName?: string;
}

const logger = new LoggingService('file-utils');
const exec = promisify(execCb);

export const exists = (path: string): Promise<boolean> =>
  promises
    .access(path)
    .then(() => true)
    .catch(() => false);

export const isRecipeFile = (file: string): boolean => {
  return /\.fstr\.js(on)?$/.test(file);
};

export const isRepo = (file: string): boolean => {
  return /\.git([?#].*)?$/.test(file);
};

export const generateVirtualFileTree = async (dirPath: string, opts?: TreeOptions): Promise<VirtualFile> => {
  const fsTree: Record<string, VirtualFile> = {};
  let root: VirtualFile = null;

  const getVirtualFile = (type: string, filePath: string, rootPath = dirPath) => {
    const name = filePath.replace(rootPath, '') || '/';
    const node = new VirtualFile(type, name);

    node.root = root;
    if (!root) {
      root = node;
    }
    node.fullSourcePath = filePath;

    const parent = fsTree[name?.replace(/\/[^\/]+$/, '') || '/'];
    node.setParent(parent);

    fsTree[name] = node;

    return node;
  };

  if ((await promises.stat(dirPath)).isFile()) {
    getVirtualFile('dir', dirPath);
    getVirtualFile('file', dirPath, dirname(dirPath));

    return root;
  }

  const groups = await listAllFiles(dirPath, opts?.exclude);

  groups.forEach(({ dir, files }) => {
    getVirtualFile('dir', dir);

    files.forEach((file) => {
      getVirtualFile('file', file);
    });
  });

  return root;
};

/**
 * Recursively list all files. By default, node_modules and .git are excluded.
 *
 * @param  {string}            dir      Root dir to list
 * @param  {string[]}          exclude  Array of paths to ignore
 *
 * @return {Promise<Group[]>}  An array of groups of folders and files
 */
export const listAllFiles = async (dir: string, exclude?: string[]): Promise<Group[]> => {
  const ignore: Record<string, boolean> = (exclude || ['.git', 'node_modules']).reduce((acc, dir) => ({ ...acc, [dir]: true }), {});

  const files = (await new fdir()
    .crawlWithOptions(dir, {
      includeBasePath: true,
      group: true,
      exclude: (dirname: string) => ignore[dirname],
    })
    .withPromise()) as Group[];

  return files.sort((a, b) => a.dir.localeCompare(b.dir));
};

export const getProjectRoot = async (): Promise<string> => {
  let max = parseInt(process.env.FST_PACKAGE_HEIGHT, 10);
  if (typeof max !== 'number' || Number.isNaN(max)) {
    max = 10;
  }

  let current: string = process.env.npm_package_json || '.';

  while (max-- && !(await exists(current))) {
    current = join(dirname(dirname(current)), 'package.json');
  }

  if (max <= 0) {
    logger.warn(`project root not found, using '${process.cwd()}' - consider increasing env var FST_PACKAGE_HEIGHT (was '${max}')`);

    return process.cwd();
  }

  return dirname(current);
};

export const fetchSource = async (pathlike: string, options?: SourceOptions): Promise<string> => {
  options = options || {};

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

  const cache = await getChacheInfo(url, options?.packageRoot);
  if (await exists(cache?.path)) {
    logger.log(`cache hit on ${cache?.path}`);

    return cache?.path;
  }

  if (isRepo(url.pathname)) {
    return fetchRepo(cache, options);
  }

  return fetchFileFromUrl(url, cache, options);
};

export const getChacheInfo = async (url: URL, packageRoot: string): Promise<CacheInfo> => {
  const projectDir = packageRoot || (await getProjectRoot());

  if (!isRepo(url.pathname)) {
    const filename = `.fst/remote/${url.hostname}${url.pathname}${url.search?.replace?.('?', '-')}`;

    return { path: join(projectDir, filename) };
  }

  let branch = url?.hash?.slice?.(1);
  const repoName = `.fst/remote/${url.pathname.slice(1) || url.hostname}`;
  const repo = join(projectDir, repoName);
  const origin = url.href.replace(url.hash, '').replace(url.search, '');

  return { path: repo, origin, repoName, branch };
};

export const fetchFileFromUrl = async (url: URL, cacheInfo: CacheInfo, options?: SourceOptions): Promise<string> => {
  const output = resolve(cacheInfo.path);

  if (options?.cache && (await exists(output))) {
    logger.info(`will copy ${logger.grn(output)} (cached)`);

    return output;
  }

  const file = await new Promise<string>((resolve, reject) => {
    const req = (url.protocol == 'http:' ? http : https).request(url, (res) => {
      let data = '';
      res.on('data', (d) => (data += d.toString()));
      res.on('end', () => {
        if (res.statusCode < 300) {
          return resolve(data);
        }

        const { statusCode, headers } = res;
        reject({ message: `Failed to fetch from URL`, url: url.href, response: { statusCode, headers, body: data } });
      });
      res.on('error', (error) => reject({ message: `Failed to fetch from URL`, url: url.href, error }));
    });

    req.on('error', (error) => reject({ message: `Failed to fetch from URL`, url: url.href, error }));
    req.end();
  });

  await promises.mkdir(dirname(output), { recursive: true });
  await promises.writeFile(output, file);

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
      await exec(`git remote add -f origin ${origin}`, { cwd });
    }

    if (options?.subdirs?.length) {
      await exec('git config core.sparseCheckout true', { cwd });
      await promises.writeFile(join(cwd, '.git/info/sparse-checkout'), options.subdirs.join('\n'), { encoding: 'utf8' });
    }

    if (!branch) {
      let res = await exec('git symbolic-ref refs/remotes/origin/HEAD', { cwd }).catch(() => ({ stdout: '' }));
      if (!res?.stdout) {
        await exec('git remote set-head origin --auto', { cwd });
        res = await exec('git symbolic-ref refs/remotes/origin/HEAD', { cwd });
      }

      branch = basename(res?.stdout?.replace?.(/\n/g, ''));
    }

    await exec(`git fetch origin ${branch}`, { cwd });
    await exec(`git reset --hard origin/${branch}`, { cwd });

    return repo;
  } catch (e) {
    await promises.rm(repo, { recursive: true, force: true } as any).catch(() => null);
    throw e;
  }
};
