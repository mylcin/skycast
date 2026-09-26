# Changesets

Every pull request that changes behaviour should include a changeset:

```sh
npx changeset
```

Pick the bump (`patch` for fixes, `minor` for features, `major` for breaking
changes) and write one or two sentences for the changelog. When changesets land
on `main`, the release workflow opens a "Version Packages" pull request; merging
it publishes to npm.
