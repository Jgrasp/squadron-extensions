# Writing a Squadron extension

An extension adds things to Squadron without rebuilding it: buttons and menu entries, tools that agents can call, panels beside the conversation, colors. It can be a single `extension.json`, or carry logic written in Rust and compiled to WebAssembly.

- [Quick start](#quick-start)
- [extension.json](#extensionjson)
- [Logic in Rust](#logic-in-rust)
- [Panels](#panels)
- [Secrets and network](#secrets-and-network)
- [Permissions and approval](#permissions-and-approval)
- [Limits](#limits)
- [Test and debug](#test-and-debug)
- [Publish](#publish)

## Quick start

1. Install Rust and the WebAssembly target:

   ```sh
   rustup target add wasm32-wasip2
   ```

2. Copy [`examples/hello`](../examples/hello) to a folder of your own, and depend on the API from git instead of the local path:

   ```toml
   [dependencies]
   squadron_extension_api = { git = "https://github.com/Jgrasp/squadron-extensions" }
   ```

3. Build:

   ```sh
   cargo build --release --target wasm32-wasip2
   ```

4. In Squadron, open Settings › Extensions (also in the Squadron menu), click **Add an extension**, then **A folder on this computer**, and choose your folder.

Squadron reloads the extension within a second each time `extension.json` or the `.wasm` file changes. A local folder comes before an installed extension with the same id, so you can work on a published extension without uninstalling it.

## extension.json

```json
{
  "id": "hello",
  "version": "1.0.0",
  "api": 1,
  "name": { "en": "Hello", "fr": "Hello" },
  "description": { "en": "Example extension written in Rust" },
  "wasm": "target/wasm32-wasip2/release/hello.wasm",
  "contributes": {
    "items": [
      { "slot": "agent.tools", "id": "count", "label": { "en": "Count" }, "icon": "plus", "action": { "run": "count" } },
      { "slot": "agent.tools", "id": "panel", "label": { "en": "Hello panel" }, "icon": "grid", "action": { "panel.open": "main" } }
    ],
    "tools": [{ "name": "clicks", "description": "Tells how many times the user clicked the Count button." }],
    "panels": [{ "id": "main", "title": { "en": "Hello" }, "page": "panel/index.html" }],
    "secrets": [{ "id": "token", "label": { "en": "GitHub token" } }],
    "theme": { "accent": "#4fa3e0" }
  },
  "permissions": { "exec": ["git"], "network": ["api.github.com"] }
}
```

Every problem in the manifest shows under the extension in Settings › Extensions, and an extension with a problem adds nothing.

### Top level

| Field | Required | Rule |
| --- | --- | --- |
| `id` | yes | Lowercase letters, digits and dashes, 40 characters at most. It prefixes everything the extension adds, so it never changes once published. |
| `version` | yes | Like `1.2.3`. |
| `api` | yes | `1`. |
| `name` | yes | A text: `{ "en": "…", "fr": "…" }`. English is required; other languages are optional and fall back to English. |
| `description` | no | A text. |
| `wasm` | no | The path of the compiled component, inside the extension folder. Needed for `run` actions, tools without `command`, and anything in [Logic in Rust](#logic-in-rust). |
| `permissions` | no | See [Permissions and approval](#permissions-and-approval). |

### contributes.items

Buttons and menu entries. Squadron draws them in its own style: an extension chooses the words, the icon and the action, never the look.

| Field | Rule |
| --- | --- |
| `slot` | `agent.tools` (the toolbar of an agent), `agent.menu` (its ⋯ menu, before Archive), `menu.squadron` (the Squadron menu) or `artifact.actions` (the Share menu of the Artifacts panel, after Publish on claude.ai). |
| `id` | Lowercase letters, digits and dashes, unique in the extension. The item's key is `<extension>.<id>`. |
| `label` | A text. |
| `hint` | Optional text, shown under the label in menus and as a tooltip on buttons. |
| `icon` | Optional, one of `editor`, `pull`, `terminal`, `diff`, `kanban`, `remote`, `subagents`, `artifact`, `branch`, `options`, `context`, `turns`, `tasks`, `persona`, `plus`, `copy`, `folder`, `archive`, `stop`, `pin`, `grid`, `jump`, `update`, `mcp`. |
| `action` | Exactly one of the actions below. |

| Action | What a click does |
| --- | --- |
| `{ "terminal.run": "lando logs -f" }` | Runs the command in the agent's terminal and shows it. One line. The user allows the command first. |
| `{ "prompt.insert": "Review this diff…" }` | Adds the text to the message the user is writing to the agent. |
| `{ "url.open": "https://…" }` | Opens the link in the browser. `https://` only. |
| `{ "squadron": "kanban" }` | Runs a Squadron action: `newAgent`, `jump`, `kanban`, `editor`, `terminal`, `diff`, `sidebar`, `find`, `interrupt`, `back`, `forward`, `search`, `projects`, `quit`. |
| `{ "run": "count" }` | Calls `run("count", agent)` in the extension's WebAssembly. Needs `wasm`. |
| `{ "panel.open": "main" }` | Opens or closes one of the extension's panels. |
| `{ "artifact.share": { … } }` | Makes the item a share destination of the open artifact. `artifact.actions` only. See [Sharing an artifact](#sharing-an-artifact). |

`terminal.run`, `prompt.insert` and `panel.open` need an agent, so they cannot go in `menu.squadron`.

Users move and hide extension items like built-in ones, in Settings › Layout or by asking an agent.

### contributes.tools

Tools that every agent started by Squadron can call, through the `squadron-extensions` MCP server. An agent sees the tool `hello_clicks` for the tool `clicks` of the extension `hello`. Tools appear and disappear in running sessions without a restart.

| Field | Rule |
| --- | --- |
| `name` | Lowercase letters, digits and underscores, 40 characters at most. |
| `description` | Tells the agent when to use the tool. Required. |
| `command` | Optional. A shell command run in the agent's folder; the agent receives the last 30,000 characters of its output. Without `command`, Squadron calls `call_tool` in the WebAssembly. |
| `input` | Optional JSON schema of type `object` for the tool's arguments. The WebAssembly receives them as JSON. |

Claude Code asks the user before each call, as for any tool.

### contributes.panels

| Field | Rule |
| --- | --- |
| `id` | Lowercase letters, digits and dashes. |
| `title` | A text. |
| `page` | The path of an `.html` file inside the extension folder. |

See [Panels](#panels).

### contributes.secrets

| Field | Rule |
| --- | --- |
| `id` | Lowercase letters, digits and dashes. |
| `label` | A text. |
| `hint` | Optional text, for example where to create the token. |
| `url` | Optional `https://` link, shown under the field: the `hint` becomes the link, or "Create one" without a `hint`. Opens in the browser. Since Squadron 0.47.0. |

See [Secrets and network](#secrets-and-network).

### contributes.accounts

For a service whose address depends on the user, such as Jira or a self-hosted GitLab, with one or more accounts. Since 1.3.0.

```json
"accounts": {
  "label": { "en": "Jira sites", "fr": "Sites Jira" },
  "fields": [
    { "id": "site", "label": { "en": "Site" }, "kind": "host", "hint": { "en": "company.atlassian.net" } },
    { "id": "email", "label": { "en": "Email" } },
    { "id": "token", "label": { "en": "API token" }, "kind": "secret",
      "hint": { "en": "Create API token (not “with scopes”)" }, "url": "https://id.atlassian.com/manage-profile/security/api-tokens" }
  ]
}
```

| Field | Rule |
| --- | --- |
| `label` | A text, the title of the list in Settings › Extensions. |
| `fields` | At least one field, each id once. |
| `fields[].id` | Lowercase letters, digits and dashes. |
| `fields[].label` | A text, shown as the field's placeholder. |
| `fields[].hint` | Optional text, shown under the field. |
| `fields[].url` | Optional `https://` link, such as the page that creates the token: the `hint` becomes the link, or "Create one" without a `hint`. Opens in the browser. Since Squadron 0.47.0. |
| `fields[].kind` | `text` (the default), `host` or `secret`. One `host` field at most. |

The user adds, edits and removes accounts in the extension's details. Every field is required. A `host` field takes what the user types, such as `https://acme.atlassian.net/jira`, and keeps `acme.atlassian.net`. `secret` fields go to the system keyring; leaving one empty while editing keeps the saved value. Uninstalling the extension removes its accounts and their secrets.

See [Accounts](#accounts).

### contributes.skills

Folders of the extension, each holding a `SKILL.md`, that become skills of every agent, named `<extension>:<folder>`:

```json
"skills": ["skills/share"]
```

The user allows them first, like commands. Squadron copies them into a plugin folder and starts Claude Code with `--plugin-dir`, so they reach the agents started or restarted after the approval. Files beside `SKILL.md` (scripts, templates) come along.

### contributes.theme

Squadron color variables and their values, for example `{ "accent": "#4fa3e0" }`. Values are colors only: `#rgb`, `#rrggbb`, `rgb()`, `rgba()`, `hsl()`, `hsla()`.

## Logic in Rust

The WebAssembly runs inside Squadron, one instance per extension, and keeps running while its panels are closed. Implement only what you need:

```rust
use squadron_extension_api::{Agent, Extension, host, squadron_extension};

struct Hello;

impl Extension for Hello {
    fn on_event(name: String, agent: Option<Agent>, data: String) {
        if name == "agent.done" {
            if let Some(agent) = agent {
                host::notify("Hello", &format!("{} finished its turn.", agent.name));
            }
        }
    }

    fn run(action: String, agent: Option<Agent>) -> Result<(), String> {
        match action.as_str() {
            "greet" => {
                let agent = agent.ok_or("No agent to greet.")?;
                host::insert_prompt(&agent.id, &format!("Hello {}!", agent.name));
                Ok(())
            }
            _ => Err(format!("Unknown action {action}.")),
        }
    }

    fn call_tool(name: String, input: String, agent: Option<Agent>) -> Result<String, String> {
        Err(format!("Unknown tool {name}."))
    }
}

squadron_extension!(Hello);
```

An `Agent` has `id`, `name`, `project` and `dir`, the folder the agent works in (its worktree, or its project). An error returned by `run` shows to the user; an error returned by `call_tool` goes back to the agent.

### Events

`on_event` receives:

| Event | Agent | `data` |
| --- | --- | --- |
| `started` | none | `{}`. Sent once the extension is loaded, also after a reload. |
| `agent.done` | yes | `{}`. The agent finished its turn. |
| `agent.waiting` | yes | `{ "waiting": … }`. The agent waits for the user. |
| `timer` | none | `{}`. The delay of `host::set_timer` is over. Since 1.1.0. |
| `panel.message` | the agent of the panel | `{ "panel": "<id>", "message": … }`. A panel called `squadron.send`. |
| `accounts.changed` | none | `{}`. The user added, edited or removed one of the extension's accounts. Since 1.3.0. |

### Host functions

| Function | What it does |
| --- | --- |
| `host::log(message)` | Writes a line to Squadron's log. |
| `host::notify(title, body)` | Shows a system notification. |
| `host::insert_prompt(agent, text)` | Adds text to the message the user is writing to an agent. |
| `host::set_badge(item, badge)` | Shows a short badge on one of the extension's items, or removes it with `None`. |
| `host::set_label(item, label)` | Replaces an item's label, or restores the manifest's with `None`. |
| `host::state_get(key)`, `host::state_set(key, value)` | The extension's storage, kept across restarts and updates. 1 MB in total. |
| `host::exec(program, args, dir)` | Runs a program listed in `permissions.exec`, without a shell. `dir` defaults to the home folder. Returns `code`, `stdout` and `stderr`. |
| `host::fetch(request)` | Sends an HTTPS request to a host listed in `permissions.network`. See [Secrets and network](#secrets-and-network). |
| `host::panel_post(panel, message)` | Sends a JSON message to one of the extension's open panels. |
| `host::agents()` | The agents open in Squadron, with their status, since when, and whether they are pinned, remote, shown or archivable. Needs `agents: ["read"]`. Since 1.1.0. |
| `host::archive_agent(agent)` | Archives an agent as the user would; refused while it works, waits, is pinned, remote or shown. Needs `agents: ["archive"]`. Since 1.1.0. |
| `host::set_timer(seconds)` | Sends the event `timer` in `seconds`, 10 at least, replacing the one pending. Since 1.1.0. |
| `host::data_dir()` | A folder of the extension's own, made on the first call and kept across restarts and updates, for the files `host::exec` works on. Since 1.2.0. |
| `host::accounts()` | The extension's accounts: their `id` and their `text` and `host` fields, never the secrets. Since 1.3.0. |
| `host::fetch_bytes(request)` | Like `host::fetch`, with the body as bytes, for images and files. Since 1.3.0. |
| `host::download(request, name)` | Like `host::fetch`, writing the body to `name` in the data folder. `name` is a relative path of plain names, with no `..` and no hidden name. Returns `status`, `headers`, `path` and `size`. Since 1.3.0. |
| `host::open_file(path)` | Opens a document or an image of the data folder in the user's app for it. Programs and files outside the data folder are refused. Since 1.3.0. |
| `host::exec_input(program, args, dir, input)` | Like `host::exec`, writing `input` to the program's standard input. Since 1.3.0. |

The WebAssembly has no access to files, the network or environment variables other than through these functions.

## Sharing an artifact

An item of `artifact.actions` with the action `artifact.share` is a destination of the Share menu:

```json
{
  "slot": "artifact.actions",
  "id": "team",
  "label": { "en": "Share with the team" },
  "hint": { "en": "Google web app for your Workspace domain" },
  "action": {
    "artifact.share": {
      "confirm": { "en": "“{artifact.title}” becomes a web app for your team." },
      "lines": ["Google Apps Script · clasp"],
      "shared": { "en": "Shared with the team" },
      "share": "Use the hello:share skill to share the artifact {artifact.id} in {artifact.dir}, working in {extension.data}/sites/{agent.id}-{artifact.id}. Then call publish_artifact with id {artifact.id}, destination {destination} and its link.",
      "update": { "tool": "update" },
      "unshare": { "tool": "unshare" },
      "delete": { "en": "Also delete the project" },
      "deleteHint": { "en": "What the team entered is deleted with it." }
    }
  }
}
```

| Field | Rule |
| --- | --- |
| `confirm` | Required text, shown before sharing. |
| `lines` | Optional one-line strings shown in the confirmation, like what the share needs. |
| `shared` | Optional text, the title once shared. The label otherwise. |
| `share` | Required step. |
| `update` | Optional step, offered once the artifact changed since it was shared. |
| `unshare` | Optional step behind Stop sharing. |
| `delete`, `deleteHint` | Optional texts of a checkbox in the Stop sharing confirmation. |

A step is either:

- **a prompt**. Squadron starts an agent of its own in the project of the artifact's agent, with the project's default settings, and sends it the prompt; it sends the next prompts of the same artifact and destination to that agent while it is not archived. The agent ends with `publish_artifact` and `id`, `destination` and `link` (any `https://` address), or an empty `link` to clear it;
- **`{ "tool": "<name>" }`**. Squadron calls `call_tool(name, input, agent)` in the WebAssembly, with `agent` the artifact's agent and `input` the JSON `{ "verb", "destination", "artifact": { "id", "title", "dir", "entry" }, "link", "delete", "data" }`. The tool returns the link for `share` and `update`; its error shows to the user. The tool needs no entry in `contributes.tools`, so agents never see it.

Prompts and `confirm` take `{artifact.id}`, `{artifact.title}`, `{artifact.dir}` (the artifact's folder), `{artifact.entry}` (its page), `{agent}` (the agent's name), `{agent.id}`, `{destination}` (the item's key), `{extension.data}` (the extension's data folder), `{link}` and `{delete}` (`true` when the box is ticked).

Squadron keeps one link per destination and artifact, with the time of the share. The menu then gives Open, Copy link, Update when the artifact changed and `update` exists, and Stop sharing when `unshare` exists. A band shows under the panel's header while a step runs. When the extension still waits for the user's approval, the first click asks for it.

## Panels

A panel is an HTML page of the extension, shown beside the conversation like the terminal or the diff. The user chooses where it goes (beside, below, full screen) and Squadron remembers it.

The page runs in an isolated frame:

- it can use its own HTML, CSS, JavaScript, images and fonts from the extension folder;
- it cannot reach the network, Squadron's window, Tauri, pop-ups (`alert`, `confirm`) or `localStorage`;
- keep its state in the WebAssembly with `host::state_set`.

Squadron adds a small script at the top of every page, which gives `window.squadron`:

```js
squadron.on((message) => { /* a value sent by host::panel_post */ })
squadron.send({ type: 'ready' }) // the WebAssembly receives panel.message
```

A message sent before the page has loaded is lost. Let the page speak first: send `ready` when it loads, and answer it from `on_event`.

```rust
fn on_event(name: String, _agent: Option<Agent>, data: String) {
    if name == "panel.message" && data.contains(r#""type":"ready""#) {
        host::panel_post("main", r#"{"count":3}"#);
    }
}
```

### Theme

Squadron sets these CSS variables in the page, at load and each time its theme changes: `--bg-main`, `--surface-1`, `--surface-2`, `--surface-3`, `--border`, `--border-focus`, `--text`, `--text-strong`, `--text-muted`, `--text-dim`, `--ink`, `--accent`, `--accent-link`, `--ok-text`, `--err-text`, `--sans`, `--mono`. This list is part of the API and will not shrink.

For a page that looks like Squadron with no effort, add its stylesheet. It styles the background, text, links, headings, `button`, `button.primary`, inputs and `.muted`:

```html
<link rel="stylesheet" href="/_squadron/kit.css" />
```

## Secrets and network

Declare the secrets in `contributes.secrets`. The user fills them in the extension's details in Settings › Extensions, and Squadron keeps them in the system keyring. Neither the WebAssembly nor the panel can read them.

To use a secret in a request, write `{{id}}` in a header value. Squadron replaces it, and replaces the secret with `[secret]` if it comes back in the response:

```rust
use squadron_extension_api::Request;

let answer = host::fetch(&Request {
    method: "GET".into(),
    url: "https://api.github.com/user".into(),
    headers: vec![
        ("Authorization".into(), "Bearer {{token}}".into()),
        ("User-Agent".into(), "my-extension".into()),
    ],
    body: None,
})?;
```

`host::fetch`:

- only `https://`, only to a host listed in `permissions.network` or the `host` field of one of the extension's accounts;
- redirects to a host that is not allowed are not followed: you get the 3xx answer. A redirect to another host drops the `Authorization` header;
- `{{id}}` only works in header values, not in the URL or the body;
- an unset secret makes the request fail with a message asking the user to set it.

### Accounts

`{{<account>.<field>}}` in a header value gives a field of one of the extension's accounts, secret or not, `<account>` being the `id` that `host::accounts` returns. The fields of an account that has a `host` field only go to that host: a request elsewhere fails.

`{{base64:<a>:<b>}}` gives the base64 of the values of `a` and `b` joined by `:`, which HTTP Basic auth wants. Each part is a secret id or an account field:

```rust
use squadron_extension_api::{Request, host};

for account in host::accounts() {
    let site = account.fields.iter().find(|(k, _)| k == "site").map(|(_, v)| v.clone()).unwrap_or_default();
    let me = host::fetch(&Request {
        method: "GET".into(),
        url: format!("https://{site}/rest/api/3/myself"),
        headers: vec![(
            "Authorization".into(),
            format!("Basic {{{{base64:{0}.email:{0}.token}}}}", account.id),
        )],
        body: None,
    })?;
}
```

Secrets, alone or encoded, become `[secret]` if they come back in a response; the other fields, such as the email, stay as they are.

### Files and images

`host::fetch_bytes` keeps the body as bytes: send an image to a panel as a `data:` URL, which the panel's policy allows. `host::download` writes a larger file, 200 MB at most, to the data folder, and `host::open_file` opens it for the user.

A tool with a `command` receives each secret that is set as an environment variable `SQUADRON_<ID>`, uppercase with dashes turned into underscores: `SQUADRON_TOKEN` for `token`, `SQUADRON_API_KEY` for `api-key`. `host::exec` and `terminal.run` never receive secrets.

## Permissions and approval

```json
"permissions": { "exec": ["git"], "network": ["api.github.com"] }
```

- `exec`: program names that `host::exec` and `host::exec_input` may run, with any arguments. `claude` runs the Claude Code set up in Squadron, not the one on the `PATH`.
- `network`: exact host names that `host::fetch`, `host::fetch_bytes` and `host::download` may reach. The `host` field of an account needs no entry: the user typed it.
- `agents`: `read` for `host::agents`, `archive` for `host::archive_agent`. Since 1.1.0.

When an extension arrives or changes, Squadron shows the user what it asks for: the programs of `exec`, the hosts of `network`, the access to agents, every `terminal.run` command, every tool `command` and the skills of `contributes.skills`. Until the user allows them, its buttons ask first, its tools stay hidden from agents, `host::exec` and `host::fetch` fail. Any new or changed command or host asks again.

Allowed commands run with the user's rights. Ask only for what you need, and say why in your description.

## Limits

| Limit | Value |
| --- | --- |
| Computation per call | 5 billion units of fuel; the call stops beyond it. |
| Memory | 64 MB. |
| State | 1 MB. |
| `host::exec`, tool commands | 120 s; tool commands return the last 30,000 characters. |
| `host::fetch`, `host::fetch_bytes` | 30 s, 8 MB of response. |
| `host::download` | 120 s, 200 MB. |
| Answer to a click or a tool | 150 s. |
| Manifest | 256 KB. |
| Published archive | 50 MB, 2,000 files. |

An extension that crashes or passes a limit is restarted with a fresh instance, keeping its state, and its error shows in Settings › Extensions.

An extension built against a newer API than the installed Squadron fails to load. Keep the API version you build against in step with the Squadron versions you support.

## Test and debug

- Load the folder with **A folder on this computer**; each build reloads it.
- Errors in the manifest, a missing `.wasm` file and crashes show on the extension's card (badge **Error**) and in its details.
- `host::log` writes to Squadron's log.
- An item's action error (from `run`) shows in a dialog.
- To try a tool, ask an agent to call `<extension>_<tool>`; agents already running see it too.

## Publish

Extensions are published from their own public GitHub repository, listed in [`registry.json`](../registry.json):

1. Your extension needs, at the commit you publish: its `extension.json`, a `Cargo.lock` if it has Rust code (CI builds with `--locked`), and a license.
2. Open a pull request that adds one entry:

   ```json
   "my-extension": {
     "repository": "https://github.com/you/my-extension",
     "commit": "<full sha of the commit to publish>",
     "path": ".",
     "version": "1.0.0"
   }
   ```

   `path` is the folder of `extension.json` in the repository, and `version` must match it at that commit.
3. CI checks the entry and builds the extension from that commit. Once the pull request is reviewed and merged, CI publishes the archive as a release of this repository and adds it to `index.json`, with its sha256.

The archive holds `extension.json`, the `.wasm` file and every file of the folder that is not Rust source (`src/`, `Cargo.toml`, `Cargo.lock`, `build.rs`). Squadron installs exactly what CI built from the reviewed commit.

To publish an update, open a pull request that changes `commit` and raises `version`. Users get a notification and update in one click; a new command or host asks for their approval again.

One pull request adds or updates one extension.

### Changelog

Squadron shows what changed in a version in **What's new**, on its update window, from a `CHANGELOG.md` next to `extension.json`.

```markdown
## 0.2.0 · 2026-11-10

- Options in Settings: what the panel lists, and ticket chips in messages.
- The `sprint` tool lists subtasks under their parent.

## 0.1.0 · 2026-11-02

- First version: the open sprint next to your agents.
```

- One `## <version> · <date>` section per published version, newest first. The version is the one of `extension.json`, the date is `YYYY-MM-DD`, the day you open the pull request.
- Under it, one `- ` line per change, written for the user: what they can do now, or what works differently. No commit hashes, no refactors, nothing they can't see. Inline code and links are fine; no images, HTML or deeper headings.
- At most 20 lines per version and 300 characters per line.
- English in `CHANGELOG.md`. A translation goes in `CHANGELOG.<language>.md` (`CHANGELOG.fr.md`), with the same sections; Squadron falls back on English for a version the translation lacks.
- A pull request that raises `version` needs the section of that version, with at least one line, at the commit it publishes: CI refuses it otherwise.

CI copies the 20 newest sections into `index.json`, as `changelog: [{ "version", "date", "notes": { "en": [...], "fr": [...] } }]`. Squadron shows the versions between the one installed and the new one.

### Your own source

Users can add other sources than the official one, in **Settings › Extensions › Discover › Add a marketplace**. A source is a GitHub repository organized like this one: fork it, enable GitHub Actions in the fork, empty `registry.json` and `index.json` (`{ "api": 1, "extensions": [] }`), and publish your extensions the same way. Squadron reads `index.json` from the `main` branch and downloads archives only from the releases of that repository. Its extensions show as **Imported** and are not reviewed for Squadron; an extension updates only from the source it was installed from.
