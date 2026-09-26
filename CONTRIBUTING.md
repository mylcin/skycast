# Contributing to skycast

Thanks for helping. Bug reports, ideas and pull requests are all welcome.
For anything bigger than a fix, open an issue first so we can agree on the
shape before you spend time on it.

## Setup

```sh
git clone https://github.com/mylcin/weather-cli.git
cd weather-cli
nvm use          # Node 22.18 or later: the build and release tools need it
npm install      # also installs the git hooks (lefthook)
```

The published CLI supports Node 20.19 and later, and CI tests it on
Node 20, 22 and 24 on Linux, macOS and Windows. Only the development tools
need Node 22.

## Everyday commands

| Command                  | What it does                                              |
| ------------------------ | --------------------------------------------------------- |
| `npm run dev -- <args>`  | Run the CLI from source, e.g. `npm run dev -- now Berlin` |
| `npm run check`          | Lint, types, formatting and unit tests, as CI runs them   |
| `npm test`               | Unit and integration tests                                |
| `npm run coverage`       | The same with coverage (thresholds in `vitest.config.ts`) |
| `npm run build`          | Bundle to `dist/` and check the package with publint      |
| `npm run test:e2e`       | Run the built bundle as a real process (build first)      |
| `npm run screenshots`    | Regenerate the SVG screenshots in `docs/`                 |
| `npm run fixtures:serve` | Start the local fixture server (see below)                |

## Layout

```text
src/
├── cli/         commander program, commands, session, prompts, completion
├── renderers/   pure functions from reports to text or JSON
├── core/        domain models, units, place matching, services
├── providers/   provider interfaces and the Open-Meteo implementation
├── infra/       HTTP client, caches, settings store, paths, atomic writes
└── i18n/        en.ts and tr.ts
tests/
├── unit/        one folder per layer
├── integration/ the whole CLI in memory, with msw answering HTTP
├── e2e/         the built bundle as a child process, against the fixture server
├── fixtures/    real Open-Meteo answers
└── helpers/     msw setup, fakes, fixture loaders, the in-memory CLI runner
```

ESLint enforces the direction of dependencies. `core` must not import
`cli`, `infra` or a concrete provider, and renderers must not fetch. If the
linter stops you, the code probably belongs in another layer.

## Tests

- **No test talks to the real API.** msw fails any request without a
  handler, and the end-to-end tests use `scripts/fixture-server.ts`.
- **Fixtures are real answers.** To add one, save a response and give the
  file a name that says what it contains:

  ```sh
  curl -s 'https://geocoding-api.open-meteo.com/v1/search?name=Oslo&count=10&language=en&format=json' \
    > tests/fixtures/open-meteo/geo-oslo-en.json
  ```

  The fixture server shifts saved forecasts to the current time, so they
  never go stale. Tests that run the CLI in memory pin the clock with the
  `now` hook instead.

- **Snapshots** cover the renderers in both languages at several widths.
  After a deliberate layout change, update them with `npx vitest -u` and
  read the diff before committing.
- **Layout tests** check that no line is wider than the terminal. Keep them
  passing when you add columns.

## Changing user-facing text

Every string lives in `src/i18n/en.ts` and `src/i18n/tr.ts`, both typed as
`Messages` in `src/i18n/types.ts`. TypeScript and
`tests/unit/i18n/messages.test.ts` fail if a key is missing in either
language. Write Turkish that reads naturally, not a word-for-word
translation.

To add a language:

1. Copy `en.ts` and translate it.
2. Register it in `src/i18n/index.ts` and `LANGS`.
3. Add it to the `--lang` choices in `src/cli/program.ts` and to the
   settings schema in `src/infra/config-store.ts`.

## Adding a data source

A weather provider implements `WeatherProvider`, and a geocoder
implements `GeocodingProvider` (both in `src/providers/types.ts`):

1. Map the API's answers to the domain models in canonical metric units.
2. Validate responses with zod.
3. Take an `HttpClient`, so retries, timeouts and caching come for free.
4. Wire it in `src/cli/container.ts`.

## Commits and pull requests

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:`…). The commit-msg hook and
  CI check them.
- The pre-commit hook formats and lints staged files.
- If users will notice the change, add a changeset: run `npx changeset`,
  pick the bump and write one or two sentences for the changelog.

## Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets):

1. When pull requests with changesets land on `main`, the Release workflow
   opens or updates a "chore: version packages" pull request. It bumps the
   version and updates `CHANGELOG.md`.
2. Merging that pull request publishes to npm from GitHub Actions, through
   npm trusted publishing. No npm token is stored, and each release gets a
   provenance statement.

Trusted publishing is set up on a package that already exists, so the
very first release is manual:

```sh
npm login
npm run build
npm publish --access public
```

Then, on npmjs.com, add a trusted publisher for the package: GitHub
Actions, repository `mylcin/weather-cli`, workflow `release.yml`.

## Recording the demo

`demo/demo.tape` records `docs/demo.gif` with [vhs](https://github.com/charmbracelet/vhs)
against the fixture server, so the recording does not depend on the
network:

```sh
npm run build
vhs demo/demo.tape
```

The "Demo GIF" workflow does the same in CI and uploads the GIF as an
artifact.

## Be kind

Assume good intent, keep feedback about the code, and help newcomers find
their way.
