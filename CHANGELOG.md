# skycast

## 0.2.0

### Minor Changes

- [#9](https://github.com/mylcin/skycast/pull/9) [`b23a345`](https://github.com/mylcin/skycast/commit/b23a3451191821edc9d170adf03b16c7ccc8fb13) Thanks [@mylcin](https://github.com/mylcin)! - Redrawn weather pictures: a crescent moon, a sun rising behind the partly cloudy sky, two cloud banks for overcast, rain centred under its cloud, and a lightning bolt that no longer looks like rain without colour. Showers and snow showers now show the sun or the stars of their clear spells, and hail has its own picture.
  
  The hourly temperature chart no longer stretches a change of a degree or two to its full height, and an hourly window without temperatures no longer prints "Infinity". Settings written by a newer skycast are kept when an older one saves the file. JSON output now says why stale data is shown (`meta.staleBecause`).

- [#9](https://github.com/mylcin/skycast/pull/9) [`b23a345`](https://github.com/mylcin/skycast/commit/b23a3451191821edc9d170adf03b16c7ccc8fb13) Thanks [@mylcin](https://github.com/mylcin)! - `now` says what changes next: one line under today's range when, in the next 12 hours, rain or snow becomes likely or eases, or strong gusts start, or when tomorrow is at least 5° warmer or colder. The thresholds are fixed and the forecast's probability is always shown. `now --json` has the same as a `changes` array, and hourly JSON gains `windGusts`.

### Patch Changes

- [#11](https://github.com/mylcin/skycast/pull/11) [`f5ef84d`](https://github.com/mylcin/skycast/commit/f5ef84dcc8948561a1d1a1123226804e7710ab65) Thanks [@mylcin](https://github.com/mylcin)! - Offline answers from the cache arrive in about 6 s instead of 25 s on a network that drops packets: when a usable stale entry exists, each attempt times out after 3 s and is retried once.

- [#11](https://github.com/mylcin/skycast/pull/11) [`af38047`](https://github.com/mylcin/skycast/commit/af38047bac5a840b6868e91c0384b31bc3a051d2) Thanks [@mylcin](https://github.com/mylcin)! - Taking over a settings lock left by a crashed run no longer lets two skycast processes write at once.

## 0.1.0

### Minor Changes

- [`9e299f4`](https://github.com/mylcin/skycast/commit/9e299f4a2bbdaa2b7cf147813a42661018b760e2) - First release: current weather, daily and hourly forecasts and side-by-side comparisons in the terminal, with ASCII art, colour-coded temperatures, English and Turkish output, JSON for scripts, favourites, settings, an offline cache and shell completion.

All notable changes are listed here. Entries are written by
[Changesets](https://github.com/changesets/changesets) when a release is
cut; see [CONTRIBUTING.md](CONTRIBUTING.md#releasing).
