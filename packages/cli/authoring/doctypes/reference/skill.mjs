// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The rules a doc's `skill` follows: its name is the skill's folder
 * name and its description is what an agent matches a task against. Shared by
 * the skill places, which leave out a skill that breaks one, and by the
 * integration checks, which warn about it before the package is published.
 *
 * @input  a doc's `skill` value
 * @output why it cannot be a skill, or null
 * @position authoring/doctypes/reference — read by the docs adapter and the
 *   integration checks
 */

/** The longest skill name, as agents that read SKILL.md accept it. */
export const MAX_SKILL_NAME = 64;

/** The longest skill description, as every agent reads it whole. */
export const MAX_SKILL_DESCRIPTION = 1024;

/** Names the CLI's own skills use. */
export const RESERVED_SKILL_NAMES = Object.freeze(['astryx', 'astryx-project']);

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * Why `skill` cannot be a skill, or null when it can.
 * @param {{name: string, description: string}} skill
 * @returns {string | null}
 */
export function skillProblem({name, description}) {
  if (!SKILL_NAME.test(name)) {
    return `skill name "${name}" must be lowercase letters and digits, in words joined by single hyphens (such as "acme-entities")`;
  }
  if (name.length > MAX_SKILL_NAME) {
    return `skill name "${name}" is longer than ${MAX_SKILL_NAME} characters`;
  }
  if (RESERVED_SKILL_NAMES.includes(name)) {
    return `skill name "${name}" is the name of an Astryx skill; choose a name of your own, such as your package name`;
  }
  const text = description.trim();
  if (text === '') return `skill "${name}" needs a description that says when to use it`;
  if (/[\r\n]/u.test(description)) return `skill "${name}" description must be one line`;
  if ([...description].length > MAX_SKILL_DESCRIPTION) {
    return `skill "${name}" description is longer than ${MAX_SKILL_DESCRIPTION} characters`;
  }
  return null;
}
