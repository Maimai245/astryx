// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor's agent-docs check in a project that keeps its Astryx
 * guidance as a skill (`init --to skills`): the saved skill files count as
 * the project's agent docs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {init} from './init.mjs';
import {runChecks} from '../doctor/doctor.mjs';

let home = '';
let project = '';
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-to-doctor-home-'));
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('XDG_CONFIG_HOME', path.join(home, '.config'));
  vi.stubEnv('XDG_CACHE_HOME', path.join(home, '.cache'));
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-to-doctor-app-'));
  fs.mkdirSync(path.join(project, '.git'));
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '*'}}),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(home, {recursive: true, force: true});
  fs.rmSync(project, {recursive: true, force: true});
});

it('passes agent-docs on the saved skill files', async () => {
  await init({to: 'skills'}, {cwd: project});
  const report = await runChecks({cwd: project});
  const check = report.checks.find(each => each.id === 'agent-docs');
  expect(check).toMatchObject({status: 'pass'});
  expect(check?.message).toContain('.agents/skills/astryx-project/SKILL.md');
});

it('still reports no agent docs when the saved skill files are gone', async () => {
  await init({to: 'skills'}, {cwd: project});
  fs.rmSync(path.join(project, '.agents'), {recursive: true});
  fs.rmSync(path.join(project, '.claude'), {recursive: true});
  const report = await runChecks({cwd: project});
  expect(report.checks.find(each => each.id === 'agent-docs')).toMatchObject({status: 'info'});
});
