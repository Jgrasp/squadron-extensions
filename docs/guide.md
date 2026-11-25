# Writing a Squadron extension

An extension adds things to Squadron without rebuilding it: buttons and menu entries, tools that agents can call, panels beside the conversation, colors. It can be a single `extension.json`, or carry logic written in Rust and compiled to WebAssembly.

- [Quick start](#quick-start)
- [extension.json](#extensionjson)
- [Logic in Rust](#logic-in-rust)
- [Panels](#panels)
- [Opening New agent](#opening-new-agent)
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
| `squadron` | no | The Squadron versions the extension runs on: `">=0.45.0"`, or `">=0.45.0 <0.50.0"` when it stops working from a version on. Discover and updates offer the newest version that fits the user's Squadron; an installed version that does not fit is turned off until the user updates one or the other. |
| `name` | yes | A text: `{ "en": "…", "fr": "…" }`. English is required; other languages are optional and fall back to English. |
| `description` | no | A text. |
| `logo` | no | The path of an `.svg` file inside the extension folder, not hidden, 64 KB at most. Squadron shows it as an image, so its scripts never run, on the extension's page, in Settings, Manage, updates and About, and on items with `"icon": "logo"`. The registry copies it into `index.json`, so the catalog shows it before install. Without it, the first letter of the name on a color. A logo that is missing, too large or not SVG puts the extension in error. Since Squadron 0.47.0. |
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
| `icon` | Optional, one of `editor`, `pull`, `terminal`, `diff`, `kanban`, `remote`, `subagents`, `artifact`, `branch`, `options`, `context`, `turns`, `tasks`, `persona`, `plus`, `copy`, `folder`, `archive`, `stop`, `pin`, `grid`, `jump`, `update`, `mcp`, or `logo` for the extension's `logo` in color (since Squadron 0.47.0). |
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
| `window` | Optional, Squadron 0.52 and later. `"floating"`, `"maximized"` or `"fullscreen"` opens the panel in its own window instead of beside the conversation. A floating window is resizable and comes back with its last size and position. |

See [Panels](#panels).

### contributes.secrets

| Field | Rule |
| --- | --- |
| `id` | Lowercase letters, digits and dashes. |
| `label` | A text. |
| `hint` | Optional text, for example where to create the token. |
| `url` | Optional `https://` link, shown under the field: the `hint` becomes the link, or "Create one" without a `hint`. Opens in the browser. Since Squadron 0.46.2. |

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
| `fields[].url` | Optional `https://` link, such as the page that creates the token: the `hint` becomes the link, or "Create one" without a `hint`. Opens in the browser. Since Squadron 0.46.2. |
| `fields[].kind` | `text` (the default), `host`, `secret` or `captured`. One `host` field at most. `captured` is a secret the user never types: the extension fills it from a service's answer with `host::fetch_capture`, such as an OAuth refresh token. Since 1.16.0. |
| `fields[].copy` | Optional list of one-line strings, each once, such as the scopes a token needs. Squadron shows each as a button under the field's hint; a click copies it and the button reads "Copied" for 1.5 s. Plain strings, not texts. Since Squadron 0.54.0. |
| `check` | Optional, `true` to test accounts before they are saved and show in the list whether each one works. Needs `wasm` and `check_account`. Since Squadron 0.49.0. See [Testing an account](#testing-an-account). |

The user adds, edits and removes accounts in the extension's details, or in the form `host::open_account` opens. Every field is required but `captured` ones. A `host` field takes what the user types, such as `https://acme.atlassian.net/jira`, and keeps `acme.atlassian.net`. `secret` fields go to the system keyring; leaving one empty while editing keeps the saved value. A `captured` field shows as a status line, "Received from the service and saved in the system keyring" or "Filled in by the extension after you sign in"; saving the form keeps it. Removing an account removes its secrets, captured ones included; uninstalling the extension removes its accounts and their secrets.

See [Accounts](#accounts).

### contributes.settings

Options that Squadron draws on the extension's page in Settings › Extensions, and a settings page of the extension's own under them. Since 1.4.0.

```json
"settings": {
  "options": [
    { "id": "sprint", "label": { "en": "Tickets in the panel" }, "hint": { "en": "…" }, "kind": "select", "default": "open",
      "choices": [{ "value": "open", "label": { "en": "Open sprint" } }, { "value": "next", "label": { "en": "Open and next sprints" } }] },
    { "id": "chips", "label": { "en": "Ticket keys in messages" }, "kind": "toggle", "default": true },
    { "id": "limit", "label": { "en": "Tickets per search" }, "kind": "number", "min": 1, "max": 100, "default": 50 },
    { "id": "folder", "label": { "en": "Download folder" }, "kind": "text" }
  ],
  "page": "settings/index.html",
  "title": { "en": "Sharing" }
}
```

| Field | Rule |
| --- | --- |
| `options[].id` | Lowercase letters, digits and dashes, each id once. |
| `options[].label`, `options[].hint` | A text, and an optional text under it. |
| `options[].kind` | `toggle`, `select` (with `choices`, each a `value` and a `label`), `text` (one line) or `number` (optional `min` and `max`). |
| `options[].default` | Optional, of the kind of the option. Without it: off, `min` or 0, the first choice, an empty text. |
| `page` | Optional, the path of an `.html` file inside the extension folder, shown under the options while the extension is on. |
| `title` | Optional text above the page. |

Squadron keeps the values the user changed, checks them against the manifest, and falls back on the default when one no longer fits after an update. `host::options()` returns all of them as a JSON object by id, defaults included, and the event `options.changed` carries the same object each time the user changes one. The settings page works like a panel: `squadron.send` sends `settings.message` to the WebAssembly, which answers with `host::settings_post`. It and the panels also get `squadron.options` and `squadron.setOption(id, value)`, which need no WebAssembly.

### contributes.forge

Makes the extension the provider of pull requests and pipelines for the projects whose remote it recognizes. Needs `wasm` and `accounts`. Since 1.8.0. See [Forge providers](#forge-providers).

```json
"forge": {
  "remotes": ["^github\\.com/(?<owner>[A-Za-z0-9_.-]+)/(?<name>[A-Za-z0-9_.-]+)$"],
  "links": ["https?://(?:www\\.)?github\\.com/(?<owner>[A-Za-z0-9_.-]+)/(?<name>[A-Za-z0-9_.-]+)/pull/(?<number>[0-9]+)"],
  "calls": ["pull", "numbered", "lists", "remarks", "me", "reply", "resolve", "post", "merge", "update", "create", "runs"],
  "verdicts": ["approve", "request_changes", "comment"]
}
```

| Field | Rule |
| --- | --- |
| `remotes` | Regexes matched, anchored, against the origin remote as `host/path`: lowercase host, no scheme, user or port, no `.git` nor trailing `/`. `git@github.com:Acme/Shop.git` gives `github.com/Acme/Shop`. |
| `links` | Regexes for a pull request's web address, unanchored, with a `number` group. Squadron uses them for the chips of links in conversations and to find the pull request an agent opened. |
| `{account}` | In `remotes` and `links`, the `host` fields of the extension's accounts, for self-hosted servers. |
| Groups | Named groups only. The repo is the value of every group but `number`, in order, joined by `/`. Use one pattern per form and ASCII classes, no `\w`, no lookaround: the same pattern runs in Rust and in JavaScript. |
| `calls` | The calls the extension answers. Squadron hides what needs a call that is not listed. |
| `verdicts` | Optional, all three by default: the verdicts a review may post. |

The forge's name and logo are the extension's. The registry copies `remotes` into `index.json`, so that Squadron offers to install the extension for a project whose remote no installed extension recognizes.

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

Without `exec` nor `agents: ["read"]` in `permissions`, the `Agent` that events, actions and tools receive has an empty `dir`, and its `project` is the project's opaque id, the one `host::projects` gives, instead of its folder. Since 1.7.0.

`check_account` tests an account the user adds or saved: see [Testing an account](#testing-an-account). Since 1.6.0.

`forge` answers Squadron's pull request and pipeline calls: see [Forge providers](#forge-providers). Since 1.8.0.

### Events

`on_event` receives:

| Event | Agent | `data` |
| --- | --- | --- |
| `started` | none | `{}`. Sent once the extension is loaded, also after a reload. |
| `agent.done` | yes | `{}`. The agent finished its turn. |
| `agent.waiting` | yes | `{ "waiting": …, "kind": … }`. The agent waits for the user; `kind` is `permission`, `question`, or `null` when Squadron cannot tell. Without `exec` nor `agents: ["read"]`, only `{ "kind": "permission" }` or `{ "kind": "question" }`, `{}` otherwise. |
| `timer` | none | `{}`. The delay of `host::set_timer` is over. Since 1.1.0. |
| `panel.message` | the agent of the panel | `{ "panel": "<id>", "message": … }`. A panel called `squadron.send`. |
| `accounts.changed` | none | `{}`. The user added, edited or removed one of the extension's accounts. Since 1.3.0. |
| `options.changed` | none | The values of `host::options()`. The user changed one of the extension's options. Since 1.4.0. |
| `settings.message` | none | `{ "message": … }`. The extension's settings page called `squadron.send`. Since 1.4.0. |
| `new-agent.regenerate` | none | `{ "draft": "<id>", "choices": ["<id>", …] }`. The user clicked Regenerate, or changed the checkboxes of a draft without touching its first message. See [Opening New agent](#opening-new-agent). Since 1.5.0. |
| `new-agent.started` | the agent that started | `{ "draft": "<id>" }`. The user started the agent of a draft. Since 1.5.0. |
| `new-agent.closed` | none | `{ "draft": "<id>" }`. The window closed without starting an agent, or the user unlinked it. Since 1.5.0. |
| `panel.closed` | none | `{ "panel": "<id>" }`. One of the extension's panels closed. Since 1.7.0. |
| `account.form` | none | `{ "form": "<id>", "account": "<id>" }` once the user saved the form of `host::open_account`, or `{ "form": "<id>", "error": "…" }` once they cancelled it, closed Settings, or another `host::open_account` of the extension replaced it. Since 1.16.0. |
| `agent.status` | none | The `AgentActivity` of an agent that changed, as `host::all_agents` gives it, with `unread` since 1.8.0. Needs `agents: ["activity"]`. Since 1.7.0. |
| `agent.started` | none | The `AgentActivity` of an agent that started; `by` is the agent that started it, none when the user did. Needs `agents: ["activity"]`. Since 1.7.0. |
| `agent.archived` | none | The `AgentActivity` of an agent that was archived. Needs `agents: ["activity"]`. Since 1.7.0. |
| `agent.message` | none | `{ "from": "<id>", "to": "<id>", "count": 1 }`. An agent sent messages to another; `count` is how many since the last event. Needs `agents: ["activity"]`. Since 1.7.0. |
| `project.added`, `project.changed`, `project.archived` | none | The `Project`, as `host::projects` gives it. Needs `projects: ["read"]`. Since 1.7.0. |
| `groups.changed` | none | `{ "groups": [ … ] }`, every `Group` as `host::groups` gives it. Needs `projects: ["read"]`. Since 1.7.0. |
| `usage` | none | The `ClaudeUsage`, as `host::usage` gives it. Needs `usage: ["read"]`. Since 1.7.0. |

The events of `agents: ["activity"]`, `projects: ["read"]` and `usage: ["read"]` come at most once a second, with the latest state of each agent or project only. Their `data` is JSON with the field names in snake case: `week_agents`, `five_hour`, `seven_day`, `resets_at`. In them, an agent's `project`, a project's `id` and `group`, and a group's `id` and `parent` are opaque ids, whatever the permissions.

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
| `host::fetch_many(&[Request]) -> Vec<Result<Response, String>>` | Sends several requests up to 8 at a time and answers in their order, so that a forge call such as `lists` reads the pull requests within its 150 s. Each request follows the rules of `host::fetch`: `permissions.network` or an account's `host`, `{{…}}` and `{{base64:…}}` in headers, secrets scrubbed from what comes back, redirects, 30 s and 8 MB. A refused or failed request fails alone, the others still answer. A request still waiting when the call's 150 s run out fails, and one already sent stops by then. The answers together go into the instance's 64 MB: split a batch whose bodies could pass that. Since 1.12.0, so declare `"squadron": ">=0.56.0"`: an extension that imports it does not load in an older Squadron. |
| `host::panel_post(panel, message)` | Sends a JSON message to one of the extension's open panels. |
| `host::panel_open(panel)` | Opens one of the extension's panels, or brings it to the front when it is already open: a panel with `window` in its own window, another beside the agent on screen. Errors on an unknown panel id, and on a panel without `window` while no agent is on screen. Works from the `started` event at launch: Squadron queues it until its window is ready. Since 1.9.0, so declare `"squadron": ">=0.54.0"`. |
| `host::agents()` | The agents open in Squadron, with their status, since when, and whether they are pinned, remote, shown or archivable. Needs `agents: ["read"]`. Since 1.1.0. |
| `host::archive_agent(agent)` | Archives an agent as the user would; refused while it works, waits, is pinned, remote or shown. Needs `agents: ["archive"]`. Since 1.1.0. |
| `host::set_timer(seconds)` | Sends the event `timer` in `seconds`, 10 at least, replacing the one pending. Since 1.1.0. |
| `host::data_dir()` | A folder of the extension's own, made on the first call and kept across restarts and updates, for the files `host::exec` works on. Since 1.2.0. |
| `host::accounts()` | The extension's accounts: their `id` and their `text` and `host` fields, never the secrets. Since 1.3.0. |
| `host::fetch_bytes(request)` | Like `host::fetch`, with the body as bytes, for images and files. Since 1.3.0. |
| `host::download(request, name)` | Like `host::fetch`, writing the body to `name` in the data folder. `name` is a relative path of plain names, with no `..` and no hidden name. Returns `status`, `headers`, `path` and `size`. Since 1.3.0. |
| `host::open_file(path)` | Opens a document or an image of the data folder in the user's app for it. Programs and files outside the data folder are refused. Since 1.3.0. |
| `host::exec_input(program, args, dir, input)` | Like `host::exec`, writing `input` to the program's standard input. Since 1.3.0. Since 1.16.0, a program declared with `"secrets": true` gets `{{…}}` resolved in `input`, and only there. See [Secrets for a program](#secrets-for-a-program). |
| `host::options()` | The values of the options of `contributes.settings`, as a JSON object by id, defaults included. Since 1.4.0. |
| `host::settings_post(message)` | Sends a JSON message to the extension's settings page while it is open. Since 1.4.0. |
| `host::open_new_agent(agent, draft)` | Opens the New agent window in the project of `agent`, filled from `draft`, and returns the id of the draft. See [Opening New agent](#opening-new-agent). Since 1.5.0. |
| `host::update_new_agent(id, draft)` | Fills the open draft `id`, leaving the name, first message and Done when the user edited. Since 1.5.0. |
| `host::projects()` | The projects of Squadron, archived ones included, without their folder: `id`, `name`, `color` (`#rrggbb`, when the user gave one), `group`, `archived`, `active` (when one of its agents last changed, 0 without agents), `week_agents` (distinct agents that changed over the last 7 days) and `agents` (all its agents, archived ones included). Needs `projects: ["read"]`. Since 1.7.0. |
| `host::groups()` | The groups of projects: `id`, `name` and `parent`, the group it is nested in. Needs `projects: ["read"]`. Since 1.7.0. |
| `host::all_agents()` | Every agent, archived ones included, and what it is doing: `id`, `project`, `name` (empty until Squadron names it; text anyone can set, so show it as text), `status`, `waiting` (`permission` or `question`), `tool` (the name of the tool it runs, never its input), `error` (`crash` or `api` while `error`, `mcp` when one of its MCP servers failed to connect), `by` (the agent that started it, none when the user did), `archived` and `since`. Never its folder, conversation, prompts, tool inputs or outputs, or costs. Needs `agents: ["activity"]`. Since 1.7.0. |
| `host::unread_agents()` | The ids of the live agents the user has not read since their last turn, as the dot of the agent list shows them. Needs `agents: ["activity"]`. Since 1.8.0. |
| `host::usage()` | Claude's 5-hour and weekly limits, each a `utilization` from 0 to 1 and `resets_at`, none until Squadron has read them, and the state of its API: `ok`, `overloaded` (with the `retries` Claude Code made so far), `outage`, `offline` or `signed_out`, and `since`, when `api` last changed. Fails while Squadron does not know them yet. Needs `usage: ["read"]`. Since 1.7.0. |
| `host::show_agent(agent)` | Brings an agent to the front in Squadron; an archived one opens read only in the archive of its project. Works only within 2 s of a `squadron.send` from one of the extension's panels, while that panel is on screen, holds the focus and has the pointer over it; from a panel window, it brings Squadron's window to the front. Once a second at most, otherwise it fails with "show-agent waits a second between two calls.". It never acts on the agent. Needs `agents: ["show"]`. Since 1.7.0. |
| `host::set_agent_chips(&agent_id, json)` | Puts the extension's chips on the row of an agent in the agent list, in place of those it put before; `[]` removes them. `json` is a list of 8 at most, each `{ "key", "title" }` with optional `url` (`https://` only, opened on click), `tone` (`ok`, `err` or `info`, a coloured dot before the key) and `logo` (`false` leaves the extension's logo out, decided chip by chip). The key is trimmed and cut at 40 characters, the title at 200. No permission needed; an extension only touches its own chips, and they stay with the agent across restarts. A call with bad JSON, more than 8 chips, a chip without `key` or `title`, or an unknown agent is dropped, with a warning in the main window's console. The row shows one chip at a time, then `+N` listing them all; the chips of every extension take turns, the draft `link` first, and a chip with `tone` `err` stops the turn on itself. The user sets the transition, the interval and whether every row turns in Settings › Preferences › Agent list. Since 1.15.0. |
| `host::fetch_capture(request, account, fields)` | Like `host::fetch`, and on a 2xx answer whose body is a JSON object, saves the string at each top-level key of `fields` in the system keyring as a `captured` field of `account`, and gives the WebAssembly `[secret]` in its place. `fields` pairs a JSON key with a field id: `[("refresh_token", "refresh-token")]`. See [Tokens from a service](#tokens-from-a-service). Since 1.16.0. |
| `host::open_account(account, values)` | Opens Settings on the extension's page with its account form unfolded: `None` to add an account, `Some(id)` to edit one. `values` is a JSON object of `text` and `host` fields to prefill, `{}` for none. Returns the form's id at once; the event `account.form` tells how it ended. See [Opening the account form](#opening-the-account-form). Since 1.16.0. |

`host::projects`, `host::groups` and `host::all_agents` give a project's `id`, a group's `id` and `parent`, and an agent's `project` as opaque ids: the same across restarts, different for each extension, never the folder. An `Agent` that an event, an action or a tool receives with `exec` or `agents: ["read"]` carries the folder as `project` instead. Agent ids are the same everywhere.

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

With `"window"`, the panel opens in its own window: floating, maximized or full screen. `panel.open` opens it, or brings it to the front, from any agent. Without a click, the WebAssembly opens it with `host::panel_open`. The page, its bridge and its theme stay the same. The window does not reload when the user shows another agent, `panel.message` carries the agent shown in the main window, `panel.closed` comes when the user closes the window, and a minimized window sets `document.hidden`.

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

## Opening New agent

From a button, a panel or a tool, the extension can open Squadron's New agent window in the project of an agent, already filled, then fill it more while it works, for example while Haiku writes the first message from a ticket. Since 1.5.0, so declare `"squadron": ">=0.47.0"`.

```rust
let draft = host::open_new_agent(&agent.id, r#"{
  "name": "RING-128 Card payment: 3-D Secure on iOS",
  "link": { "key": "RING-128", "title": "Card payment: 3-D Secure on iOS", "url": "https://acme.atlassian.net/browse/RING-128" },
  "context": "<ticket source=\"jira\" key=\"RING-128\">…</ticket>",
  "choices": { "label": { "en": "Context given to Haiku and to the agent" }, "items": [{ "id": "comments", "label": "Comments", "on": true }] },
  "status": { "state": "running", "text": { "en": "Haiku is preparing the instructions…" } }
}"#);
let (text, goal) = brief(&context)?;
host::update_new_agent(&draft, &json!({ "text": text, "goal": goal, "status": { "state": "done" } }).to_string());
```

Every key of a draft is optional:

| Key | What Squadron does with it |
| --- | --- |
| `name` | The name of the agent. |
| `text` | The first message. |
| `goal` | Done when. |
| `context` | Added after the first message when the agent starts, never shown in the window. A `<ticket>` block there shows as a chip in the conversation. |
| `link` | `{ "key", "title", "url" }`, at the top of the window with the extension's logo. The key opens `url` (`https://` only) in the browser, ✕ unlinks. The agent the draft starts keeps the link, unless the user unlinked: its row in the agent list shows the logo and the key, the title on hover, and a click opens `url`. An agent restored from the archive keeps it, a fork does not. Since Squadron 0.55.0. Since 1.15.0 it also takes `tone` and `logo` as `host::set_agent_chips` does, and becomes the agent's first chip. |
| `choices` | `{ "label", "items": [{ "id", "label", "on" }] }`, checkboxes folded under the link. |
| `status` | `{ "state": "running" \| "done" \| "error", "text" }`, a band above the first message, with Regenerate once it is not running. |

Labels and texts are strings or `{ "en": "…", "fr": "…" }`. `null` removes the link, the checkboxes or the band.

- One draft at a time: opening another closes the first.
- `host::update_new_agent` never replaces a name, first message or Done when the user edited; `context`, `link`, `choices` and `status` are always replaced. It does nothing once the window is closed or the user unlinked, so it never changes the link of an agent that already started.
- Regenerate empties the first message, puts the band back to running and sends `new-agent.regenerate` with the ids that are checked: answer it with `host::update_new_agent`.
- `new-agent.started` comes with the agent that started, to show it on the ticket; `new-agent.closed` when the user cancels or unlinks.
- The rest of the window is Squadron's as usual: model, effort, advisor, permission mode, agent type, files.

The Hello example opens one from **New agent from Hello** in the agent menu.

## Forge providers

An extension with `contributes.forge` answers Squadron's calls for the pull requests and pipelines of the projects it recognizes. Since API 1.8.0.

```rust
use squadron_extension_api::forge::{self, Input, NoArgs, NumberArgs, Person, Remark};
use squadron_extension_api::Extension;

impl Extension for GitHub {
    fn forge(call: String, input: String) -> Result<String, String> {
        match call.as_str() {
            "me" => {
                let _: Input<NoArgs> = forge::input(&input)?;
                forge::answer(&Person { name: "ada".into(), avatar: String::new() })
            }
            "remarks" => {
                let asked: Input<NumberArgs> = forge::input(&input)?;
                let found: Vec<Remark> = remarks(&asked.repo, asked.args.number)?;
                forge::answer(&found)
            }
            _ => Err(forge::unsupported(&call)),
        }
    }
}
```

`input` is `{ "host": "github.com", "repo": "acme/shop", "groups": { "owner": "acme", "name": "shop" }, "args": { … } }`. Squadron reads git itself and never passes the remote, which can hold a token. The extension picks the account among `host::accounts()`.

| Call | `args` | Answer |
| --- | --- | --- |
| `pull` | `BranchArgs` | The `Pull` of the branch, the most recently updated in any state, or `null` |
| `numbered` | `NumberArgs` | `Numbered`: the `Pull`, with `additions`, `deletions` and `files` when known |
| `lists` | `NoArgs` | `Lists`: `review`, `mine` and `others`, open pull requests, 50 each at most |
| `remarks` | `NumberArgs` | `Vec<Remark>`, oldest first |
| `me` | `NoArgs` | `Person` |
| `reply` | `ReplyArgs` | `null`. `to` and `kind` are those of the thread's first remark. |
| `resolve` | `ResolveArgs` | `null`, once the thread of `to` is resolved, or reopened when `resolved` is false. `to` and `kind` are those of the thread's first remark. |
| `post` | `PostArgs` | `Posted`: how many drafts went through, whether the summary did, and why it stopped |
| `merge` | `MergeArgs` | `null`. `method` is `merge`, `squash` or `rebase`, `None` keeps the repository default. `delete_branch` says whether to delete the source branch where the forge lets you set it per pull request, `None` keeps the forge's own setting. Since 1.13.0; before, `NumberArgs`. |
| `update` | `UpdateArgs` | `null` |
| `create` | `CreateArgs` | The `Pull` created. `branch` is already pushed; `base`, `title`, `description` (Markdown) and `draft` describe the pull request to open. `draft` is best effort: the returned `Pull.draft` says what the forge created. Since 1.14.0. |
| `runs` | `NoArgs` | `Vec<Run>`, newest first, 20 at most |

The types are in `squadron_extension_api::forge`, every field with a default, so an answer built with an older crate still reads. Texts take these values:

- `Pull.state`: `open`, `merged`, `declined`, `closed`, `superseded`.
- `Pull.checks`: `passing`, `failing`, `pending`, or none.
- `Pull.merge_methods`: the methods allowed for this pull request, among `merge`, `squash` and `rebase`; empty when unknown. Since 1.13.0.
- `Pull.delete_branch`: whether merging will delete the source branch, as the forge will do it; none when unknown. `Pull.delete_branch_settable`: true when the forge honours `MergeArgs.delete_branch`, false when it decides alone, from a repository setting for instance. `Pull.branch_protected`: the source branch is protected, so the forge keeps it. Since 1.13.0.
- `Pull.reviewed` and `Reviewer.verdict`: `approved`, `changes_requested`, `commented`, and `waiting` for a reviewer.
- `Remark.kind`: `line` or `general`. `Remark.id` is a string of your own, unique in the pull request.
- `Remark.resolved`: on the first remark of a thread the host can resolve, whether it is; `None` elsewhere. `Remark.commit`: the commit a line remark was written on, when the host says.
- `PostArgs.verdict`: `approve`, `request_changes` or `comment`.
- `Run.status`: `success`, `failure`, `cancelled`, `skipped`, `running`, `queued`.
- `Run.pull`: the number of the pull request the run checks, since API 1.11.0. Squadron shows `#N` and the pull request's title on the run's card and counts the run under "PR checks". Left empty, a run still counts as a check when its `event` is `pull_request`, `pull_request_target`, `merge_request_event`, `pullRequest` or `pullrequest`, or its `branch` is the head of an open pull request. An older Squadron ignores it.
- Dates in RFC 3339.

When an agent pushed its branch without a pull request and the project's forge declares `create`, the agent's chip row offers **Open a pull request**. An extension that does not declare `create` shows nothing new.

An extension built on a crate older than 1.13.0 reads the `merge` args as `NumberArgs` and merges as before; Squadron then offers neither a method nor a branch choice. The Squadron that brings API 1.13.0 no longer deletes the remote branch after a merge, whatever crate the extension uses: the forge does, as these `Pull` fields tell.

An error is a plain text, or `forge::failure(code, title, detail)` with texts as strings or `{ "en": "…", "fr": "…" }`. `forge::no_account(title)` (code `account`) leads the user to Settings › Pull requests. `forge::unsupported(call)` (code `unsupported`) hides what needs the call.

Calls run on up to 4 instances of the extension at once, so that the pull request views, the pipelines and the agents' pull requests do not wait for each other:

- These instances get no events, not even `started`, and their `host::set_timer` does nothing. Events, actions, tools and `check_account` stay on the main instance.
- They share `host::state_get` and `host::state_set`, never memory: a cache kept in a `static` lives in one instance only. Reading then writing one key is not atomic across instances, so keep a key per thing rather than a counter that several calls bump.
- A call identical to one in flight gets its answer instead of running again.

## Secrets and network

**The rule: a secret never goes through the WebAssembly, a panel, the extension's state, a file, the arguments or the environment of a program.** Passwords, API tokens, OAuth refresh and access tokens and client secrets live in the system keyring, as a secret of `contributes.secrets` or a `secret` or `captured` field of an account. The extension writes a placeholder, `{{id}}` or `{{<account>.<field>}}`, where the value has to go, and Squadron puts it there at the last moment:

- in a header of `host::fetch` and its siblings;
- in a form body (`application/x-www-form-urlencoded`), since 1.16.0;
- on the standard input of a program declared with `"secrets": true`, since 1.16.0.

Never ask for a secret in a panel, never keep one with `host::state_set`, never write a pgpass, `.netrc` or config file holding one, never pass one in `args` or `env`: they are readable by every process of the user, and the WebAssembly and panels can leak what they hold. Neither the WebAssembly nor a panel can read a secret. Two exceptions remain, both outside the extension's own keeping: the single-use OAuth authorization code goes from a panel to the WebAssembly (see [Tokens from a service](#tokens-from-a-service)), and a tool `command` gets the secrets of `contributes.secrets` in its environment (see [Files and images](#files-and-images)), which new code should not use.

Declare the secrets in `contributes.secrets`. The user fills them in the extension's details in Settings › Extensions, and Squadron keeps them in the system keyring.

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
- `{{id}}` works in header values, and since 1.16.0 in a body sent with `Content-Type: application/x-www-form-urlencoded` (any case, `; charset=…` allowed), where the value is percent-encoded. Never in the URL, nor in another body, which goes as it is;
- an unset secret makes the request fail with a message asking the user to set it.

### Accounts

`{{<account>.<field>}}` in a header value or a form body gives a field of one of the extension's accounts, secret or not, `<account>` being the `id` that `host::accounts` returns. The fields of an account that has a `host` field only go to that host: a request elsewhere fails.

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

Secrets, alone, in base64 or percent-encoded, become `[secret]` if they come back in a response; the other fields, such as the email, stay as they are.

### Testing an account

With `"check": true` in `contributes.accounts`, the extension's details test an account before saving it: the main button of the form is **Test the connection**, and **Add the account** or **Save** only shows once the test worked. Each account of the list shows whether it works, checked when the page opens and again with ↻; Settings marks the extension in red when one fails. Since API 1.6.0, so declare `"squadron": ">=0.49.0"`.

Squadron calls `check_account` with the account, saved or not:

```rust
use squadron_extension_api::{Account, Extension, Request, host};

impl Extension for Jira {
    fn check_account(account: Account) -> Result<String, String> {
        let site = account.fields.iter().find(|(k, _)| k == "site").map(|(_, v)| v.clone()).unwrap_or_default();
        let me = host::fetch(&Request {
            method: "GET".into(),
            url: format!("https://{site}/rest/api/3/myself"),
            headers: vec![("Authorization".into(), format!("Basic {{{{base64:{0}.email:{0}.token}}}}", account.id))],
            body: None,
        })?;
        match me.status {
            200 => Ok(r#"{ "text": { "en": "Connected as Ada", "fr": "Connectée en tant qu’Ada" }, "detail": { "en": "12 projects", "fr": "12 projets" } }"#.into()),
            401 => Err(r#"{ "title": { "en": "Jira refused this email and token" }, "detail": { "en": "The token may be wrong, expired or revoked." }, "field": "token" }"#.into()),
            status => Err(format!("Jira answered {status}.")),
        }
    }
}
```

- An account the user has not saved yet gets an id of its own for the time of the call. While `check_account` runs, `{{<account.id>.<field>}}` gives the values the user typed, secrets included, and its `host` field is reachable. The secrets stay in Squadron's memory, never written and never passed to the WebAssembly. Editing an account keeps its id, and a secret left empty is the saved one.
- `host::accounts()` does not list an account that is not saved.
- `Ok` means it works: `text` (shown in green, "Connected as …") and an optional `detail` ("12 projects"). `Err` means it does not: `title`, an optional `detail`, and `field`, the id of the field to fix, which the form marks. Texts are strings or `{ "en": "…", "fr": "…" }`. A plain string works too: it becomes `text` or `title`, so `host::fetch(…)?` gives a readable failure. An `"ok"` key, when present, decides.
- Squadron checks the fields itself first, as it does when saving: an empty field or a site that is not an address fails on that field without calling the extension.
- A check answers within 150 s like a click, and runs after the calls already waiting.

The Hello example tests its GitHub accounts.

### Secrets for a program

A program that needs a password, such as a database client, gets it on its standard input, never in its arguments, its environment or a file. Since API 1.16.0, so declare `"squadron": ">=0.64.0"`.

1. Keep each connection as an account, the password as a `secret` field. The server is a `text` field, not `host`: the fields of an account with a `host` field only go to HTTPS requests to that host, never to a program.

   ```json
   "accounts": {
     "label": { "en": "Databases", "fr": "Bases de données" },
     "fields": [
       { "id": "server", "label": { "en": "Server" }, "hint": { "en": "db.example.com:5432" } },
       { "id": "database", "label": { "en": "Database" } },
       { "id": "user", "label": { "en": "User" } },
       { "id": "password", "label": { "en": "Password" }, "kind": "secret" }
     ]
   }
   ```

2. Declare the program with `"secrets": true` in `permissions.exec`:

   ```json
   "permissions": { "exec": [{ "program": "java", "secrets": true }] }
   ```

3. Write the placeholders in `input`. Squadron resolves `{{<account>.<field>}}` and `{{id}}` there, and nowhere else:

   ```rust
   use serde_json::json;
   use squadron_extension_api::host;

   let field = |name: &str| account.fields.iter().find(|(k, _)| k == name).map(|(_, v)| v.clone()).unwrap_or_default();
   let input = json!({
       "server": field("server"),
       "database": field("database"),
       "user": field("user"),
       "password_base64": format!("{{{{base64:{}.password}}}}", account.id),
       "query": "select count(*) from orders",
   })
   .to_string();
   let out = host::exec_input("java", &["-jar".into(), "query.jar".into()], Some(&host::data_dir()), &input)?;
   ```

   The program reads the JSON from its standard input and decodes `password_base64`. Squadron writes the value as it is, without JSON escaping: a password holding `"`, `\` or a line break would break the JSON, so pass it through `{{base64:…}}`, which takes a single part too.

- Every secret value used, raw or in base64, comes back as `[secret]` in `stdout` and `stderr`. Text fields, such as `user`, come back as they are.
- In the input of such a program, every `{{…}}` must name a secret or a field of an account, or the call fails. A field of an account with a `host` field fails it too.
- A program declared without `"secrets": true` gets `input` as it is, and the call fails as soon as a `{{…}}` in it names a secret or a field.
- `args` and `env` are never resolved. A client that only takes its password from an argument, an environment variable such as `PGPASSWORD`, or a file such as `~/.pgpass` cannot be used: run a program that reads it from its standard input instead.

### Tokens from a service

A token that a service hands back, such as an OAuth refresh token, goes straight to the system keyring as a `captured` field of an account: the WebAssembly only ever sees `[secret]`, and uses it later as `{{<account>.<field>}}`. Since API 1.16.0, so declare `"squadron": ">=0.64.0"`.

```json
"secrets": [{ "id": "client-secret", "label": { "en": "OAuth client secret" } }],
"accounts": {
  "label": { "en": "Calendars", "fr": "Agendas" },
  "fields": [
    { "id": "email", "label": { "en": "Email" } },
    { "id": "refresh-token", "label": { "en": "Google access", "fr": "Accès Google" }, "kind": "captured" },
    { "id": "access-token", "label": { "en": "Session", "fr": "Session" }, "kind": "captured" }
  ]
},
"permissions": { "network": ["oauth2.googleapis.com", "www.googleapis.com"] }
```

No `host` field here: an account with one captures only from that host, and its fields go only there.

1. **The account first.** `host::fetch_capture` needs a saved account: open the form with `host::open_account` (see [Opening the account form](#opening-the-account-form)) and keep the id that `account.form` gives. An account id is not a secret, it can go in the state.
2. **The authorization code.** The user signs in on the provider's consent page, from an item with `url.open` for instance. Squadron does not receive the redirect, and Google no longer shows the code on its own page: the user copies `code` from the address the provider redirects to, a page you host that shows it, or the address bar of a loopback redirect that nothing answers. They paste it into a panel, which sends it with `squadron.send`. The code is single use and short lived, and nothing without the client secret, which stays in the keyring.
3. **The exchange**, with a form body and `host::fetch_capture`:

   ```rust
   use squadron_extension_api::{Request, host};

   fn exchange(account: &str, code: &str) -> Result<(), String> {
       let code: String = form_urlencoded::byte_serialize(code.as_bytes()).collect();
       let request = Request {
           method: "POST".into(),
           url: "https://oauth2.googleapis.com/token".into(),
           headers: vec![("Content-Type".into(), "application/x-www-form-urlencoded".into())],
           body: Some(format!(
               "grant_type=authorization_code&code={code}&client_id={CLIENT_ID}&client_secret={{{{client-secret}}}}&redirect_uri={REDIRECT}"
           )),
       };
       let answer = host::fetch_capture(
           &request,
           account,
           &[
               ("refresh_token".into(), "refresh-token".into()),
               ("access_token".into(), "access-token".into()),
           ],
       )?;
       match answer.status {
           200 => Ok(()),
           status => Err(format!("Google answered {status}.")),
       }
   }
   ```

   Squadron percent-encodes the values it puts in a form body, not the rest: encode what the WebAssembly writes there itself, such as `code`, here with the `form_urlencoded` crate.
4. **The refresh**, the same way. Capture `access_token` again, or the new one would reach the WebAssembly in clear: a plain `host::fetch` only hides the secrets it sent. Capture `refresh_token` too, for a provider that rotates it; a key missing from the answer leaves the field as it was.

   ```rust
   fn refresh(account: &str) -> Result<(), String> {
       let request = Request {
           method: "POST".into(),
           url: "https://oauth2.googleapis.com/token".into(),
           headers: vec![("Content-Type".into(), "application/x-www-form-urlencoded".into())],
           body: Some(format!(
               "grant_type=refresh_token&refresh_token={{{{{account}.refresh-token}}}}&client_id={CLIENT_ID}&client_secret={{{{client-secret}}}}"
           )),
       };
       let answer = host::fetch_capture(
           &request,
           account,
           &[
               ("access_token".into(), "access-token".into()),
               ("refresh_token".into(), "refresh-token".into()),
           ],
       )?;
       match answer.status {
           200 => Ok(()),
           status => Err(format!("Google answered {status}: sign in again.")),
       }
   }
   ```

5. **The calls**: `("Authorization".into(), format!("Bearer {{{{{account}.access-token}}}}"))`. On a 401, call `refresh` and send again.

- `fields` pairs a top-level key of the JSON answer with a field id. Each field must be of kind `captured`, and the account must exist; otherwise the call fails before sending.
- Only a 2xx answer whose body is a JSON object is captured, each listed key that holds a non-empty string. The answer the WebAssembly gets has `[secret]` there, and wherever else the value appears, headers included.
- The form shows a `captured` field as received or not yet; the user never types it, and saving the form keeps it. Removing the account removes it.
- Never keep a token in the state, a file or a panel, and never send one to the WebAssembly in a `panel.message`.
- `host::accounts()` does not tell whether a `captured` field is set: a request that uses it fails until it is, with "The field … is not set." on a saved account and "The account … has no field …" on one not saved yet. With `"check": true`, an account is tested before it is saved, so before any capture: let `check_account` answer `Ok` ("Sign in after saving") on that error, or the form never saves.

### Opening the account form

`host::open_account` opens Settings on the extension's page with its account form unfolded, so a panel or a button can lead the user to add an account, or fix the one that failed. Since API 1.16.0, so declare `"squadron": ">=0.64.0"`.

```rust
fn run(action: String, _agent: Option<Agent>) -> Result<(), String> {
    match action.as_str() {
        "sign-in" => host::open_account(None, r#"{"email": "ada@example.com"}"#).map(|_| ()),
        _ => Err(format!("Unknown action {action}.")),
    }
}

fn on_event(name: String, _agent: Option<Agent>, data: String) {
    let data: serde_json::Value = serde_json::from_str(&data).unwrap_or_default();
    match name.as_str() {
        "account.form" => {
            if let Some(account) = data["account"].as_str() {
                host::state_set("signing-in", Some(account));
                let _ = host::panel_open("main");
            }
        }
        "panel.message" if data["message"]["type"] == "ready" => {
            if host::state_get("signing-in").is_some() {
                host::panel_post("main", r#"{"type":"paste-code"}"#);
            }
        }
        _ => {}
    }
}
```

The form is in Settings when it closes: open the panel, and let it ask once it is loaded, as in [Panels](#panels).

- `account`: `None` to add an account, `Some(id)` to edit that one. An unknown id fails.
- `values`: a JSON object of `text` and `host` fields to prefill. A `secret` or `captured` field fails: the user types secrets, the service sends captured ones.
- The call answers at once with the form's id. The answer comes later in `account.form`: `{ "form", "account" }` once saved, `{ "form", "error" }` once the user cancelled, closed Settings, or another `host::open_account` of the extension replaced the form. The extension keeps serving its events, tools and panels meanwhile; never wait for the answer in a loop.
- An extension without `contributes.accounts` gets an error.

### Files and images

`host::fetch_bytes` keeps the body as bytes: send an image to a panel as a `data:` URL, which the panel's policy allows. `host::download` writes a larger file, 200 MB at most, to the data folder, and `host::open_file` opens it for the user.

A tool with a `command` receives each secret of `contributes.secrets` that is set as an environment variable `SQUADRON_<ID>`, uppercase with dashes turned into underscores: `SQUADRON_TOKEN` for `token`, `SQUADRON_API_KEY` for `api-key`. That is the one place a secret still goes through an environment, and the command's output goes to the agent as it is: do not use it for new code, write the tool in the WebAssembly with `host::fetch` or `host::exec_input`. `host::exec` and `terminal.run` never receive secrets; `host::exec_input` receives them on the standard input only, see [Secrets for a program](#secrets-for-a-program).

## Permissions and approval

```json
"permissions": { "exec": ["git"], "network": ["api.github.com"] }
```

- `exec`: program names that `host::exec` and `host::exec_input` may run, with any arguments. `claude` runs the Claude Code set up in Squadron, not the one on the `PATH`. Since 1.16.0, an entry can be `{ "program": "java", "secrets": true }`: the program may also receive secrets on its standard input through `host::exec_input`. Plain names and objects mix in the list; a Squadron older than 0.64.0 refuses the object form.
- `network`: exact host names that `host::fetch`, `host::fetch_many`, `host::fetch_bytes` and `host::download` may reach. The `host` field of an account needs no entry: the user typed it.
- `agents`: `read` for `host::agents`, `archive` for `host::archive_agent`. Since 1.1.0. `activity` for `host::all_agents`, `host::unread_agents` and the `agent.status`, `agent.started`, `agent.archived` and `agent.message` events; `show` for `host::show_agent`. Since 1.7.0. `read` also gives the `Agent` of events, actions and tools its folder as `dir` and `project`, as `exec` does.
- `projects`: `read` for `host::projects`, `host::groups` and the `project.added`, `project.changed`, `project.archived` and `groups.changed` events. Since 1.7.0.
- `usage`: `read` for `host::usage` and the `usage` event. Since 1.7.0.

When an extension arrives or changes, Squadron shows the user what it asks for: the programs of `exec`, and for those with `"secrets": true` that they receive secrets on their standard input, the hosts of `network`, the access to agents, every `terminal.run` command, every tool `command` and the skills of `contributes.skills`. Until the user allows them, its buttons ask first, its tools stay hidden from agents, `host::exec` and `host::fetch` fail. Any new or changed command or host asks again.

Allowed commands run with the user's rights. Ask only for what you need, and say why in your description.

## Limits

| Limit | Value |
| --- | --- |
| Computation per call | 5 billion units of fuel; the call stops beyond it. |
| Memory | 64 MB. |
| State | 1 MB. |
| `host::exec`, tool commands | 120 s; tool commands return the last 30,000 characters. |
| `host::fetch`, `host::fetch_bytes` | 30 s, 8 MB of response. |
| `host::fetch_many` | 8 requests at a time, each 30 s and 8 MB. |
| `host::download` | 120 s, 200 MB. |
| Answer to a click, a tool or a forge call | 150 s. |
| Forge calls at once | 4, each on its own instance with its own 64 MB. |
| Manifest | 256 KB. |
| Published archive | 50 MB, 2,000 files. |

An extension that crashes or passes a limit is restarted with a fresh instance, keeping its state, and its error shows in Settings › Extensions.

An extension built against a newer API than the installed Squadron fails to load. Declare the oldest Squadron that has the API you use in `squadron`:

| API | Squadron |
| --- | --- |
| 1.1.0 | `>=0.39.0` |
| 1.2.0 | `>=0.44.0` |
| 1.3.0 | `>=0.45.0` |
| 1.4.0 | `>=0.46.0` |
| 1.5.0 | `>=0.47.0` |
| 1.6.0 | `>=0.49.0` |
| 1.7.0 | `>=0.52.0` |
| 1.8.0 | `>=0.53.0` |
| 1.9.0 | `>=0.54.0` |
| 1.10.0 | `>=0.54.0` |
| 1.11.0 | `>=0.54.0` |
| 1.12.0 | `>=0.56.0` |
| 1.13.0 | `>=0.56.0` |
| 1.14.0 | `>=0.56.0` |
| 1.15.0 | `>=0.59.0` |
| 1.16.0 | `>=0.64.0` |

Squadron reads `squadron` since 0.46.0; older versions ignore it.

## Test and debug

- Load the folder with **A folder on this computer**; each build reloads it.
- Errors in the manifest, a missing `.wasm` file and crashes show on the extension's card (badge **Error**) and in its details.
- `host::log` writes to Squadron's log.
- An item's action error (from `run`) shows in a dialog.
- To try a tool, ask an agent to call `<extension>_<tool>`; agents already running see it too.

## Publish

Extensions are published from their own public GitHub repository, listed once in [`registry.json`](../registry.json):

1. Your extension needs: its `extension.json`, a `CHANGELOG.md`, a `Cargo.lock` if it has Rust code (CI builds with `--locked`), and a license.
2. Open a pull request that adds one entry:

   ```json
   "my-extension": {
     "repository": "https://github.com/you/my-extension"
   }
   ```

   Add `"path": "<folder>"` when `extension.json` is not at the root of the repository.
3. Once the pull request is reviewed and merged, the extension is listed: its versions come from your repository.

To publish a version, raise `version` in `extension.json`, add its section to `CHANGELOG.md`, commit, and push a tag `v<version>` (`v1.2.0`). Your repository's own workflow ([below](#publishing-as-soon-as-you-tag)) builds the tag and publishes it as a release of your repository, a minute later. Squadron reads `releases/latest/download/catalog.json` of every repository listed in `registry.json`, then the archive from the same release.

Before that workflow, and for Squadron versions that predate it, CI of this repository takes the newest tag of each listed repository every hour, builds it the same way, publishes the archive as a release of this repository and adds it to `index.json`. It keeps running; a tag your repository already released is built there too.

The workflow checks that `extension.json` has the registry's id and the tag's version, a valid `squadron` range and a changelog section for the version, builds the Rust code, then fails the run with the reason when a check does not pass. Nothing is released then; fix the commit and move the tag, or push the next one.

The archive holds `extension.json`, the `.wasm` file and every file of the folder that is not Rust source (`src/`, `Cargo.toml`, `Cargo.lock`, `build.rs`). Squadron installs exactly what CI built from the tagged commit. Users get a notification and update in one click; a new command or host asks for their approval again.

`catalog.json` keeps the 10 newest versions of the extension under `versions`, newest first, so that a Squadron too old for the newest one still gets the newest it can run. The first release of a repository starts from the versions `index.json` already lists for its id.

### Publishing as soon as you tag

Copy [`examples/release-caller.yml`](../examples/release-caller.yml) to `.github/workflows/release.yml` in your extension's repository:

```yaml
name: Release

on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      tag:
        description: Existing tag to release
        required: true

jobs:
  release:
    permissions:
      contents: write
    uses: Jgrasp/squadron-extensions/.github/workflows/release.yml@main
```

No secret: the workflow publishes with the repository's own `GITHUB_TOKEN`, which `permissions: contents: write` allows. It replaces the `registry.yml` dispatch and the `SQUADRON_REGISTRY_TOKEN` secret, which you can delete.

Run it from the Actions tab with a `tag` to release a tag your repository already has without raising its version. Running it again for a tag already released replaces its two files.

The release holds `<id>-<version>.tar.gz` and `catalog.json`, and is marked latest. An extension in a folder of a larger repository (`path` in `registry.json`, tags `<id>/v*`), like `hello` here, has no release of its own to read: it keeps going through the hourly run and `index.json`.

An extension hosted on GitLab or Bitbucket can't use that workflow, which runs on GitHub Actions only. Its own CI publishes the same two files, `<id>-<version>.tar.gz` and `catalog.json` (the shape of an `index.json` entry), at the URLs Squadron reads: `<repo>/-/releases/permalink/latest/downloads/catalog.json` on GitLab, `<repo>/downloads/catalog.json` on Bitbucket. The `archive` in `catalog.json` must sit under the repository: `<repo>/-/releases/<tag>/downloads/<file>` on GitLab (not a `/api/v4/.../packages/generic/...` URL), `<repo>/downloads/<file>` on Bitbucket. Users add it with **From a repository**; the official registry lists GitHub repositories only.

### Changelog

Squadron shows what changed in a version in **What's new**, on its update window, from a `CHANGELOG.md` next to `extension.json`.

```markdown
## 0.2.0 · 2026-11-10

- Options in Settings: what the panel lists, and ticket chips in messages.
- The `sprint` tool lists subtasks under their parent.

## 0.1.0 · 2026-11-02

- First version: the open sprint next to your agents.
```

- One `## <version> · <date>` section per published version, newest first. The version is the one of `extension.json`, the date is `YYYY-MM-DD`, the day you tag it.
- Under it, one `- ` line per change, written for the user: what they can do now, or what works differently. No commit hashes, no refactors, nothing they can't see. Inline code and links are fine; no images, HTML or deeper headings.
- At most 20 lines per version and 300 characters per line.
- English in `CHANGELOG.md`. A translation goes in `CHANGELOG.<language>.md` (`CHANGELOG.fr.md`), with the same sections; Squadron falls back on English for a version the translation lacks.
- The tagged commit needs the section of its version, with at least one line: CI refuses it otherwise.

CI copies the 20 newest sections into `index.json`, as `changelog: [{ "version", "date", "notes": { "en": [...], "fr": [...] } }]`. Squadron shows the versions between the one installed and the new one.

### Your own source

Users can add other sources than the official one, in **Settings › Extensions**, tab **All extensions**: the **Marketplaces** button adds a marketplace, **From a repository** adds a single extension. A source is the https URL of a GitHub, GitLab (gitlab.com or self-hosted, subgroups included) or Bitbucket repository, a GitHub `owner/repo`, or the https URL of a `.json` file (`registry.json`, `index.json` or `catalog.json`).

A marketplace is a repository organized like this one: on GitHub, fork it, enable GitHub Actions in the fork, empty `registry.json`, `rejected.json` (`{}`) and `index.json` (`{ "api": 1, "extensions": [] }`), and publish your extensions the same way. Squadron reads `registry.json` (or `index.json`) on the default branch, then the `catalog.json` of the latest release of each repository `registry.json` lists, except entries with `path`; a repository without one falls back to its `index.json` entry. Archives are downloaded only from the source's repository, or from the repository its `registry.json` lists for that id. Its extensions show as **Imported** and are not reviewed for Squadron; an extension updates only from the source it was installed from.
