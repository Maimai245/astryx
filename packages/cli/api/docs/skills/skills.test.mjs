// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration skills (spec:AST-046 FR15): a doc that declares
 * `skill: {name, description}` is listed and read by `astryx docs skills`,
 * written beside the project skill by `init --to skills` with one pointer
 * line in the block, refreshed by `upgrade --apply`, checked by `doctor`,
 * and listed by `discover`; a skill that breaks a rule is left out with a
 * note while its doc still loads, and a project with no declared skill keeps
 * its block unchanged.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {docs} from '../docs.mjs';
import {init} from '../../init/init.mjs';
import {upgrade} from '../../upgrade/upgrade.mjs';
import {runChecks} from '../../doctor/doctor.mjs';
import {discoverIntegrationSkills} from '../../../foundation/discovery/integration-skills.mjs';
import {skillProblem} from '../../../authoring/doctypes/reference/skill.mjs';
import {logger} from '../../logger.mjs';
import {validateLoadedIntegrationListed} from '../../../foundation/integrations/validate-contributions.mjs';

/** @type {string[]} */
const dirs = [];
/** @param {string} label */
const tmp = label => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `astryx-int-skills-${label}-`));
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
});
afterEach(() => {
  vi.unstubAllEnvs();
  while (dirs.length) fs.rmSync(/** @type {string} */ (dirs.pop()), {recursive: true, force: true});
});

/**
 * A project that installs `@acme/widgets`, whose docs hold `docs`.
 * @param {Record<string, string>} docFiles file name → module source
 */
function withIntegration(docFiles) {
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '*', '@acme/widgets': '1.0.0'}}),
  );
  fs.writeFileSync(path.join(project, 'astryx.config.mjs'), "export default {integrations: ['@acme/widgets']};\n");
  const pkg = path.join(project, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(path.join(pkg, 'docs'), {recursive: true});
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({name: '@acme/widgets', version: '1.0.0'}));
  fs.writeFileSync(path.join(pkg, 'astryx.integration.mjs'), "export default {docs: './docs'};\n");
  for (const [name, source] of Object.entries(docFiles)) {
    fs.writeFileSync(path.join(pkg, 'docs', name), source);
  }
  return pkg;
}

/** @param {{name?: string, description?: string, topic?: string, prose?: string}} [o] */
const skillDoc = ({name = 'acme-entities', description = 'Use when you show Acme entities in a page.', topic = 'acme-entities-guide', prose = 'Render each entity with AcmeEntity.'} = {}) => `export default {
  type: 'generic',
  name: ${JSON.stringify(topic)},
  title: 'Acme entities',
  description: 'How to show Acme entities.',
  category: 'guide',
  skill: {name: ${JSON.stringify(name)}, description: ${JSON.stringify(description)}},
  sections: [{id: 'use', title: 'Use it', content: [{type: 'prose', text: ${JSON.stringify(prose)}}]}],
};
`;

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(project, rel), 'utf8');
/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(project, rel));

describe('the skill rules', () => {
  it.each([
    [{name: 'acme-entities', description: 'x'}, null],
    [{name: 'Acme', description: 'x'}, 'lowercase'],
    [{name: 'a--b', description: 'x'}, 'lowercase'],
    [{name: 'astryx', description: 'x'}, 'Astryx skill'],
    [{name: 'astryx-project', description: 'x'}, 'Astryx skill'],
    [{name: `a${'b'.repeat(64)}`, description: 'x'}, '64'],
    [{name: 'ok', description: ' '}, 'needs a description'],
    [{name: 'ok', description: 'two\nlines'}, 'one line'],
    [{name: 'ok', description: 'x'.repeat(1025)}, '1024'],
  ])('%o', (value, expected) => {
    const problem = skillProblem(value);
    if (expected == null) expect(problem).toBeNull();
    else expect(problem).toContain(expected);
  });
});

