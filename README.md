# Squadron extensions

The catalog of extensions for [Squadron](https://github.com/Jgrasp/squadron), and the kit to write them.

- `api/`: the `squadron_extension_api` crate and its WIT contract.
- `examples/hello/`: a complete extension: buttons, a panel, tools for agents, a secret and HTTPS requests.
- `registry.json`: the extensions in the catalog, one entry each.
- `index.json`: what Squadron reads, written by CI. Do not edit it.

## Publish an extension

1. Put your extension in a public GitHub repository, with its `extension.json`, a `Cargo.lock` if it has Rust code, and a license.
2. Open a pull request that adds one entry to `registry.json`:

   ```json
   "my-extension": {
     "repository": "https://github.com/you/my-extension",
     "commit": "<full sha of the commit to publish>",
     "path": ".",
     "version": "1.0.0"
   }
   ```

   `path` is the folder of `extension.json` in the repository. `version` must match `extension.json` at that commit.
3. CI builds the extension from that commit. Once the pull request is reviewed and merged, CI publishes the archive as a release, with its sha256 in `index.json`. Squadron offers it in Settings › Extensions.

To publish an update, open a pull request that changes `commit` and raises `version`.

One pull request adds or updates one extension. Squadron installs what CI built from the reviewed commit, never a file from your repository.

## Write an extension

Depend on the API with `squadron_extension_api = { git = "https://github.com/Jgrasp/squadron-extensions" }`, build with `cargo build --release --target wasm32-wasip2`, and load the folder in Squadron with Settings › Extensions › Add a folder. Start from `examples/hello`.
