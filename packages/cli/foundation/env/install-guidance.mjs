// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How an app adds a dependency, when an integration says the package
 * manager's add command is the wrong step there.
 *
 * Each loaded integration may set `installGuidance` in its manifest: one line
 * where `{packages}` stands for the packages to add. It is read from the same
 * per-project record as `cliCommand` (cli-command.mjs): one line, declared by
 * one or more integrations, is used wherever the CLI prints an install step;
 * two different lines cancel each other out, and `astryx doctor` warns.
 *
 * @input The record `Project.load` keeps of a project's integrations.
 * @output The guidance line for a directory, with the packages filled in.
 * @position foundation/env — read by install-step printers.
 */

import {declaredSetting} from './cli-command.mjs';

/**
 * The guidance line for the project at `targetDir`, with `{packages}` filled
 * in; undefined when no loaded integration gives one, when two give different
 * lines, or when this process has not loaded the project.
 * @param {string[]} packages the package names to add
 * @param {string} [targetDir=process.cwd()]
 * @returns {string | undefined}
 */
export function installGuidanceFor(packages, targetDir = process.cwd()) {
  return declaredSetting('installGuidance', targetDir).value?.replaceAll(
    '{packages}',
    packages.join(' '),
  );
}