describe('docs skills', () => {
  it('lists the project, computer, and integration skills, and reads each', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    const list = await docs('skills', undefined, {cwd: project});
    expect(list.type).toBe('docs.skills');
    expect(list.data.map(each => [each.name, each.package])).toEqual([
      ['astryx-project', '@astryxdesign/cli'],
      ['astryx', '@astryxdesign/cli'],
      ['acme-entities', '@acme/widgets'],
    ]);
    const one = await docs('skills/acme-entities', undefined, {cwd: project});
    expect(one.type).toBe('docs.skill');
    if (one.type !== 'docs.skill') return;
    expect(one.package).toBe('@acme/widgets');
    expect(one.data.text).toContain('# Acme entities');
    expect(one.data.text).toContain('Render each entity with AcmeEntity.');
    const block = await docs('skills/astryx-project', undefined, {cwd: project});
    if (block.type !== 'docs.skill') throw new Error(block.type);
    expect(block.data.text).toMatch(/^<!-- ASTRYX:START -->/u);
  });

  it('names the skills when the name is unknown', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    await expect(docs('skills/nope', undefined, {cwd: project})).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_TOPIC',
    });
  });
});

describe('init --to skills with an integration skill', () => {
  it('writes the skill beside the project skill, and the block points to it', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    const res = await init({to: 'skills'}, {cwd: project});
    if (res.type !== 'init.run') throw new Error(res.type);
    expect(res.data.skills.filter(row => row.skill === 'acme-entities').map(row => [row.path, row.action])).toEqual([
      ['.agents/skills/acme-entities/SKILL.md', 'created'],
      ['.claude/skills/acme-entities/SKILL.md', 'created'],
    ]);
    const skill = read('.agents/skills/acme-entities/SKILL.md');
    expect(skill).toBe(read('.claude/skills/acme-entities/SKILL.md'));
    expect(skill).toMatch(/^---\nname: acme-entities\ndescription: "Use when you show Acme entities in a page."\n---\n\n<!-- ASTRYX:START -->\n<!-- astryx-managed sha256:/u);
    expect(skill).toContain('Render each entity with AcmeEntity.');
    expect(read('.agents/skills/astryx-project/SKILL.md')).toContain(
      '- `@acme/widgets` skill `acme-entities`: Use when you show Acme entities in a page. Read it with `astryx docs skills/acme-entities`.',
    );
  });

  it('removes a skill Astryx wrote when its integration no longer declares it', async () => {
    const pkg = withIntegration({'entities.doc.mjs': skillDoc()});
    await init({to: 'skills'}, {cwd: project});
    // A new file: a module this process already imported is not read again.
    fs.rmSync(path.join(pkg, 'docs', 'entities.doc.mjs'));
    fs.writeFileSync(path.join(pkg, 'docs', 'renamed.doc.mjs'), skillDoc({name: 'acme-renamed', topic: 'acme-renamed-guide'}));
    const res = await init({}, {cwd: project});
    if (res.type !== 'init.run') throw new Error(res.type);
    expect(exists('.agents/skills/acme-entities')).toBe(false);
    expect(exists('.agents/skills/acme-renamed/SKILL.md')).toBe(true);
    expect(res.data.skills.some(row => row.skill === 'acme-entities' && row.action === 'removed')).toBe(true);
  });

  it('keeps a person\'s own skill of the same name, in both folders', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    fs.mkdirSync(path.join(project, '.claude', 'skills', 'acme-entities'), {recursive: true});
    fs.writeFileSync(path.join(project, '.claude', 'skills', 'acme-entities', 'SKILL.md'), '# mine\n');
    const res = await init({to: 'skills'}, {cwd: project});
    if (res.type !== 'init.run') throw new Error(res.type);
    expect(res.data.skills.filter(row => row.skill === 'acme-entities').map(row => row.reason)).toEqual([
      'pair-kept',
      'not-astryx',
    ]);
    expect(exists('.agents/skills/acme-entities')).toBe(false);
  });

  it('--remove takes the integration skills with it', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    await init({to: 'skills'}, {cwd: project});
    await init({remove: true}, {cwd: project});
    expect(exists('.agents')).toBe(false);
    expect(exists('.claude')).toBe(false);
  });
});

