# Skycast improvement plan

An audit of skycast 0.1.0 (`main` at `64933cd`), written before any change
was made, then updated with what was actually implemented (see
[§12](#12-implementation-log)).

Every claim below was checked against the source, a reproduction or a test
run. Findings are labelled:

- **Confirmed**: reproduced, with the command or test that shows it.
- **Risk**: real in the code, but needs unusual conditions to bite.
- **Preference**: a design opinion, argued but not a defect.

Priorities: **P0** confirmed correctness, reliability or compatibility
problems. **P1** high value for visual quality or everyday use. **P2**
useful capabilities or engineering work. **P3** experiments that need
validation.

## 1. Executive summary

skycast is in unusually good shape for a 0.1. The layering is real and
lint-enforced, the HTTP client is careful (per-attempt timeouts, jittered
retries, `Retry-After`, stale-if-error), JSON output is versioned, colour
and width detection follow the conventions, and 415 unit/integration tests
plus 8 end-to-end tests run on three OSes and three Node versions. There is
no animation anywhere; the only moving element is the spinner.

The opportunities are therefore not "rewrite X". They are:

1. **Two confirmed defects** (P0): writing settings deletes keys written by
   a newer skycast, and the hourly view prints `Infinity° – -Infinity°`
   when the API has no temperatures.
2. **The illustrations are the weakest part of the product** (P1). They are
   competent wttr.in-style drawings, but rain sits 1.5 columns left of its
   cloud, the lightning bolt is drawn with the rain glyph (`/`) so a storm
   is indistinguishable from rain without colour, "Overcast" is the same
   single cloud used by every rainy picture, and only 3 of 28 weather codes
   change between day and night.
3. **One chart misleads** (P1): the temperature sparkline stretches any
   range to full height, so a day that moves between 19.1° and 19.8° looks
   like a heatwave and a cold snap.
4. **The best new feature** is interpretation, not more widgets: a short,
   data-grounded "what changes next" line ("Rain likely from 15:00",
   "8° colder tomorrow") built from data the app already fetches (P1,
   needs a product decision on wording).

Recommended first steps, all low risk and now implemented (§12): fix the
two P0 defects, give the art a written visual system and redraw the pictures
that break it (keeping the 13 × 5 ASCII canvas and its tests), add shower
and hail pictures with day/night variants, make the sparkline scale honest,
and add a showcase script that renders every picture from the real
renderer.

## 2. Verified current feature inventory

| Feature                         | Verified in                                                                                                    | Notes and limits                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Current weather + ASCII picture | `renderers/current.ts`, `ascii-art.ts`                                                                         | Picture only at ≥ 56 columns; 14 static pictures for 12 condition groups                                              |
| Daily forecast 1–16 days        | `cli/program.ts:173`, `renderers/forecast.ts`                                                                  | Range bar on a scale shared by all days; one spare day requested                                                      |
| Hourly 1–168 hours              | `cli/program.ts:187`, `renderers/hourly.ts`                                                                    | Provider supports 384; CLI caps at 168. Sparklines downsample with a regular axis (brute-forced: aligned for n ≤ 168) |
| Temperature colour scale        | `renderers/paint.ts:15-23`                                                                                     | 7 stops, interpolated; imperial converted back to °C for colour                                                       |
| Wind arrows                     | `renderers/format.ts:103-128`                                                                                  | Arrows point downwind; ASCII mode drops them and keeps the compass point                                              |
| Compare                         | `cli/commands/weather.ts:134-205`                                                                              | Up to 10 places, one request; partial failures reported, exit code = worst failure                                    |
| English and Turkish             | `i18n/*.ts`, `tests/unit/i18n/messages.test.ts`                                                                | Type-checked parity; 7 strings are unused (see B8)                                                                    |
| Place search, disambiguation    | `core/location.ts`, `core/location-service.ts`                                                                 | Population-share heuristic, qualifier retry, capital for countries; picker on stderr                                  |
| Settings, favourites            | `infra/config-store.ts`, `cli/commands/*.ts`                                                                   | Atomic write + lock; salvage mode; reset keeps favourites (but see B1)                                                |
| Cache + stale fallback          | `infra/http.ts:219-286`, `infra/file-cache.ts`                                                                 | 10 min TTL forecast, 30 days geocoding; stale up to 24 h on outage only                                               |
| JSON, compact, colour, ASCII    | `renderers/json.ts`, `cli/terminal.ts`, `renderers/symbols.ts`                                                 | `schemaVersion: 1`; errors as one JSON line on stderr                                                                 |
| Shell completion                | `cli/completion.ts`                                                                                            | Generated from the command tree for bash 3.2+, zsh, fish                                                              |
| Tooling                         | `vitest.config.ts`, `eslint.config.js`, `.github/workflows/*.yml`                                              | Coverage gates 95/95/95/85; CI on Linux/macOS/Windows × Node 20/22/24; tarball install smoke test                     |
| Screenshots and demo            | `scripts/screenshot.ts` (real CLI → SVG), `demo/demo.tape` (vhs, CI `workflow_dispatch`, GIF is not committed) | The README shows the SVGs, so art changes mean regenerating them with `npm run screenshots`                           |

## 3. Architecture and data flow

```text
src/cli.ts            SIGINT → AbortController; EPIPE → quiet exit
  └─ cli/run.ts       scan --json/--no-color/--lang early, load config
       │              (errors deferred), build the commander tree
       ├─ session.ts  lang → units → unicode → paint (stdout, stderr apart)
       │              → width → services (container.ts) → spinner, picker
       ├─ locate.ts   words | --lat/--lon | saved city
       │    └─ core/location-service.ts   search → rankCandidates →
       │         qualifier retry → choose (TTY) or best guess + notice →
       │         country → capital
       ├─ core/weather-service.ts   clamp days/hours, one provider call
       │    └─ providers/open-meteo/forecast.ts   batches of 50 points,
       │         +1 spare day/hour, fromNow() trims to the local hour
       │         └─ infra/http.ts   cache TTL → fetch (timeout, retries)
       │              → zod parse → cache write | stale fallback
       │    └─ core/units.ts   metric → imperial once
       └─ renderers/*  pure: report + RenderContext → string
```

The boundaries hold. ESLint `no-restricted-imports` rules
(`eslint.config.js:44-63`) stop `core` importing `cli`, `infra`,
`renderers` or a concrete provider, and stop `renderers` importing `infra`
or `providers`. `core` imports only provider _types_. Renderers are pure
(no I/O; `now` is injected), which is why snapshot tests are stable. The
one place that knows concrete implementations is `cli/container.ts`.

Invariants worth keeping:

- Times are local wall-clock strings and are never parsed with
  `new Date()` (`core/models.ts:5-8`).
- Tables measure plain text and colour it last (`renderers/table.ts`), and
  widths use `fast-string-width`, not `.length`.
- Every view fits 30 columns (`tests/unit/renderers/edge-cases.test.ts`).
- stdout carries only the result; notices, spinner, picker and errors go
  to stderr.
- JSON may gain fields; renames and removals need a `schemaVersion` bump.
- The published package has no runtime dependencies (`tsdown.config.ts`).

## 4. ASCII art inventory and review

All pictures live in `src/renderers/ascii-art.ts`: 13 columns × 5 rows of
printable ASCII, each with a same-shaped colour mask (`s` sun, `m` moon,
`*` star, `c` cloud, `r` rain, `n` snow, `l` bolt, `f` fog). `drawPicture`
paints runs of equal role with truecolor that ansis downgrades to 256 or
16 colours. The picture is chosen by `pictureFor(group, isDay)` from the
condition _group_, so all 28 WMO codes share 14 pictures, and only clear
and partly cloudy skies have a night variant. **There are no animation
frames**: every picture is a single static frame. ASCII-only mode changes
nothing in the art because it is already ASCII.

Measured ink centre of the pictures **before** this work (column of the
average non-space character; the canvas centre is 6.0) and precipitation
centre (rows 3–4), from the real `rawPicture()` data:

| Picture     | WMO codes             | Day/night | Centre X | Rows 3–4 centre | Glyphs below the cloud |
| ----------- | --------------------- | --------- | -------- | --------------- | ---------------------- |
| sun         | 0, 1 (day)            | day       | 6.0      | –               | –                      |
| moon        | 0, 1 (night)          | night     | 5.9      | –               | –                      |
| partlyDay   | 2 (day)               | day       | 5.3      | –               | –                      |
| partlyNight | 2 (night)             | night     | 5.7      | –               | –                      |
| cloudy      | 3                     | both      | 6.0      | –               | –                      |
| fog         | 45, 48                | both      | 6.0      | –               | `_ -`                  |
| drizzle     | 51, 53, 55            | both      | 5.9      | 5.5             | `'`                    |
| rain        | 61, 63, 80, 81        | both      | 5.6      | **4.5**         | `/`                    |
| heavyRain   | 65, 82                | both      | 5.6      | 5.0             | `/`                    |
| sleet       | 56, 57, 66, 67        | both      | 5.6      | **4.5**         | `* /`                  |
| snow        | 71, 73, 77, 85        | both      | 5.9      | 5.5             | `*`                    |
| heavySnow   | 75, 86                | both      | 5.8      | 5.5             | `*`                    |
| thunder     | 95, 96, 99            | both      | 5.8      | 5.3             | **`/ _`** (rain's own) |
| unknown     | anything else, `null` | both      | 6.0      | –               | –                      |

### Individual review

**sun** — keep. Instantly recognisable, symmetric, balanced whitespace. It
is the classic wttr.in/wego sun, which is fine for a sun.

```text
    \   /
     .-.
  - (   ) -
     `-'
    /   \
```

**moon** — redraw. The crescent's two arcs are parallel (`.'` over `.'`,
`|` over `|`), so it reads as a thick ring segment or `((`, not a crescent
that thins to its horns. It occupies columns 3–7 of 13 and looks small next
to the sun.

```text
before              after
     _..   *            _..._
   .' .'              .'  .-'  *
   |  |              (   (
   '. '.   .          '.  '-.  .
     `''                `---'
```

The inner arc now curves less than the outer one (`.-'`, `(`, `'-.` inside
`.'`, `(`, `'.`), so the shape tapers to two horns. Stars stay right, to
balance the left-heavy crescent.

**partlyDay** — redraw. The sun is a three-character `( )` crushed against
the cloud, it has no right-hand ray, and the picture leaves row 4 empty
(centre X 5.3, rows 0–3): it floats high next to every other picture.

```text
before              after
  \ | /                \ | /
 -( ).--.            -  .-.  -
  .-(    ).            ( .--.
 (___.__)__)          .-(    ).
                     (___.__)__)
```

The sun now rises behind the cloud, rays fanned around its centre, and the
cloud sits on the bottom row like every other cloud.

**partlyNight** — redraw. `_.` over `( (` is too small to read as a moon.
The new version reuses the new crescent and lets the cloud cover its lower
half, so day and night are the same composition with different bodies.

```text
before              after
   _.     *             _..._  *
  ( (.--.             .'  .-'
  .-(    ).          (   .--.  .
 (___.__)__)          .-(    ).
                     (___.__)__)
```

**cloudy (Overcast, code 3)** — redraw. It is the same single cloud that
tops every rainy picture, and only the sun separates it from partly
cloudy. Overcast deserves "more cloud": two stacked clouds, the back one
in a darker grey (new colour role `C`).

```text
before              after
                          .--.
     .--.              .-(    ).
  .-(    ).           (_.--._)__)
 (___.__)__)         .-(    ).
                    (___.__)__)
```

**fog** — keep. Three offset rows of `_ - _` read as drifting fog and are
symmetric. Freezing fog (48) could add rime later; not worth a picture now.

**drizzle** — keep. Sparse `'` ticks are clearly lighter than rain.

**rain** — re-centre. The drops sit 1.5 columns left of the cloud (rows 3–4
centre 4.5 vs 6.0), as if blown off-canvas.

```text
before              after
  / / / /              / / / /
 / / / /              / / / /
```

**heavyRain** — redraw. `////////` reads as a hatched bar, not rain, and is
also left of centre. Paired streaks are denser than rain while staying
recognisable as rain:

```text
before              after
  ////////             // // //
 ////////             // // //
```

**sleet (freezing rain and drizzle)** — re-centre only. Mixing `*` and `/`
is the usual convention for "rain that freezes".

**snow, heavySnow** — keep. Three versus five flakes per row is a clear
gradient, and they are already centred within half a column.

**thunder** — redraw. The bolt is `_/` over `/`, which is the rain glyph
with an underscore, so with `--no-color`, `NO_COLOR` or a pipe the storm is
just rain. The zigzag also runs the wrong way (`_/` then `/` does not
connect). The new bolt starts in the cloud base and zigzags `/`, `/_`, `/`;
the storm's rain uses ticks, so `/` belongs to the bolt alone in this
picture.

```text
before              after
     .--.                .--.
  .-(    ).           .-(    ).
 (___.__)__)         (___./_)__)
  /  _/ /              ' /_  '
   / /  /             '   /   '
```

**unknown** — keep. A cloud with a `?` is honest and on-style.

### Missing pictures

- **Showers (80, 81) and snow showers (85)** are convective: bursts with
  sunny or clear breaks. Today they get the same picture as steady rain.
  New: the sun peeking behind the cloud by day, stars around it by night.
  This also gives rainy weather its first day/night difference.

  ```text
  showers, day        showers, night
   \|/ .--.            *   .--.  .
  -( )(    ).           .-(    ). *
   (___.__)__)         (___.__)__)
     / / / /             / / / /
    / / / /             / / / /
  ```

- **Thunderstorm with hail (96, 99)**: the storm with `o` pellets instead
  of rain ticks.

Heavy showers (82) and heavy snow showers (86) keep the heavy pictures: in
those, nobody sees the sun.

### A written visual system

Proposed rules, enforced by tests where possible:

1. **Canvas.** 13 × 5, printable ASCII, a mask of the same shape. No
   Unicode: `⚡`, `☀` and friends are East Asian Width "wide" or
   "ambiguous" in many terminals and would break the alignment that the
   rest of the layout depends on.
2. **One cloud.** Every precipitating picture uses the same cloud on rows
   0–2, and precipitation sits on rows 3–4 centred under it (±0.5 column).
   Sky-only pictures rest on row 4 or are vertically centred.
3. **One glyph per phenomenon.** `'` drizzle and storm rain, `/` rain,
   `//` heavy rain, `*` snow, `* /` freezing rain, `o` hail, the `/`,
   `/_`, `/` zigzag for lightning, `_ -` fog. A picture must be readable
   without colour.
4. **Day and night** where the sky is visible: clear, partly cloudy and
   showers. Overcast, steady rain and fog look the same at night, as they
   do outside.
5. **Colour supports shape.** Roles colour what the glyph already says.
   The new `C` role (darker cloud) adds depth to overcast.

### Colour

The art colours (`renderers/paint.ts:25-34`) are tuned for dark themes.
On a white background the moon `(215,215,230)` and snow `(210,235,255)`
have contrast ratios of about 1.4:1 and 1.2:1 (WCAG relative luminance),
so they almost disappear. **Risk** (P2, §7 F8): a light palette needs a
reliable way to know the background (`COLORFGBG` is set by few terminals;
an OSC 11 query costs a round trip and needs a TTY on stdin), so it is a
setting, not a heuristic.

### Animation

There is none, and it should stay optional and rare (P3, §7 F11). A frame
loop needs cursor hiding and restoring on every exit path (normal end,
Ctrl+C, EPIPE, a second Ctrl+C), must be off for pipes, `--json`,
`--compact`, `CI` and `TERM=dumb`, and must stop by itself so `skycast` is
never a process that keeps running. The current single `write()` per view
is what makes the output safe to pipe and test.

## 5. Confirmed bugs and engineering risks

- **B1 · P0 · Confirmed.** Any settings write deletes keys skycast doesn't know. `config-store.ts:20` promises "older versions can read newer files", but `update()` saves only `city`, `units`, `lang`, `favorites` (`:132-147`). The day a version adds a key (a theme, a format), running an older skycast once (`fav add`, `config set`) erases it. Reproduced: a file with `theme` and `statusFormat` loses both after one `update()`. The test "ignores keys from newer versions" covers reads only.

- **B2 · P0 · Confirmed.** The hourly chart summary prints `Infinity° – -Infinity°` when every temperature in the window is `null` (`hourly.ts:24-28`: `Math.min(...[])`). The schema allows `null` in every series (`schemas.ts:8`). Reproduced with the Istanbul fixture and six `null` temperatures.

- **B3 · P1 · Confirmed.** The temperature sparkline scales to the data's own range (`hourly.ts:69-73`, `sparkline.ts:18-19`), so `hourly Istanbul --hours 12` draws `▅▅▄▄▂▂▄▄██▄▄▁▁▁▁` for 19°–20°. The bars imply big swings that aren't there; the summary text is right but the eye reads the bars first.

- **B4 · P1 · Confirmed.** Thunderstorm art is rain art without colour (§4). Confirmed by glyph analysis: rows 3–4 of `thunder` use only `/` and `_`; `rain` uses `/`.

- **B5 · P1 · Confirmed.** Rain is drawn 1.5 columns left of its cloud; partly cloudy floats one row high (§4 table).

- **B6 · P2 · Confirmed.** English calls precipitation probability "rain" everywhere (`en.ts:88`, `:99`, `:109`): a snow day says "rain 80%". Turkish already uses the neutral "yağış".

- **B7 · P2 · Confirmed.** JSON `meta` drops `staleBecause` (`json.ts:87-91`) although the reason (`offline` or `unavailable`) is known and shown in the text notice. Scripts can't tell "you are offline" from "the API is down".

- **B8 · P3 · Confirmed.** Dead code: `formatPressure` and `isPrecipitation` are only used by tests; `weather.pressure`, `weather.clouds`, `forecast.range`, `compare.title`, `config.keys` and `config.unknownKey` are never read. Pressure and cloud cover are fetched for JSON only.

- **R1 · P2 · Risk.** Offline on a black-holed network (captive portal, dropped packets) waits up to about 25 s before the stale cache is shown: 3 attempts × 8 s timeout plus up to 0.9 s of jitter (`http.ts:126-128`, `:188-201`). DNS failures fail fast, so most offline runs are fine.

- **R2 · P2 · Risk.** Stale-lock takeover can let two writers in (`fs.ts:94-98`). If a crash left a lock older than 10 s, two waiting processes can both `stat` it as stale; the second `rm` then deletes the lock the first just created. Needs a crash plus two concurrent writers within milliseconds. Fix: take over by renaming the stale lock to a unique name first, then `open('wx')`.

- **R3 · P3 · Risk.** The spinner hides the cursor and leaves signal handling to skycast (`spinner.ts:35`). The first Ctrl+C aborts and the `finally` restores it, but a second Ctrl+C before that (`process.once` in `cli.ts:6`) exits with the cursor hidden.

- **R4 · P3 · Risk.** `as never` around `renderJson` (`commands/config.ts:88`, `:106`, `run.ts:153`) bypasses the `Json` type. Harmless today; the type would catch a `Date` or `undefined` array slot slipping into JSON.

Checked and **not** a problem, so nobody re-audits them:

- Hourly axis labels match the downsampled buckets: brute-forced for every
  hour count 1–168 and chart width 4–300, no mismatch.
- `--json` keeps stdout clean, including commander errors and help.
- EPIPE (`| head`) exits quietly (`cli.ts:12-17`, e2e test).
- `.length` is not used for layout widths, except label widths of plain
  ASCII dictionary words (`hourly.ts:22`), which is safe for en/tr.
- Half-hour time zones, polar night, sunsets after midnight and cached
  data read after midnight are handled and tested.
- Startup: `--version` takes about 60 ms against 20 ms for bare `node`
  (macOS, Node 22). Not worth optimising.

## 6. UX and visual-design opportunities

| ID  | Priority | Opportunity                                                                                                                                                                            |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | P1       | Adopt the visual system in §4: redrawn moon, partly cloudy, overcast, heavy rain and thunder; re-centred rain and sleet; new showers (day/night), snow showers (day/night) and hail.   |
| U2  | P1       | Honest sparkline scale: at least 5 °C (9 °F) of range, centred on the data (B3).                                                                                                       |
| U3  | P2       | Condition-aware precipitation words in English: "snow 80%" when the day's code is snow, "precip." otherwise ambiguous (B6). Needs a wording decision.                                  |
| U4  | P2       | Light palette as a setting (`config set theme light`, `SKYCAST_THEME`), not a guess.                                                                                                   |
| U5  | P3       | "Feels like" is printed even when it equals the temperature ("19°C feels like 19°"). Show it only when it differs by 2° or more, or keep it for scanability: a preference, left as is. |
| U6  | P3       | Below 56 columns the picture disappears. A one-row, five-column glyph (`\|/`, `.--.`, `/ /`) could keep a hint of the sky in narrow panes; low value, more snapshots.                  |

## 7. New feature proposals

Selected; each says why it fits skycast. Ideas taken from other tools are
marked _(inspired by …)_; the rest come from the code and data.

**F1. "What changes next" line in `now`** — P1, M.
One line under today's range, built from the next 12–24 hours: "Rain
likely from 15:00 (70%)", "Dry until tomorrow", "Turning colder: 8° lower
tomorrow", "Gusts to 60 km/h this evening". Rules are explicit thresholds
on fetched data (probability ≥ 50% and amount ≥ 0.2 mm, a 5° change, gusts
≥ 50 km/h); nothing is predicted beyond the forecast, and probabilities are
always shown, so it never sounds surer than the data.
_Evidence_: `now` requests `hours: 0` (`commands/weather.ts:71-75`), so the
data is one parameter away; the Istanbul fixture already has "Light
showers" all week while the current code is overcast. _Files_:
`core/` (a pure `summarizeChanges(report)`), `renderers/current.ts`,
i18n. _Maintenance_: medium (wording in two languages). _Risk_: changes the
default `now` output and its snapshots; JSON can expose it as an additive
`insights` array. _Acceptance_: deterministic outputs for fixture
scenarios; never more than one line; absent when nothing crosses a
threshold. (Implemented after review of sample outputs, §12 step 7.)

**F2. Showcase script** — P1, XS. `npm run art [color] [lang]` prints every
WMO code with its picture by day and night from the real `drawPicture`.
_Acceptance_: covers all codes plus unknown; plain at level 0.
(Implemented, §12.)

**F3. Status-line format** — P2, S _(inspired by wttr.in's `format=`)_.
`skycast now --format '{temp} {condition}'` with a fixed set of
placeholders (`{temp}`, `{feels}`, `{condition}`, `{wind}`, `{humidity}`,
`{rain}`, `{place}`, `{icon}` as a one-glyph ASCII mark), no colour unless
`FORCE_COLOR`. The 10-minute cache already makes it cheap for tmux or
starship. _Risk_: low; additive flag. _Acceptance_: unknown placeholders are
a usage error (exit 2); output is one line.

**F4. Precipitation timing from `minutely_15`** — P3, M. Open-Meteo has
15-minute data, native for Central Europe (ICON-D2, AROME) and North
America (HRRR) and interpolated elsewhere (open-meteo.com/en/docs). "Rain
starting around 14:30" is only honest where the data is native, so it must
say when it is not. Validate before building.

**F5. Richer daily data** — P2, S. `snowfall_sum`, `precipitation_hours`,
`wind_gusts_10m_max` and `apparent_temperature_max/min` exist as daily
variables (verified in the docs). Snowfall in cm instead of "4.4 mm" on
snow days and gust maxima are the two that change decisions. Additive in
JSON; one more column with a low drop priority.

**F6. Faster stale fallback** — P2, S (fixes R1). When a usable stale entry
exists, use a 3 s per-attempt timeout and one retry, so offline answers
arrive in about 6 s instead of 25 s. Fresh requests keep today's policy.

**F7. JSON `meta.staleBecause`** — P2, XS (fixes B7). Additive.

**F8. Light theme** — P2, S (U4).

**F9. `cache info`** — P2, S. Entries, total size, oldest and newest age,
TTLs. Helps when people ask "why is it showing old data". `--verbose`
already logs hits.

**F10. Sunrise and sunset scenes** — P3, S. Within 30 minutes of today's
sunrise or sunset (already in the report), draw a sun half under a horizon
line. Small delight, grounded in real data, no new requests.

**F11. Optional animation** — P3, M. `now --animate` on a TTY only: three
or four frames of falling rain or snow for about two seconds, then the
normal static view, so scrollback and pipes are unaffected. Needs the
cursor discipline in §4 and an e2e test that Ctrl+C restores the cursor.
Validate that people want it before building.

**F12. Opt-in sky notes** — P3, S. A playful one-liner ("A proper
umbrella day") chosen from the same thresholds as F1, behind
`config set notes on`. Never on in scripts, JSON or compact output.

Considered and **not** recommended:

- **A TUI framework** (ink, blessed) for an interactive browser: it would
  add the first runtime dependency of substance, a render loop and a new
  test surface, for browsing data that fits on one screen. `forecast` and
  `hourly` with `--days`/`--hours` already cover it.
- **Unicode or emoji art**: width ambiguity (§4, rule 1).
- **More providers now**: the interfaces (`providers/types.ts`) are ready;
  a second provider is worth adding when someone needs one, not before.

## 8. Test and CI assessment

Strong:

- msw fails any unhandled request, and e2e runs the bundle against a local
  fixture server: no test touches the network.
- HTTP failures, timeouts, stalled bodies, retries, `Retry-After`, stale
  fallback and its 24 h limit are tested (`tests/unit/infra/http.test.ts`,
  `tests/integration/settings.test.ts`).
- Settings corruption, salvage, backup on reset and concurrent updates
  (8 parallel writers) are tested.
- Renderers are snapshotted in both languages at several widths, and
  every view is checked to fit 30–160 columns, with and without Unicode and
  colour; colour is checked to change nothing but escape codes.
- CI: Linux, macOS, Windows × Node 20, 22, 24; the packed tarball is
  installed and run on all three OSes.

Gaps worth closing (closed ones in §12):

- Art tests check shape, ASCII and mask, but not the mapping from WMO codes,
  day/night coverage, centring or colour-free distinctness.
- No test for the write path keeping unknown settings keys (B1).
- No test for an hourly window without temperatures (B2) or for the
  sparkline's scale (B3).
- The spinner's cursor restore on cancel is not tested (R3); it needs a
  pseudo-terminal, which isn't worth a new dependency today.

No second test framework is needed.

## 9. Dependency and performance considerations

- The bundle is 218 kB (68 kB gzipped) plus two lazily loaded chunks: the
  place picker (25 kB) and the spinner (6 kB). There are no runtime
  dependencies.
- Startup is about 40 ms above bare Node. The remaining cost is parsing
  the bundle; nothing in the plan changes it materially.
- Nothing proposed here needs a new dependency. Animation (F11) and the
  status format (F3) are a few dozen lines on top of what exists.
- Open-Meteo's free API is for non-commercial use, with limits of 600
  calls a minute, 5,000 an hour and 10,000 a day, under CC BY 4.0
  (open-meteo.com/en/terms). Batching and the cache keep a heavy user
  far below that; a status-bar refresh every minute would still be served
  from the 10-minute cache. Worth one line in the README next to
  "no API key".

## 10. Prioritised roadmap

| Order | ID          | Priority | Effort | What                                                        | Status (§12)     |
| ----- | ----------- | -------- | ------ | ----------------------------------------------------------- | ---------------- |
| 1     | B1          | P0       | S      | Keep unknown settings keys when writing                     | Done             |
| 2     | B2          | P0       | XS     | No `Infinity°` without temperatures                         | Done             |
| 3     | U1, B4, B5  | P1       | M      | Visual system, redrawn and new pictures, code-aware mapping | Done             |
| 4     | F2          | P1       | XS     | `npm run art` showcase                                      | Done             |
| 5     | U2, B3      | P1       | S      | Honest sparkline scale                                      | Done             |
| 6     | –           | P1       | XS     | Regenerate README screenshots                               | Done             |
| 7     | F1          | P1       | M      | "What changes next" line                                    | Done             |
| 8     | B7, F7      | P2       | XS     | `meta.staleBecause` in JSON                                 | Done             |
| 9     | F6, R1      | P2       | S      | Faster stale fallback                                       | Proposed         |
| 10    | B6, U3      | P2       | S      | Condition-aware precipitation words in English              | Needs a decision |
| 11    | F3          | P2       | S      | `--format` for status lines                                 | Proposed         |
| 12    | F5          | P2       | S      | Snowfall and gusts in the daily view                        | Proposed         |
| 13    | R2          | P2       | S      | Race-free stale-lock takeover                               | Proposed         |
| 14    | U4, F8      | P2       | S      | Light palette setting                                       | Proposed         |
| 15    | F9          | P2       | S      | `cache info`                                                | Proposed         |
| 16    | B8, R4      | P3       | XS     | Remove dead strings, type the JSON printers                 | Proposed         |
| 17    | F10–F12, F4 | P3       | S–M    | Sunrise scenes, animation, notes, 15-minute timing          | Validate first   |

## 11. Acceptance criteria and verification commands

For every step:

```sh
npm run lint
npm run typecheck
npm run format:check
npm test                 # unit + integration
npm run build            # bundle + publint
npm run test:e2e         # the bundle as a process
npm run art              # every picture, by day and night (after F2)
node scripts/preview.ts 80 0 en ascii   # every view, ASCII only
```

Specific criteria:

- **B1**: a file with a key skycast doesn't know keeps it, unchanged,
  after `config set`, `config unset` and `fav add`; `config reset` still
  clears every setting except favourites.
- **B2**: an hourly window without temperatures prints a dash, never
  `Infinity`.
- **U1**: every WMO code and `null` maps to a picture; clear, partly cloudy
  and showers differ by day and night; precipitation is centred under the
  cloud within half a column; the thunder pictures' rain never uses the
  bolt's glyphs; hail shows `o`; all pictures stay 13 × 5 printable ASCII
  with a matching mask; layout tests at 30–160 columns still pass.
- **U2**: a series spanning less than 5 °C is drawn in the middle bands;
  larger ranges are unchanged.
- **Screenshots** are regenerated from the real CLI (`npm run
screenshots`), never edited by hand.

## 12. Implementation log

Nothing is committed: every change is in the working tree for review, and
the pre-existing change to `package-lock.json` was left alone.

**Step 1 — B1, settings keep unknown keys.** `config-store.ts` now reads
the file's unknown keys and writes them back on every `update()`
(`config set`, `config unset`, `fav add`, `fav remove`). `reset()` still
clears every setting except favourites, unknown ones included. `version`
stays 1: it records the writer's format and nothing reads it yet. New tests
in `tests/unit/infra/storage.test.ts`; the "keeps keys" test fails on the
old code and passes now.

**Step 2 — B2 and B3, hourly charts.** `hourly.ts` prints a dash when no
temperature is known, and scales the temperature sparkline to at least
5 °C (9 °F) around the data. Seven hourly snapshots changed, and only on
the temperature line: the 18–20° fixture day went from `▁…█` to `▃…▆`,
the 17–20° one from `▁…█` to `▂…▇`. Three new tests in
`tests/unit/renderers/edge-cases.test.ts`.

**Step 3 — B7, `meta.staleBecause`.** Additive JSON field, documented in
the README, tested in `tests/unit/renderers/json.test.ts`.

**Step 4 — U1, B4, B5, the pictures.** As drawn in §4, with one change
found while testing: the distant-cloud colour is a neutral
`rgb(128,128,128)`. The first choice, `rgb(112,118,128)`, became blue at 16
colours, and a darker grey became black (invisible on dark themes). A new
paint test keeps every role off black at 16 colours and the distant cloud
apart from the near one at 256.

- `pictureFor` takes the WMO code instead of the group, so showers (80, 81, 85) and hail (96, 99) get their own pictures. JSON `condition` groups are
  unchanged, so this is invisible to scripts.
- 19 pictures instead of 14. Day/night pairs cover 6 codes (0, 1, 2, 80,
  81, 85) instead of 3.
- The art tests now check: every picture is used by some code and every
  code has one; day and night differ where the sky shows and match where it
  doesn't; precipitation is centred within half a column of the cloud; the
  bolt is one connected zigzag whose glyphs the storm's rain never uses;
  precipitation types differ without colour and heavier means more ink;
  every falling picture uses the shared cloud.
- Six `now` snapshots changed, all because the fixture is overcast and the
  overcast picture is new. No other view changed.

**Step 5 — F2, showcase.** `scripts/art.ts` (`npm run art [0-3] [en|tr]`)
draws every picture next to the codes that use it, from the real
`drawPicture`. Listed in CONTRIBUTING with the picture rules.

**Step 6 — screenshots.** `npm run screenshots` changed `docs/now.svg`,
`docs/now-tr.svg` (new overcast picture) and `docs/hourly.svg`
(sparkline); `forecast.svg` and `compare.svg` came out byte-identical.
`docs/demo.gif` isn't in the repository; the "Demo GIF" workflow can
record it again from the same fixtures.

A changeset (`.changeset/sky-pictures.md`, minor) describes all of the
above for the changelog.

**Verification**, all run after the last change (step 7 included):

| Command                | Result                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | clean                                                                                                                |
| `npm run typecheck`    | clean                                                                                                                |
| `npm run format:check` | clean                                                                                                                |
| `npm test`             | 31 files, 474 tests passed (415 before)                                                                              |
| `npm run coverage`     | 97.08% statements, 87.54% branches, 98.05% functions, 98.25% lines (gates 95/85/95/95)                               |
| `npm run build`        | `dist/cli.mjs` 223.1 kB (69.6 kB gzipped), was 218.1 kB; publint clean                                               |
| `npm run test:e2e`     | 9 tests passed against the new bundle                                                                                |
| Manual                 | `now` at 55 and 56 columns, `--ascii`, `--no-color`, `hourly --compact --ascii`, `--json` against the fixture server |

While another session's worktree sits in `.claude/worktrees/`, `npm run
lint` and `format:check` in this checkout also scan it; the results above
leave that folder out.

**Step 7 — F1, what changes next** (after the sample outputs were
reviewed). `src/core/changes.ts` is a pure `nextChanges(forecast, units)`:
rain, snow, storms or freezing rain starting (a 50% chance and 0.2 mm,
or 0.01 in) or easing (two hours under 50% and 0.1 mm), gusts from
50 km/h (31 mph) that aren't blowing yet, and a high at least 5° (9 °F)
away from today's tomorrow; all within the 12 hours after the current one.
`src/renderers/changes.ts` turns them into one line under today's range,
in English and Turkish.

- One rule changed after the samples: the first version called an hour
  dry when it was unlikely _or_ nearly dry, and the real fixture produced
  "Rain easing from 11:00 (50%)". An hour is now dry only when both agree.
- `now` asks for 13 hours and 2 days (still one request). `now --json`
  keeps its old shape, today without hours, and adds `changes`, each with a
  `kind`, its numbers and a `description` in `--lang`.
- Hourly data gains `wind_gusts_10m` (schema, model, units, hourly JSON
  `windGusts`). It is optional in the schema, so a server or saved answer
  without it still parses.
- Tests: 18 rule tests (`tests/unit/core/changes.test.ts`), three
  integration tests (the request, the stable JSON shape, a fixture with
  rain from 05:00 in text and Turkish JSON) and one e2e test. The existing
  snapshots did not change: nothing crosses a threshold in the 00:30
  fixture, which is also what the README screenshot shows.

**Not done, on purpose:** B6 changes what every English user reads and
needs a wording decision; the P2 and P3 items are proposals with
acceptance criteria above.
