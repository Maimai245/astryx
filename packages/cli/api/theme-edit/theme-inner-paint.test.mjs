// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A paint an element inside a part draws from a token (a list item's label
 * text): set never takes the property on the part, which that element
 * paints over, and offers the token. A paint drawn by a part of its own (a
 * keyboard key's badge, a calendar's range band) is no such paint: a fill on
 * the group around it is taken. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-inner-paint-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** @param {string} q @param {string} theme */
const answer = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return {
    parts: data.understood?.parts ?? [],
    writes: (data.results ?? [])
      .flatMap((/** @type {any} */ r) => r.commands)
      .filter((/** @type {string} */ c) => / editor set /.test(c))
      .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
    text: (data.results ?? []).map((/** @type {any} */ r) => r.text).join('\n'),
  };
};

describe('a paint drawn inside a part', () => {
  it('refuses the property on the part and offers the token, and takes a fill on a group whose inner paints are parts of their own', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('i', {cwd, like: 'neutral'});
    // Kbd's key badges paint each key's fill as a part of their own,
    // kbd-key, which takes the property. Now that the badges, and a
    // calendar's range band, are parts of their own, a fill on the group
    // around them (kbd, calendar) is no longer painted over, so it is taken
    // and paints the group's own box; so is one on a part whose inner parts
    // paint their own (a paragraph's code).
    await themeEditSet('i', 'background-color', '#888888', {
      cwd,
      on: 'kbd-key',
    });
    await themeEditSet('i', 'background-color', '#999999', {cwd, on: 'kbd'});
    await themeEditSet('i', 'background-color', '#f5f5f5', {
      cwd,
      on: 'markdown-paragraph',
    });
    await themeEditSet('i', 'background-color', '#fafafa', {
      cwd,
      on: 'calendar',
    });
    const item = await refusal(() =>
      themeEditSet('i', 'color', '#ff0000', {cwd, on: 'radio-list-item'}),
    );
    expect(item.code).toBe('ERR_THEME_NO_EFFECT');
    expect(item.run[0]).toMatch(
      /--color-text-primary '#ff0000' --on radio-list-item$/,
    );
    // (A part that paints its own fill keeps the property.)
    await themeEditSet('i', 'background-color', '#888888', {cwd, on: 'card'});
    // The words for a keyboard key or shortcut read Kbd's key badges, which
    // paint every key.
    for (const q of [
      'make the keyboard keys gray',
      'make the keyboard shortcut gray',
      'make the kbd gray',
    ]) {
      const keys = await answer(q, 'i');
      expect(keys.parts, q).toContain('kbd-key');
      expect(keys.writes.join('\n'), q).toMatch(/ --on kbd-key\b/);
    }
    // The space between the keys is the gap of the shortcut that lays them
    // out: written on kbd, never as padding on each key.
    for (const q of [
      'make the gap in the keyboard shortcut bigger',
      'put more space between the keyboard keys',
    ]) {
      const gap = await answer(q, 'i');
      expect(gap.writes[0], q).toMatch(/ --on kbd$/);
    }
    // Only a part of the keys' own component holds their gap: the space
    // between avatars or dividers is never written on a part of another
    // component that holds them (a chat message, a context menu).
    for (const [q, other] of [
      ['more space between the avatars', 'chat-message'],
      ['more space between the dividers', 'context-menu'],
    ]) {
      const gap = await answer(q, 'i');
      expect(gap.writes.join('\n'), q).not.toMatch(
        new RegExp(` --on ${other}\\b`),
      );
    }
    const text = await answer('make the radio list item text red', 'i');
    expect(text.writes.join('\n')).not.toMatch(
      / color '#dc2626' --on radio-list-item/,
    );
  }, 240_000);
});
