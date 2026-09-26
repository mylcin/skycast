import { isSamePlace } from '../../core/location.ts';
import type { Config } from '../../infra/config-store.ts';
import { renderCompare } from '../../renderers/compare.ts';
import {
  renderCurrent,
  renderCurrentCompact,
} from '../../renderers/current.ts';
import { renderJson, reportJson } from '../../renderers/json.ts';
import type { Session } from '../session.ts';
import { fetchReports } from './weather.ts';

/**
 * Plain `skycast`: the default place in full, then favourites side by side,
 * all from one request. Returns false when there is nothing to show.
 */
export async function home(session: Session, config: Config): Promise<boolean> {
  const { t } = session;
  const city = config.city;
  const favorites = config.favorites.filter(
    favorite => !city || !isSamePlace(favorite, city)
  );
  if (!city && favorites.length === 0) return false;

  const reports = await fetchReports(
    session,
    [...(city ? [city] : []), ...favorites],
    {
      current: true,
      days: 1,
      hours: 0,
    }
  );
  const [first] = reports;
  const cityReport = city ? first : undefined;
  const others = city ? reports.slice(1) : reports;

  if (session.json) {
    session.out(
      renderJson({
        city: cityReport ? reportJson(cityReport, t) : null,
        favorites: others.map(report => reportJson(report, t)),
      })
    );
    return true;
  }
  if (session.compact) {
    session.out(
      reports
        .map(report => renderCurrentCompact(report, session.render))
        .join('')
    );
    return true;
  }
  const parts: string[] = [];
  if (cityReport) {
    parts.push(
      renderCurrent(cityReport, session.render, {
        credits: others.length === 0,
      })
    );
  }
  if (others.length === 1 && !cityReport && first) {
    parts.push(renderCurrent(first, session.render));
  } else if (others.length > 0) {
    parts.push(renderCompare(others, session.render));
  }
  session.out(parts.join('\n'));
  return true;
}
