// Kept for the README and the muscle memory: the Blades registry is now
// built by the build-aware tools/build-registry.ts, which binds tables to
// classes through the call graph instead of this file's hand-written map
// (that map survives there as a regression assertion for 6770).
//
//   node --import tsx tools/build-registry-6770.ts  ==  node --import tsx tools/build-registry.ts --build 6770
process.argv.push('--build', '6770');
await import('./build-registry');

export {};
