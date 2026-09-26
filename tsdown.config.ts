import { defineConfig } from 'tsdown';
import { thirdPartyLicenses } from './scripts/third-party-licenses.ts';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: 'esm',
  platform: 'node',
  // The output target follows package.json "engines" (Node 20.19).
  outDir: 'dist',
  clean: true,
  dts: false,
  sourcemap: false,
  minify: true,
  // Everything is bundled: the published package has no runtime dependencies,
  // installs in one small tarball and starts faster than an unbundled tree.
  // Runtime libraries are devDependencies for that reason.
  deps: { onlyBundle: false },
  plugins: [thirdPartyLicenses('THIRD_PARTY_LICENSES.md')],
  // publint packs the package itself, which fails inside `npm pack` or
  // `npm publish` (prepack builds too). `npm run build` turns it on.
  publint: false,
});
