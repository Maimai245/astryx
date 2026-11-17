// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor and the skill places: the `skill-places` check (current,
 * missing or stale, kept, doubled, a project skill named `astryx`), its
 * absence in a project that keeps only the AGENTS.md block, and the
 * agent-docs check of a project that keeps its guidance as a skill.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {checkSkillPlaces, runChecks} from './doctor.mjs';
import {init} from '../init/init.mjs';

/** @type {string[]} */
const dirs = [];
/** @param {string} label */
const tmp = label => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `astryx-doctor-skills-${label}-`));
  dirs.push(dir);
  return dir;
};

let project = '';
beforeEach(() => {
  const home = tmp('home');
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
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

/** @param {string} id */
async function check(id) {
  const report = await runChecks({cwd: project});
  return report.checks.find(each => each.id === id) ?? null;
}

const SHARED = '.agents/skills/astryx-project/SKILL.md';

describe('the skill-places check', () => {
  it('is left out of a project that keeps only the AGENTS.md block', async () => {
    await init({}, {cwd: project});
    expect(await check('skill-places')).toBeNull();
  });

  it('passes when every saved file holds this release, and agent-docs points at it', async () => {
    await init({to: 'skills'}, {cwd: project});
    expect(await check('skill-places')).toMatchObject({status: 'pass'});
    expect((await check('agent-docs'))?.message).toContain('skills.to: skills');
  });

  it('warns about a missing copy and names the command that writes it', async () => {
    await init({to: 'skills'}, {cwd: project});
    fs.rmSync(path.join(project, SHARED));
    const result = await check('skill-places');
    expect(result).toMatchObject({status: 'warn'});
    expect(result?.message).toContain(SHARED);
    expect(result?.fix).toContain('init');
  });

  it('warns when the block and the skill are both there', async () => {
    await init({}, {cwd: project});
    await init({to: './team'}, {cwd: project});
    await init({to: 'agents-md'}, {cwd: project});
    fs.mkdirSync(path.dirname(path.join(project, SHARED)), {recursive: true});
    fs.copyFileSync(path.join(project, 'AGENTS.md'), path.join(project, SHARED));
    const result = await check('skill-places');
    expect(result).toMatchObject({status: 'warn'});
    expect(result?.message).toContain('twice');
  });

  it('warns about a project skill named astryx', async () => {
    await init({to: 'skills'}, {cwd: project});
    const plain = path.join(project, '.claude', 'skills', 'astryx');
    fs.mkdirSync(plain, {recursive: true});
    fs.writeFileSync(path.join(plain, 'SKILL.md'), '---\nname: astryx\ndescription: "x"\n---\n');
    const result = await check('skill-places');
    expect(result).toMatchObject({status: 'warn'});
    expect(result?.message).toContain('.claude/skills/astryx');
  });

  it('reports a kept file without failing', () => {
    const result = checkSkillPlaces(
      /** @type {any} */ ({
        cwd: project,
        skillPlaces: {
          places: ['skills'],
          files: [
            {path: SHARED, place: 'skills', state: 'edited'},
            {path: '.claude/skills/astryx-project/SKILL.md', place: 'skills', state: 'current'},
          ],
          renderError: null,
          blockFiles: [],
          skillFiles: [SHARED],
          plainNamed: [],
          computerSkill: true,
        },
      }),
    );
    expect(result).toMatchObject({status: 'pass'});
    expect(result?.message).toContain('Kept as they are');
    expect(result?.message).toContain('Codex lists both');
  });
});
