// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `init --once` (a copy saved nowhere) and `init --remove` (every saved
 * place, or the places `--to` names, removed and dropped from what is saved;
 * `--remove-agents` is the same option). Every test uses a temporary home
 * folder.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {init} from './init.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {settingsFile} from '../../foundation/env/user-settings.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

const SHARED = '.agents/skills/astryx-project/SKILL.md';
const CLAUDE = '.claude/skills/astryx-project/SKILL.md';

/** @type {string[]} */
const dirs = [];
/** @param {string} label */
const tmp = label => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `astryx-init-once-${label}-`));
  dirs.push(dir);
  return dir;
};

let home = '';
let project = '';
beforeEach(() => {
  home = tmp('home');
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('PATH', tmp('path'));
  vi.stubEnv('XDG_CONFIG_HOME', path.join(home, '.config'));
  vi.stubEnv('XDG_CACHE_HOME', path.join(home, '.cache'));
  project = tmp('app');
  fs.mkdirSync(path.join(project, '.git'));
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '*'}}),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  while (dirs.length) fs.rmSync(/** @type {string} */ (dirs.pop()), {recursive: true, force: true});
});

/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(project, rel));
const settings = () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
};

/** @param {() => Promise<unknown>} fn */
async function refusal(fn) {
  const err = await fn().then(() => null, e => e);
  expect(err).toBeInstanceOf(AstryxError);
  return /** @type {AstryxError} */ (err);
}

describe('init --once', () => {
  it('writes the copy and saves nothing, in the project or the settings file', async () => {
    const outside = path.join(tmp('bundle'), 'out');
    const res = await init({to: `./bundle,${outside}`, once: true}, {cwd: project});
    if (res.type !== 'init.run') throw new Error(res.type);
    expect(res.data.once).toBe(true);
    expect(exists('bundle/astryx-project/SKILL.md')).toBe(true);
    expect(fs.existsSync(path.join(outside, 'astryx', 'SKILL.md'))).toBe(true);
    expect(exists('astryx.config.mjs')).toBe(false);
    expect(settings().skills).toBeUndefined();
  });

  it('moves the project off nothing', async () => {
    await init({}, {cwd: project});
    await init({to: 'skills', once: true}, {cwd: project});
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists(SHARED)).toBe(true);
  });

  it.each([
    [{once: true}, 'needs `--to`'],
    [{to: 'user', once: true}, '--to user'],
    [{user: true, once: true}, '--user'],
    [{to: 'skills', once: true, remove: true}, '--once'],
  ])('refuses %o', async (options, named) => {
    const err = await refusal(() => init(options, {cwd: project}));
    expect(err.code).toBe(ERROR_CODES.ERR_INVALID_ARGUMENT);
    expect(err.message).toContain(named);
  });
});

describe('init --remove', () => {
  it('removes every saved place and drops what was saved', async () => {
    await init({to: 'skills,./team'}, {cwd: project});
    const res = await init({remove: true}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.from).toEqual(['skills', './team']);
    expect(res.data.removed).toBe(true);
    expect(res.data.skills.map(row => [row.path, row.action])).toEqual([
      [SHARED, 'removed'],
      [CLAUDE, 'removed'],
      ['team/astryx-project/SKILL.md', 'removed'],
    ]);
    expect(exists('.agents')).toBe(false);
    expect(exists('team')).toBe(true);
    expect(exists('astryx.config.mjs')).toBe(false);
  });

  it('--remove-agents is the same option', async () => {
    await init({to: 'skills'}, {cwd: project});
    const res = await init({removeAgents: true}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.skills.map(row => row.action)).toEqual(['removed', 'removed']);
  });

  it('with --to, removes only the places named and keeps the rest saved', async () => {
    await init({to: 'agents-md,skills'}, {cwd: project});
    const res = await init({remove: true, to: 'skills'}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.from).toEqual(['skills']);
    expect(exists(SHARED)).toBe(false);
    expect(exists('AGENTS.md')).toBe(true);
    // agents-md alone is the default, so nothing is left to save.
    expect(exists('astryx.config.mjs')).toBe(false);
  });

  it('removes a folder outside the project and drops it from the settings file', async () => {
    await init({to: '~/team-skills'}, {cwd: project});
    expect(settings().skills.to).toEqual(['~/team-skills']);
    await init({remove: true, to: '~/team-skills'}, {cwd: project});
    expect(fs.existsSync(path.join(home, 'team-skills'))).toBe(false);
    expect(settings().skills.to).toEqual([]);
  });

  it('--remove --to user is --user --remove-agents', async () => {
    await init({to: 'user'}, {cwd: project});
    const res = await init({remove: true, to: 'user'}, {cwd: project});
    expect(res.type).toBe('init.user');
    expect(fs.existsSync(path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md'))).toBe(false);
    expect(settings().computerAgentText.install).toBe(false);
  });

  it('keeps an edited skill file and says so', async () => {
    await init({to: 'skills'}, {cwd: project});
    fs.appendFileSync(path.join(project, SHARED), 'mine\n');
    const res = await init({remove: true}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.skills[0]).toEqual({path: SHARED, place: 'skills', action: 'kept', reason: 'edited'});
  });

  it('prints what it printed before in a project that saves nothing', async () => {
    await init({}, {cwd: project});
    const r = await runCli(['init', '--remove'], project);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[ok] AI agent docs removed.');
    expect(r.stdout).not.toContain('Astryx skill');
  });

  it('without --to, keeps folders outside the project and says how to remove them', async () => {
    await init({to: 'skills,~/hs'}, {cwd: project});
    const r = await runCli(['init', '--remove'], project);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('Kept the Astryx skill in ~/hs');
    expect(r.stderr).toContain('astryx init --remove --to ~/hs');
    expect(fs.existsSync(path.join(home, 'hs', 'astryx', 'SKILL.md'))).toBe(true);
  });
});
