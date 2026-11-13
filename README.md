# Squadron extensions

The catalog of extensions for [Squadron](https://github.com/Jgrasp/squadron), and the kit to write them.

**[Writing an extension: the guide](docs/guide.md)**: quick start, `extension.json`, the Rust API, panels, secrets, permissions, limits and publishing.

- `api/`: the `squadron_extension_api` crate and its WIT contract.
- `examples/hello/`: a complete extension: buttons, a panel, tools for agents, a secret and HTTPS requests.
- `registry.json`: the extensions in the catalog, one entry each.
- `index.json`: what Squadron reads, written by CI. Do not edit it.
- `rejected.json`: the tags CI refused, with the reason, written by CI.

## Publish an extension

1. Put your extension in a public GitHub repository, with its `extension.json`, a `CHANGELOG.md`, a `Cargo.lock` if it has Rust code, and a license.
2. Open a pull request that adds one entry to `registry.json`:

   ```json
   "my-extension": {
     "repository": "https://github.com/you/my-extension"
   }
   ```

   Add `"path"` when `extension.json` is not at the root of the repository.
3. To publish a version, push a tag `v<version>` matching `extension.json`. Every hour, CI builds the newest tag of each repository, publishes the archive as a release of this repository, with its sha256 in `index.json`, and Squadron offers it in Settings › Extensions. A refused tag goes into `rejected.json` with the reason.

Squadron installs what CI built from your tag, never a file from your repository.

## Write an extension

Start from `examples/hello` and follow [the guide](docs/guide.md).
