// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx upgrade` and the saved skill places (astryx.config
 * `skills.to`): a dry run names each file it would write, `--apply` writes
 * this release's project skill to every saved place with the two copies of
 * the `skills` place byte for byte the same, an edited file is kept, and a
 * project that saves no `agents-md` place is not told to add the block.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {upgrade} from './upgrade.mjs';
import {logger} from '../logger.mjs';
import {
  generateCompressedIndex,
  renderAgentDocsBlock,
} from '../../foundation/agent-docs/agent-docs.mjs';
import {renderProjectSkill} from '../../foundation/agent-docs/skill-places.mjs';

const SHARED = '.agents/skills/astryx-project/SKILL.md';
const CLAUDE = '.claude/skills/astryx-project/SKILL.md';

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-upgrade-skills-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '0.0.15'}}));
  const core = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(core, {recursive: true});
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name: '@astryxdesign/core', version: '0.0.15'}));
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
  logger.setSilent(true);
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');
/** @param {string} rel @param {string} text */
function write(rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
  fs.writeFileSync(path.join(dir, rel), text);
}
/** @param {string | string[]} to */
function save(to) {
  fs.writeFileSync(path.join(dir, 'astryx.config.mjs'), `export default {skills: {to: ${JSON.stringify(to)}}};\n`);
}
/** An unedited project skill an older release wrote. */
const olderSkill = () => renderProjectSkill(generateCompressedIndex('0.0.1'));

describe('upgrade and the skills place', () => {
  it('a dry run names each stale file and writes nothing', async () => {
    save('skills');
    write(SHARED, olderSkill());
    write(CLAUDE, olderSkill());
    const res = await upgrade({from: '0.0.15'}, {cwd: dir});
    expect(res.data.agentDocs.skills).toEqual([
      {path: SHARED, place: 'skills', action: 'would-update'},
      {path: CLAUDE, place: 'skills', action: 'would-update'},
    ]);
    expect(res.data.agentDocs.action).toBe('would-refresh');
    expect(read(SHARED)).toBe(olderSkill());
  });

  it('--apply writes this release to both copies, byte for byte the same, and never nudges for the block', async () => {
    save('skills');
    write(SHARED, olderSkill());
    const res = await upgrade({from: '0.0.15', apply: true}, {cwd: dir});
    expect(res.data.agentDocs.skills).toEqual([
      {path: SHARED, place: 'skills', action: 'updated'},
      {path: CLAUDE, place: 'skills', action: 'created'},
    ]);
    expect(res.data.agentDocs.action).toBe('refreshed');
    expect(res.data.agentDocs.refreshed).toBe(true);
    const expected = renderProjectSkill(await renderAgentDocsBlock(dir, {installedVersion: '0.0.15'}));
    expect(read(SHARED)).toBe(expected);
    expect(read(CLAUDE)).toBe(expected);
    expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(false);
  });

  it('is current when every file holds this release', async () => {
    save('skills');
    await upgrade({from: '0.0.15', apply: true}, {cwd: dir});
    const res = await upgrade({from: '0.0.15'}, {cwd: dir});
    expect(res.data.agentDocs).toMatchObject({status: 'current', action: 'none'});
    expect(res.data.agentDocs.skills.map(row => row.action)).toEqual(['current', 'current']);
  });

  it('keeps an edited file', async () => {
    save('skills');
    write(SHARED, `${olderSkill()}my note\n`);
    const res = await upgrade({from: '0.0.15', apply: true}, {cwd: dir});
    expect(res.data.agentDocs.skills[0]).toEqual({path: SHARED, place: 'skills', action: 'kept', reason: 'edited'});
    expect(read(SHARED)).toMatch(/my note\n$/u);
  });

  it('refreshes the block and a folder place together', async () => {
    save(['agents-md', './team']);
    write('AGENTS.md', `# Doc\n\n${generateCompressedIndex('0.0.1')}\n`);
    const res = await upgrade({from: '0.0.15', apply: true}, {cwd: dir});
    expect(res.data.agentDocs.files).toContain('AGENTS.md');
    expect(res.data.agentDocs.skills).toEqual([
      {path: 'team/astryx-project/SKILL.md', place: './team', action: 'created'},
    ]);
    expect(read('AGENTS.md')).toMatch(/Astryx v0\.0\.15 ·/u);
  });

  it('a project that saves nothing reports no skill rows', async () => {
    write('AGENTS.md', `# Doc\n\n${generateCompressedIndex('0.0.15')}\n`);
    const res = await upgrade({from: '0.0.15'}, {cwd: dir});
    expect(res.data.agentDocs.skills).toEqual([]);
  });
});
