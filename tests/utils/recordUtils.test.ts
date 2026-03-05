/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import { describe, expect, it } from 'vitest';
import {
    clonePinnedNotesRecord,
    ensureRecord,
    foldSearchText,
    foldSearchTextFromLowercase,
    isStringRecordValue,
    threeWayMergePinnedNotes,
    normalizePinnedNoteContext,
    sanitizeRecord
} from '../../src/utils/recordUtils';

describe('sanitizeRecord', () => {
    it('returns a null-prototype object while preserving own entries', () => {
        const record = { valid: 'ok', constructor: 'icon' };

        const sanitized = sanitizeRecord(record);

        expect(Object.getPrototypeOf(sanitized)).toBeNull();
        expect(sanitized.valid).toBe('ok');
        expect(sanitized.constructor).toBe('icon');
    });

    it('drops inherited properties from the prototype chain', () => {
        const prototype = { inherited: 'skip' };
        const record: Record<string, string> = { own: 'keep' };
        Object.setPrototypeOf(record, prototype);

        const sanitized = sanitizeRecord(record);

        expect(sanitized).toEqual({ own: 'keep' });
        expect('inherited' in sanitized).toBe(false);
    });

    it('applies validators to filter out invalid values', () => {
        const record = { good: 'yes', bad: 123 as unknown as string };

        const sanitized = sanitizeRecord(record, isStringRecordValue);

        expect(sanitized).toEqual({ good: 'yes' });
    });
});

describe('foldSearchText', () => {
    it('folds accents to base characters', () => {
        expect(foldSearchText('Canción')).toBe('cancion');
        expect(foldSearchText('Ścieżka')).toBe('sciezka');
    });

    it('preserves combining marks on non-Latin scripts', () => {
        expect(foldSearchText('مُدَرِّس')).toBe('مُدَرِّس');
        expect(foldSearchText('Άλφα')).toBe('άλφα');
    });

    it('does not apply compatibility equivalence mappings', () => {
        expect(foldSearchText('straße')).not.toBe(foldSearchText('strasse'));
        expect(foldSearchText('ﬁle')).not.toBe(foldSearchText('file'));
        expect(foldSearchText('ＡＢＣ')).not.toBe(foldSearchText('abc'));
    });

    it('matches foldSearchTextFromLowercase output for lowercased input', () => {
        const lowercased = 'canción';
        expect(foldSearchTextFromLowercase(lowercased)).toBe(foldSearchText(lowercased));
    });
});

describe('ensureRecord', () => {
    it('creates a null-prototype record when input is undefined', () => {
        const ensured = ensureRecord<string>(undefined);

        expect(Object.getPrototypeOf(ensured)).toBeNull();
    });

    it('sanitizes objects with prototypes by rebuilding entries only', () => {
        const proto = { inherited: 'skip' };
        const record: Record<string, string> = { own: 'keep' };
        Object.setPrototypeOf(record, proto);

        const ensured = ensureRecord(record);

        expect(Object.getPrototypeOf(ensured)).toBeNull();
        expect(ensured).toEqual({ own: 'keep' });
    });

    it('removes invalid values when validate is provided', () => {
        const record = Object.create(null) as Record<string, unknown>;
        record.valid = 'ok';
        record.invalid = 42;

        const ensured = ensureRecord(record, isStringRecordValue);

        expect(ensured).toEqual({ valid: 'ok' });
        expect(Object.prototype.hasOwnProperty.call(ensured, 'invalid')).toBe(false);
    });
});

describe('pinned note record helpers', () => {
    it('normalizes malformed pinned context values to strict booleans', () => {
        expect(normalizePinnedNoteContext('invalid')).toEqual({ folder: false, tag: false, property: false });
        expect(normalizePinnedNoteContext({ folder: true, tag: 'yes', property: 1 })).toEqual({
            folder: true,
            tag: false,
            property: false
        });
        expect(normalizePinnedNoteContext({ folder: true, tag: true })).toEqual({
            folder: true,
            tag: true,
            property: true
        });
    });

    it('clones pinned note records into null-prototype objects with normalized contexts', () => {
        const cloned = clonePinnedNotesRecord({
            'a.md': { folder: true, tag: false, property: false },
            'b.md': { folder: 'true' },
            'c.md': null,
            'd.md': { folder: true, tag: true }
        });

        expect(Object.getPrototypeOf(cloned)).toBeNull();
        expect(cloned['a.md']).toEqual({ folder: true, tag: false, property: false });
        expect(cloned['b.md']).toEqual({ folder: false, tag: false, property: false });
        expect(cloned['c.md']).toEqual({ folder: false, tag: false, property: false });
        expect(cloned['d.md']).toEqual({ folder: true, tag: true, property: true });
    });
});