describe('a skill that breaks a rule', () => {
  it('is left out with a note, and its doc still loads', async () => {
    const pkg = withIntegration({
      'entities.doc.mjs': skillDoc({name: 'Bad Name'}),
      'other.doc.mjs': skillDoc({topic: 'acme-other', name: 'acme-other'}),
    });
    const loaded = {name: '@acme/widgets', docs: path.join(pkg, 'docs')};
    const {skills, problems} = await discoverIntegrationSkills([loaded]);
    expect(skills.map(each => each.name)).toEqual(['acme-other']);
    expect(problems[0]?.message).toContain('entities.doc.mjs: skill name "Bad Name"');
    const topic = await docs('acme-entities-guide', undefined, {cwd: project});
    expect(topic.type).toBe('docs.detail');
    const checked = await validateLoadedIntegrationListed(
      /** @type {any} */ ({...loaded, __packageDir: pkg, __manifestFile: path.join(pkg, 'astryx.integration.mjs')}),
    );
    expect(checked.notes.find(note => note.code === 'invalid_skill')).toMatchObject({next: true});
  });

  it('a name an earlier package holds is left out', async () => {
    const first = {name: '@acme/a', docs: tmp('a')};
    const second = {name: '@acme/b', docs: tmp('b')};
    fs.writeFileSync(path.join(first.docs, 'x.doc.mjs'), skillDoc());
    fs.writeFileSync(path.join(second.docs, 'x.doc.mjs'), skillDoc());
    const {skills, problems} = await discoverIntegrationSkills([first, second]);
    expect(skills.map(each => each.package)).toEqual(['@acme/a']);
    expect(problems[0]).toMatchObject({package: '@acme/b'});
    expect(problems[0]?.message).toContain('a skill of @acme/a');
  });
});

describe('upgrade, doctor, and a project with no declared skill', () => {
  it('upgrade --apply writes a missing integration skill', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    await init({to: 'skills'}, {cwd: project});
    fs.rmSync(path.join(project, '.agents', 'skills', 'acme-entities'), {recursive: true});
    const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name: '@astryxdesign/core', version: '0.0.15'}));
    const dry = await upgrade({from: '0.0.15'}, {cwd: project});
    expect(dry.data.agentDocs.skills.find(row => row.skill === 'acme-entities' && row.action === 'would-create')).toBeTruthy();
    const doctor = await runChecks({cwd: project});
    const check = doctor.checks.find(each => each.id === 'skill-places');
    expect(check?.status).toBe('warn');
    expect(check?.message).toContain('.agents/skills/acme-entities/SKILL.md');
    await upgrade({from: '0.0.15', apply: true}, {cwd: project});
    expect(exists('.agents/skills/acme-entities/SKILL.md')).toBe(true);
  });

  it('a project whose integrations declare no skill gets the block it got before', async () => {
    withIntegration({
      'plain.doc.mjs': `export default {type: 'generic', name: 'acme-plain', title: 'Plain', description: 'No skill.', sections: [{title: 'A', content: [{type: 'prose', text: 'a'}]}]};\n`,
    });
    await init({}, {cwd: project});
    expect(read('AGENTS.md')).not.toContain('INTEGRATIONS:');
  });

  it('doctor names a stale skill and a left-out one together, and init is the fix', async () => {
    const pkg = withIntegration({
      'entities.doc.mjs': skillDoc(),
      'bad.doc.mjs': skillDoc({topic: 'acme-bad', name: 'Bad Name'}),
    });
    await init({to: 'skills'}, {cwd: project});
    // A new doc file: a module this process imported is not read again.
    fs.rmSync(path.join(pkg, 'docs', 'entities.doc.mjs'));
    fs.writeFileSync(path.join(pkg, 'docs', 'entities2.doc.mjs'), skillDoc({topic: 'acme-entities-v2', prose: 'Use AcmeEntityCard now.'}));
    const doctor = await runChecks({cwd: project});
    const check = doctor.checks.find(each => each.id === 'skill-places');
    expect(check?.status).toBe('warn');
    expect(check?.message).toContain('from another release in .agents/skills/acme-entities/SKILL.md');
    expect(check?.message).toContain('Skills left out: @acme/widgets: bad.doc.mjs');
    expect(check?.fix).toContain('init');
    expect(check?.fix).toContain('after an integration changes');
  });

  it('a block-only project hears about a left-out skill from init and doctor', async () => {
    withIntegration({'bad.doc.mjs': skillDoc({topic: 'acme-bad', name: 'Bad Name'})});
    const warn = vi.spyOn(logger, 'warn');
    await init({}, {cwd: project});
    expect(warn.mock.calls.flat().join('\n')).toContain('skill name "Bad Name"');
    const doctor = await runChecks({cwd: project});
    const check = doctor.checks.find(each => each.id === 'skill-places');
    expect(check).toMatchObject({status: 'warn'});
    expect(check?.message).toContain('Skills left out');
  });
});
