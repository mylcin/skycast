import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'rolldown';

interface PackageInfo {
  name: string;
  version: string;
  license: string;
  text: string | null;
}

/** `/x/node_modules/@scope/pkg/dist/a.js` → `/x/node_modules/@scope/pkg`. */
function packageRoot(moduleId: string): string | null {
  const path = moduleId.replaceAll('\\', '/').replace(/^\0/, '');
  const marker = '/node_modules/';
  const at = path.lastIndexOf(marker);
  if (at === -1) return null;
  const rest = path.slice(at + marker.length).split('/');
  const depth = rest[0]?.startsWith('@') ? 2 : 1;
  return path.slice(0, at + marker.length) + rest.slice(0, depth).join('/');
}

function readPackage(root: string): PackageInfo {
  const manifest = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8')
  ) as {
    name: string;
    version: string;
    license?: string;
  };
  const licenseFile = readdirSync(root).find(file =>
    /^(licen[cs]e|copying)(\.|$)/i.test(file)
  );
  return {
    name: manifest.name,
    version: manifest.version,
    license: manifest.license ?? 'UNKNOWN',
    text: licenseFile
      ? readFileSync(join(root, licenseFile), 'utf8').trim()
      : null,
  };
}

/**
 * The CLI is published as one bundle, so the licenses of the code inside it
 * ship next to it. Emits `THIRD_PARTY_LICENSES.md` into the output directory.
 */
export function thirdPartyLicenses(fileName: string): Plugin {
  return {
    name: 'third-party-licenses',
    generateBundle(_options, bundle) {
      const roots = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of output.moduleIds) {
          const root = packageRoot(id);
          if (root) roots.add(root);
        }
      }
      const packages = [...roots]
        .map(readPackage)
        .sort((a, b) => a.name.localeCompare(b.name));

      const sections = packages.map(pkg =>
        [
          `## ${pkg.name}@${pkg.version} (${pkg.license})`,
          '',
          pkg.text ??
            `License: ${pkg.license}. No license file was included in the package.`,
        ].join('\n')
      );
      this.emitFile({
        type: 'asset',
        fileName,
        source: [
          '# Third-party licenses',
          '',
          'The published `skycast` bundle includes code from the packages below.',
          '',
          ...sections.flatMap(section => [section, '']),
        ].join('\n'),
      });
    },
  };
}
