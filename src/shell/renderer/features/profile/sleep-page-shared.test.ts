import { describe, expect, it } from 'vitest';
import { calcDuration, fmtDuration, packNotes, unpackNapRows, unpackNotes } from './sleep-page-shared.js';

describe('sleep record editing', () => {
  it('restores each saved nap and preserves durations when only the free note changes', () => {
    const saved = packNotes('', '10:00-10:30(30m), 13:00-14:30(1h30m)', 'original');
    const rows = unpackNapRows(unpackNotes(saved).napNotes);
    expect(rows).toEqual([{ start: '10:00', end: '10:30' }, { start: '13:00', end: '14:30' }]);
    const durations = rows.map(({ start, end }) => calcDuration(start, end)!);
    expect(durations.reduce((sum, minutes) => sum + minutes, 0)).toBe(120);
    const edited = packNotes('', rows.map((row, i) => `${row.start}-${row.end}(${fmtDuration(durations[i]!)})`).join(', '), 'edited');
    expect(unpackNapRows(unpackNotes(edited).napNotes)).toEqual(rows);
    expect(unpackNotes(edited).freeNotes).toBe('edited');
  });

  it('keeps records without naps empty', () => {
    expect(unpackNapRows(unpackNotes(null).napNotes)).toEqual([]);
  });
});
