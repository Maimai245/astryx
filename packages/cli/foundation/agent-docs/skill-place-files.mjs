// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The skill places on disk: the project places a config saves, and the
 * skill files each place holds, checked to stay inside the project, read,
 * written, and removed under the managed file rules
 * (`managed-skill-file.mjs`). `init`, `upgrade`, and `doctor` share it.
 *
 * @input  a project root, a place, the text this release renders for it
 * @output the saved places, each file's state, and the write and remove rows
 * @position foundation/agent-docs — read by the init, upgrade, and doctor
 *   adapters
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findConfigPath} from '../config/config-path.mjs';
import {PathSafetyError, assertWithin} from '../fs/path-safety.mjs';
import {loadModuleWithParser} from '../fs/module-loader.mjs';
import {parseConfig} from '../../authoring/config/parse.mjs';
import {
  COMPUTER_SKILL_NAME,
  PROJECT_SKILL_NAME,
  placeFolders,
  placeSkillFiles,
  savedProjectPlaces,
} from './skill-places.mjs';
import {
  keptReason,
  managedFileState,
  removeManagedFileIfOwned,
  writeManagedFile,
} from './managed-skill-file.mjs';

/**
 * The project places saved in the project's config. Only the config is
 * loaded, not its integrations. A config that cannot be loaded saves none,
 * so init writes the default as before, and the agent docs report the load
 * error.
 * @param {string} projectRoot
 * @returns {Promise<import('./skill-places.mjs').SkillPlace[]>}
 */
export async function readProjectPlaces(projectRoot) {
  try {
    const configPath = findConfigPath(projectRoot);
    const config = configPath
      ? await loadModuleWithParser(configPath, parseConfig, {
          label: 'astryx.config',
          fresh: true,
        })
      : undefined;
    return savedProjectPlaces(config, projectRoot);
  } catch {
    return savedProjectPlaces(undefined, projectRoot);
  }
}

/**
 * Whether the skill folder holding `file` is a link. The computer-level
 * skill is linked into other agents' skill folders (`~/.claude/skills/astryx`
 * links to `~/.agents/skills/astryx`), so a file reached through such a link
 * belongs to another place and is never written or removed through this one.
 * @param {string} file
 * @returns {boolean}
 */
