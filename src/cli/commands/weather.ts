import { CancelledError, UsageError } from '../../core/errors.ts';
import type { Freshness, Location, WeatherReport } from '../../core/models.ts';
import type { ForecastRequest } from '../../providers/types.ts';
import { renderCompare } from '../../renderers/compare.ts';
import {
  renderCurrent,
  renderCurrentCompact,
} from '../../renderers/current.ts';
import { renderForecast } from '../../renderers/forecast.ts';
import { renderHourly } from '../../renderers/hourly.ts';
import { renderJson, reportJson } from '../../renderers/json.ts';
import { describeError, type Failure } from '../errors.ts';
import { locate, resolvePlace, type PlaceInput } from '../locate.ts';
import type { Session } from '../session.ts';

export const MAX_COMPARE = 10;

/** Fetches reports with a spinner and warns about offline (stale) data. */
export async function fetchReports(
  session: Session,
  locations: readonly Location[],
  request: ForecastRequest
): Promise<WeatherReport[]> {
  session.spinner.start();
  try {
    const reports = await session.services.weather.reports(locations, request, {
      units: session.units,
      ...(session.signal && { signal: session.signal }),
    });
    const stale = reports.find(report => report.freshness.stale);
    if (stale) staleNotice(session, stale.freshness);
    return reports;
  } finally {
    session.spinner.stop();
  }
}

function staleNotice(
  session: Session,
  { fetchedAt, staleBecause }: Freshness
): void {
  const { t } = session;
  const minutes = Math.max(
    1,
    Math.round((session.now().getTime() - fetchedAt.getTime()) / 60_000)
  );
  const age =
    minutes < 120
      ? t.cli.minutesAgo(minutes)
      : t.cli.hoursAgo(Math.round(minutes / 60));
  const time = new Intl.DateTimeFormat(t.locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(fetchedAt);
  session.notice(
    staleBecause === 'unavailable'
      ? t.cli.staleService(time, age)
      : t.cli.staleData(time, age)
  );
}

type Fallback = () => Location | undefined;

export async function now(
  session: Session,
  input: PlaceInput,
  fallback?: Fallback
): Promise<void> {
  const location = await locate(session, input, fallback);
  const [report] = await fetchReports(session, [location], {
    current: true,
    days: 1,
    hours: 0,
  });
  if (!report) return;
  if (session.json) session.out(renderJson(reportJson(report, session.t)));
  else if (session.compact)
    session.out(renderCurrentCompact(report, session.render));
  else session.out(renderCurrent(report, session.render));
}

export async function forecast(
  session: Session,
  input: PlaceInput & { days: number },
  fallback?: Fallback
): Promise<void> {
  const location = await locate(session, input, fallback);
  const [report] = await fetchReports(session, [location], {
    current: true,
    days: input.days,
    hours: 0,
  });
  if (!report) return;
  if (session.json) session.out(renderJson(reportJson(report, session.t)));
  else
    session.out(
      renderForecast(report, session.render, { compact: session.compact })
    );
}

export async function hourly(
  session: Session,
  input: PlaceInput & { hours: number },
  fallback?: Fallback
): Promise<void> {
  const location = await locate(session, input, fallback);
  const [report] = await fetchReports(session, [location], {
    current: true,
    days: 1,
    hours: input.hours,
  });
  if (!report) return;
  if (session.json) session.out(renderJson(reportJson(report, session.t)));
  else
    session.out(
      renderHourly(report, session.render, { compact: session.compact })
    );
}

interface CompareOutcome {
  readonly query: string;
  readonly location?: Location;
  readonly error?: unknown;
  readonly failure?: Failure;
}

/**
 * Resolves every place in parallel (prompts still come one at a time),
 * fetches them in one request, and reports places that failed without
 * hiding the ones that worked.
 * @returns the exit code: 0, or the most severe failure's.
 */
export async function compare(
  session: Session,
  queries: readonly string[]
): Promise<number> {
  const { t } = session;
  const places = queries.map(query => query.trim()).filter(Boolean);
  if (places.length < 2) throw new UsageError(t.cli.compareNeedsTwo);
  if (places.length > MAX_COMPARE)
    throw new UsageError(t.cli.compareTooMany(MAX_COMPARE));

  const outcomes: CompareOutcome[] = await Promise.all(
    places.map(async query => {
      try {
        return {
          query,
          location: await resolvePlace(session, query, { countryFlag: false }),
        };
      } catch (error) {
        if (error instanceof CancelledError) throw error;
        return { query, error, failure: describeError(error, t) };
      }
    })
  );
  const found = outcomes.filter(
    (outcome): outcome is CompareOutcome & { location: Location } =>
      outcome.location !== undefined
  );
  const failed = outcomes.filter(outcome => outcome.failure);
  if (found.length === 0) {
    // Nothing to show: fail like a single-place command would.
    throw failed[0]?.error;
  }

  const reports = await fetchReports(
    session,
    found.map(outcome => outcome.location),
    { current: true, days: 1, hours: 0 }
  );
  const byQuery = new Map(
    found.map((outcome, i) => [outcome.query, reports[i]])
  );

  if (session.json) {
    session.out(
      renderJson({
        results: outcomes.map(outcome => {
          const report = byQuery.get(outcome.query);
          return report
            ? { query: outcome.query, ok: true, report: reportJson(report, t) }
            : {
                query: outcome.query,
                ok: false,
                error: {
                  code: outcome.failure?.code ?? 'INTERNAL',
                  message: outcome.failure?.message ?? '',
                },
              };
        }),
      })
    );
  } else {
    for (const outcome of failed) {
      session.notice(
        t.cli.compareFailed(outcome.query, outcome.failure?.message ?? '')
      );
    }
    session.out(
      renderCompare(reports, session.render, { compact: session.compact })
    );
  }
  return Math.max(0, ...failed.map(outcome => outcome.failure?.exitCode ?? 0));
}
