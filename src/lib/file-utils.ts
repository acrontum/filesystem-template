import { exec as execCb } from 'child_process';
import { fdir } from 'fdir';
import { existsSync, promises } from 'fs';
import * as http from 'http';
import * as https from 'https';
import { basename, dirname, join } from 'path';
import { URL } from 'url';
import { promisify } from 'util';
import { FNode } from './fnode';
import { LoggingService } from './log.service';
import { isRecipeFile } from './recipe';

export interface SourceOptions {
  root?: string;
  subdirs?: string[];
  cache?: boolean;
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
const sourceCache: Record<string, Promise<string>> = {};
let packagePath: string;

/**
 * { function_description }
 *
 * @param  {string}          dir                The dir
 * @param  {}                opts?:TreeOptions  The options tree options
 *
 * @return {Promise<FNode>}  { description_of_the_return_value }
 */
export const tree = async (dir: string, opts?: TreeOptions): Promise<FNode> => {
  const fsTree: Record<string, FNode> = {};
  let root: FNode;

  const getFNode = (type: string, filePath: string) => {
    const name = filePath.replace(dir, '') || '/';
    const node = new FNode(type, name);
    if (root) {
      node.root = root;
    } else {
      root = node;
    }
    node.realPath = filePath;

    const parent = fsTree[name?.replace(/\/[^\/]+$/, '') || '/'];
    node.setParent(parent);

    fsTree[name] = node;

    return node;
  };

  const groups = await walk(dir, opts?.exclude);

  groups.forEach(({ dir, files }) => {
    getFNode('dir', dir);

    files.forEach((file) => {
      getFNode('file', file);
    });
  });

  return root;
};

/**
 * { function_description }
 *
 * @param  {string}            dir                The dir
 * @param  {}                  exclude?:string[]  The exclude string
 *
 * @return {Promise<Group[]>}  { description_of_the_return_value }
 */
export const walk = async (dir: string, exclude?: string[]): Promise<Group[]> => {
  const ignored = ['.git', 'node_modules', ...(exclude || [])];

  const files = (await new fdir()
    .crawlWithOptions(dir, {
      includeBasePath: true,
      group: true,
      exclude: (dirname: string) => ignored.includes(dirname),
    })
    .withPromise()) as Group[];

  return files.sort((a, b) => a.dir.localeCompare(b.dir));
};

/**
 * Finds a package json.
 *
 * Usually, npm_package_json contains the path, unless running with npx
 *
 * @return {string}  path to package.json
 */
export const getProjectRoot = (): string => {
  if (packagePath) {
    return packagePath;
  }

  let max = parseInt(process.env.FST_PACKAGE_HEIGHT, 10);
  if (typeof max !== 'number' || Number.isNaN(max)) {
    max = 10;
  }

  let current: string = process.env.npm_package_json || '.';

  while (max-- && !existsSync(current)) {
    current = join(dirname(dirname(current)), 'package.json');
  }

  if (max <= 0) {
    packagePath = process.cwd();
    logger.warn(`project root not found, using ${packagePath} - consider increasing env var FST_PACKAGE_HEIGHT (was ${max})`);
  } else {
    packagePath = dirname(current);
  }

  return packagePath;
};

/**
 * Fetches a source.
 *
 * @param  {string}           pathlike                The pathlike
 * @param  {}                 options?:SourceOptions  The options source options
 *
 * @return {Promise<string>}  The source.
 */
export const fetchSource = async (pathlike: string, options?: SourceOptions): Promise<string> => {
  options = options || {};

  if (existsSync(pathlike)) {
    logger.info(`will copy ${logger.grn(pathlike)}`);

    return pathlike;
  }

  let url: URL;
  try {
    url = new URL(pathlike);
  } catch (e) {
    // not a url
    throw new Error(`No such file: ${pathlike}`);
  }

  const cache = getCacheDir(url);
  if (!sourceCache[cache?.path]) {
    sourceCache[cache?.path] = isRecipeFile(url.pathname) ? fetchRecipe(url, cache, options) : fetchRepo(url, cache, options);
  } else {
    logger.log(`cache hit on ${cache?.path}`);
  }

  return sourceCache[cache?.path];
};

/**
 * Gets the cache dir.
 *
 * @param  {URL}        url  The url
 *
 * @return {CacheInfo}  The cache dir.
 */
export const getCacheDir = (url: URL): CacheInfo => {
  const projectDir = getProjectRoot();

  if (isRecipeFile(url.pathname)) {
    const filename = `.fst/remote/${url.hostname}${url.pathname}${url.search?.replace?.('?', '-')}`;

    return { path: join(projectDir, filename) };
  }

  let branch = url?.hash?.slice?.(1);
  const repoName = `.fst/remote/${url.pathname.slice(1) || url.hostname}`;
  const repo = join(projectDir, repoName);
  const origin = url.href.replace(url.hash, '').replace(url.search, '');

  return { path: repo, origin, repoName, branch };
};

/**
 * Fetches a recipe.
 *
 * @param  {URL}              url                     The url
 * @param  {CacheInfo}        cacheInfo               The cache information
 * @param  {}                 options?:SourceOptions  The options source options
 *
 * @return {Promise<string>}  The recipe.
 */
export const fetchRecipe = async (url: URL, cacheInfo: CacheInfo, options?: SourceOptions): Promise<string> => {
  const output = cacheInfo.path;

  if (options?.cache && existsSync(output)) {
    logger.info(`will copy ${logger.grn(output)} (cached)`);

    return output;
  }

  const file = await new Promise<string>((resolve, reject) => {
    (url.protocol == 'http:' ? http : https)
      .request(url, (res) => {
        let data = '';
        res.on('data', (d) => (data += d.toString()));
        res.on('end', () => resolve(data));
        res.on('error', reject);
      })
      .end();
  });

  await promises.writeFile(output, file);

  return output;
};

/**
 * Fetches a repo.
 *
 * @param  {URL}              url                     The url
 * @param  {CacheInfo}        cacheInfo               The cache information
 * @param  {}                 options?:SourceOptions  The options source options
 *
 * @return {Promise<string>}  The repo.
 */
export const fetchRepo = async (url: URL, cacheInfo: CacheInfo, options?: SourceOptions): Promise<string> => {
  let branch = cacheInfo.branch;
  const { path: repo, origin, repoName } = cacheInfo;

  if (options?.cache && existsSync(repo)) {
    logger.info(`will copy repo ${logger.grn(repoName)} (cached)`);

    return repo;
  }

  logger.debug({ url, branch, repo, origin });
  logger.info(`will clone ${branch ? `${logger.blu(branch)} of ` : ''}${logger.ylw(origin)} into ${logger.grn(repoName)}`);

  const cwd = repo;
  try {
    await promises.mkdir(repo, { recursive: true });

    if (!existsSync(join(cwd, '.git'))) {
      await exec('git init', { cwd });
      await exec(`git remote add -f origin ${origin}`, { cwd });
    }

    if (options?.subdirs?.length) {
      await exec('git config core.sparseCheckout true', { cwd });
      await promises.writeFile(join(cwd, '.git/info/sparse-checkout'), options?.subdirs.join('\n'), { encoding: 'utf8' });
    }

    if (!branch) {
      let res = await exec('git symbolic-ref refs/remotes/origin/HEAD', { cwd }).catch(() => ({ stdout: '' }));
      if (!res?.stdout) {
        await exec('git remote set-head origin --auto', { cwd });
        res = await exec('git symbolic-ref refs/remotes/origin/HEAD', { cwd });
      }

      branch = basename(res?.stdout?.replace?.(/\n/g, ''));
    }

    await exec(`git pull origin ${branch}`, { cwd });

    return repo;
  } catch (e) {
    await promises.rmdir(repo, { recursive: true, force: true } as any).catch(() => null);
    throw e;
  }
};