function linkedSkillFolder(file) {
  try {
    return fs.lstatSync(path.dirname(file)).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * A skill file's state, a file reached through a linked skill folder being
 * one Astryx did not write for this place.
 * @param {string} file
 * @param {string} text
 * @returns {import('./managed-skill-file.mjs').ManagedFileState}
 */
function placeFileState(file, text) {
  return linkedSkillFolder(file) ? 'foreign' : managedFileState(file, text);
}

/**
 * Write `text` to each skill file of `place`. The copies of one place are
 * written together or not at all: when any is a person's own (edited, or not
 * Astryx's), each is kept, so every agent reads one text.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {string} text
 * @returns {Array<{file: string, action: import('./managed-skill-file.mjs').ManagedFileAction, reason?: 'edited' | 'not-astryx' | 'pair-kept'}>}
 */
export function writeSkillPlace(place, projectRoot, text) {
  const files = placeSkillFiles(place, projectRoot);
  const states = files.map(file => ({file, state: placeFileState(file, text)}));
  const owned = (/** @type {string} */ state) => state === 'edited' || state === 'foreign';
  if (files.length > 1 && states.some(each => owned(each.state))) {
    return states.map(({file, state}) => ({
      file,
      action: /** @type {const} */ ('kept'),
      reason: owned(state) ? keptReason(/** @type {'edited' | 'foreign'} */ (state)) : /** @type {const} */ ('pair-kept'),
    }));
  }
  return files.map(file =>
    linkedSkillFolder(file)
      ? {file, action: /** @type {const} */ ('kept'), reason: /** @type {const} */ ('not-astryx')}
      : {file, ...writeManagedFile(file, text)},
  );
}

/**
 * Remove each skill file of `place` that is an unedited Astryx file, and
 * each folder that leaves empty, up to the folder the place names.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @returns {Array<{file: string, action: import('./managed-skill-file.mjs').ManagedFileAction, reason?: 'edited' | 'not-astryx'}>}
 */
export function removeSkillPlace(place, projectRoot) {
  // Folders the removal empties go too, up to the folder the place names, or
  // the project root for the skills folders.
  // A folder place goes too when the removal leaves it empty; the project
  // root never does.
  const stop =
    place.kind !== 'folder'
      ? projectRoot
      : place.dir === projectRoot
        ? projectRoot
        : path.dirname(place.dir);
  // The integration skills Astryx wrote there go with the project skill.
  const files = [
    ...placeSkillFiles(place, projectRoot),
    ...leftoverIntegrationSkills(place, projectRoot, new Set()),
  ];
  return files.map(file => {
    if (linkedSkillFolder(file)) {
      return {file, action: /** @type {const} */ ('kept'), reason: /** @type {const} */ ('not-astryx')};
    }
    const result = removeManagedFileIfOwned(file);
    if (result.action === 'removed' && stop)
      removeEmptyFolders(path.dirname(file), stop);
    return {file, ...result};
  });
}

/**
 * Remove `dir` and each folder above it while it is empty, stopping below
 * `stop`.
 * @param {string} dir
 * @param {string} stop
 */
function removeEmptyFolders(dir, stop) {
  let at = dir;
  while (at !== stop && !path.relative(stop, at).startsWith('..')) {
    try {
      fs.rmdirSync(at);
    } catch (error) {
      // Already gone: the file's own folder goes with the file.
      if (/** @type {{code?: string}} */ (error).code !== 'ENOENT') return;
    }
    at = path.dirname(at);
  }
}

/**
 * Why a project place cannot be written: one of its skill files resolves
 * outside the project, as through a skills folder linked out of it (such as
 * `.claude` linked to `~/.claude`). Null when every file stays inside.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string} projectRoot
 * @returns {string | null}
 */
export function skillPlaceEscape(place, projectRoot) {
  for (const file of placeSkillFiles(place, projectRoot)) {
    try {
      assertWithin(path.relative(projectRoot, file), projectRoot, {label: 'skill file'});
    } catch (err) {
      if (err instanceof PathSafetyError) {
        return `${err.message} Astryx writes the project skill only inside the project; make that folder a real folder in the project, or choose another place with \`astryx init --to\`.`;
      }
      throw err;
    }
  }
  return null;
}

/**
 * The state of each skill file of `place` against `text`.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {string} text
 * @returns {Array<{file: string, state: import('./managed-skill-file.mjs').ManagedFileState}>}
 */
export function inspectSkillPlace(place, projectRoot, text) {
  return placeSkillFiles(place, projectRoot).map(file => ({
    file,
    state: placeFileState(file, text),
  }));
}

/**
 * What a receipt line says about a skill file a run kept as it is, by why
 * it was kept. `editedHint` says what a person does with a file they edited.
 * @param {'edited' | 'not-astryx' | 'pair-kept' | undefined} reason
 * @param {string} editedHint
 * @returns {string}
 */
export function keptText(reason, editedHint) {
  if (reason === 'edited') return `kept, edited since Astryx wrote it; ${editedHint}`;
  if (reason === 'pair-kept') {
    return "kept: the other copy of this place is not Astryx's, so neither copy is written";
  }
  return 'kept, not created by Astryx';
}

/**
 * The state of one integration skill's file in each skills folder of `place`.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {{name: string, text: string}} skill
 * @returns {Array<{file: string, state: import('./managed-skill-file.mjs').ManagedFileState}>}
 */
export function inspectIntegrationSkill(place, projectRoot, {name, text}) {
  return placeFolders(place, projectRoot).map(folder => {
    const file = path.join(folder, name, 'SKILL.md');
    return {file, state: placeFileState(file, text)};
  });
}

/**
 * Write each integration skill into every skills folder of `place`, as
 * `<folder>/<name>/SKILL.md`. The copies of one skill are written together or
 * not at all, as the project skill's are.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {ReadonlyArray<{name: string, text: string}>} skills
 * @returns {Array<{file: string, skill: string, action: import('./managed-skill-file.mjs').ManagedFileAction, reason?: 'edited' | 'not-astryx' | 'pair-kept'}>}
 */
export function writeIntegrationSkills(place, projectRoot, skills) {
  const folders = placeFolders(place, projectRoot);
  /** @type {ReturnType<typeof writeIntegrationSkills>} */
  const rows = [];
  for (const {name, text} of skills) {
    const files = folders.map(folder => path.join(folder, name, 'SKILL.md'));
    const states = files.map(file => ({file, state: placeFileState(file, text)}));
    const owned = (/** @type {string} */ state) => state === 'edited' || state === 'foreign';
    if (states.some(each => owned(each.state))) {
      for (const {file, state} of states) {
        rows.push({
          file,
          skill: name,
          action: 'kept',
          reason: owned(state) ? keptReason(/** @type {'edited' | 'foreign'} */ (state)) : 'pair-kept',
        });
      }
      continue;
    }
    for (const file of files) rows.push({file, skill: name, ...writeManagedFile(file, text)});
  }
  return rows;
}

/**
 * The integration skills Astryx wrote in `place` that no loaded integration
 * declares any more, as after a package was removed: each skill folder whose
 * SKILL.md is an unedited Astryx file, other than the project and computer
 * skills and the names in `keep`.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {ReadonlySet<string>} keep
 * @returns {string[]} the SKILL.md files
 */
export function leftoverIntegrationSkills(place, projectRoot, keep) {
  /** @type {string[]} */
  const files = [];
  for (const folder of placeFolders(place, projectRoot)) {
    let names;
    try {
      names = fs.readdirSync(folder);
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      if (name === PROJECT_SKILL_NAME || name === COMPUTER_SKILL_NAME || keep.has(name)) continue;
      const file = path.join(folder, name, 'SKILL.md');
      if (managedFileState(file, '') === 'differs') files.push(file);
    }
  }
  return files;
}

/**
 * Remove integration skill files, and each skill folder that leaves empty.
 * @param {readonly string[]} files
 * @returns {Array<{file: string, skill: string, action: import('./managed-skill-file.mjs').ManagedFileAction, reason?: 'edited' | 'not-astryx'}>}
 */
export function removeIntegrationSkillFiles(files) {
  return files.map(file => ({
    file,
    skill: path.basename(path.dirname(file)),
    ...removeManagedFileIfOwned(file),
  }));
}