describe('threeWayMergePinnedNotes', () => {
    const pin = (f: boolean, t: boolean, p: boolean) => ({ folder: f, tag: t, property: p });

    it('preserves a local addition not in base or incoming', () => {
        const base = {};
        const local = { 'a.md': pin(true, false, false) };
        const incoming = {};

        const { merged, changed } = threeWayMergePinnedNotes(base, local, incoming);

        expect(merged['a.md']).toEqual(pin(true, false, false));
        expect(changed).toBe(true);
    });

    it('accepts a remote addition not in base or local', () => {
        const base = {};
        const local = {};
        const incoming = { 'a.md': pin(false, true, false) };

        const { merged, changed } = threeWayMergePinnedNotes(base, local, incoming);

        expect(merged['a.md']).toEqual(pin(false, true, false));
        expect(changed).toBe(false);
    });

    it('keeps both when different notes are added on each side', () => {
        const base = {};
        const local = { 'a.md': pin(true, false, false) };
        const incoming = { 'b.md': pin(false, true, false) };

        const { merged, changed } = threeWayMergePinnedNotes(base, local, incoming);

        expect(merged['a.md']).toEqual(pin(true, false, false));
        expect(merged['b.md']).toEqual(pin(false, true, false));
        expect(changed).toBe(true);
    });

    it('respects a remote unpin (entry removed in incoming)', () => {
        const base = { 'a.md': pin(true, false, false) };
        const local = { 'a.md': pin(true, false, false) };
        const incoming = {};

        const { merged, changed } = threeWayMergePinnedNotes(base, local, incoming);

        expect(merged['a.md']).toBeUndefined();
        expect(changed).toBe(false);
    });

    it('respects a local unpin (entry removed in local)', () => {
        const base = { 'a.md': pin(true, false, false) };
        const local = {};
        const incoming = { 'a.md': pin(true, false, false) };

        const { merged, changed } = threeWayMergePinnedNotes(base, local, incoming);

        expect(merged['a.md']).toBeUndefined();
        expect(changed).toBe(true);
    });

    it('merges independent context flag changes on the same entry', () => {
        const base = { 'a.md': pin(true, false, false) };
        const local = { 'a.md': pin(true, true, false) }; // added tag locally
        const incoming = { 'a.md': pin(true, false, true) }; // added property remotely

        const { merged, changed } = threeWayMergePinnedNotes(base, local, incoming);

        expect(merged['a.md']).toEqual(pin(true, true, true));
        expect(changed).toBe(true);
    });

    it('reports no change when local has no modifications relative to base', () => {
        const base = { 'a.md': pin(true, false, false) };
        const local = { 'a.md': pin(true, false, false) };
        const incoming = { 'a.md': pin(true, true, false) };

        const { merged, changed } = threeWayMergePinnedNotes(base, local, incoming);

        expect(merged['a.md']).toEqual(pin(true, true, false));
        expect(changed).toBe(false);
    });

    it('returns a null-prototype record', () => {
        const { merged } = threeWayMergePinnedNotes({}, {}, {});

        expect(Object.getPrototypeOf(merged)).toBeNull();
    });

    it('drops entries where all contexts resolve to false', () => {
        const base = { 'a.md': pin(true, false, false) };
        const local = { 'a.md': pin(false, false, false) }; // unpinned locally
        const incoming = { 'a.md': pin(true, false, false) };

        const { merged } = threeWayMergePinnedNotes(base, local, incoming);

        expect(merged['a.md']).toBeUndefined();
    });
});
