# lizard-build/cache

A drop-in replacement for [`actions/cache`](https://github.com/actions/cache) for
[Lizard](https://lizard.build) GitHub Actions runners (`runs-on: lizard-<n>vcpu-ubuntu-2404`).

```yaml
- uses: lizard-build/cache@v1
  with:
    path: ~/.npm
    key: npm-${{ hashFiles('package-lock.json') }}
    restore-keys: npm-
```

On a Lizard runner with a lasting cache disk (private repositories), entries are stored on that
disk -- nothing is uploaded or downloaded -- and scoped like GitHub's cache: a run restores from
its own branch or the default branch, and saves into its own branch. Everywhere else it is
GitHub's cache service, exactly like `actions/cache`, with the same inputs and outputs.
