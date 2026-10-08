import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEvidenceFallbackFixtures } from '../src/services/predictionEvidenceMerge';

const evidence = (fixture: any) =>
  Boolean(fixture?.homeTeam?.formSource || fixture?.awayTeam?.formSource);

test('fallback enrichment does not replace a primary-enriched fixture', () => {
  const primary = [
    {
      id: 'manual-1',
      kickoffTime: '2026-10-08T17:30:00Z',
      homeTeam: { name: 'CD Independiente Juniors', formSource: 'SPORTMONKS', form: ['W', 'D', 'W'] },
      awayTeam: { name: '9 de Octubre FC' },
    },
  ];
  const fallback = [
    {
      id: 'espn-1',
      kickoffTime: '2026-10-08T17:30:00Z',
      homeTeam: { name: 'CD Independiente Juniors', formSource: 'ESPN', form: ['L', 'W'] },
      awayTeam: { name: '9 de Octubre FC' },
    },
  ];

  const merged = mergeEvidenceFallbackFixtures(primary, fallback, evidence);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'manual-1');
  assert.equal(merged[0].homeTeam.formSource, 'SPORTMONKS');
});

test('fallback evidence replaces only a matching no-evidence fixture', () => {
  const primary = [
    {
      id: 'manual-2',
      kickoffTime: '2026-10-08T17:30:00Z',
      homeTeam: { name: 'FC CFR 1907 Cluj' },
      awayTeam: { name: 'FC Universitatea Cluj' },
    },
  ];
  const fallback = [
    {
      id: 'espn-2',
      kickoffTime: '2026-10-08T17:30:00Z',
      homeTeam: { name: 'FC CFR 1907 Cluj', formSource: 'ESPN', form: ['W', 'W'] },
      awayTeam: { name: 'FC Universitatea Cluj' },
    },
  ];

  const merged = mergeEvidenceFallbackFixtures(primary, fallback, evidence);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'espn-2');
  assert.equal(merged[0].homeTeam.formSource, 'ESPN');
});

test('fallback-only evidence is added without deleting unrelated manual fixtures', () => {
  const primary = [
    {
      id: 'manual-3',
      kickoffTime: '2026-10-08T17:30:00Z',
      homeTeam: { name: 'AL TALABA' },
      awayTeam: { name: 'AL SHORTA SC' },
    },
  ];
  const fallback = [
    {
      id: 'espn-3',
      kickoffTime: '2026-10-08T18:30:00Z',
      homeTeam: { name: 'FC CFR 1907 Cluj', formSource: 'ESPN', form: ['W'] },
      awayTeam: { name: 'FC Universitatea Cluj' },
    },
  ];

  const merged = mergeEvidenceFallbackFixtures(primary, fallback, evidence);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'manual-3');
  assert.equal(merged[1].id, 'espn-3');
});
