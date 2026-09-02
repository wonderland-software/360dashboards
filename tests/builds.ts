// Which extracted builds the corpus tests run over: every build that has an
// extracted/<build>/xuiz directory, or just DASH_BUILD when it is set. The
// per-build minimum counts stop a partial dump from passing as a corpus.
import { existsSync, readFileSync } from 'node:fs';
import { BUILDS } from '../tools/builds';

export function corpusBuilds(): string[] {
  const only = process.env['DASH_BUILD'];
  return Object.keys(BUILDS).filter((b) => (!only || b === only) && existsSync(`extracted/${b}/xuiz`));
}

/** Scene and pack counts a full dump of each build is known to have (fixtures/expected-<build>.json). */
export function expectedCounts(build: string): Record<string, number> {
  return JSON.parse(readFileSync(`fixtures/expected-${build}.json`, "utf8")) as Record<string, number>;
}
