# Rewst App Builder Starter Template

A starting point for building a new Rewst App Builder HTML-container portal:
sidebar navigation, light/dark theme, a generic workflow trigger-poll-cache
data layer, and one fully worked example page (loading → error → empty →
success). Compiles to a single HTML file you paste into an App Builder HTML
container.

## What's in here

```
app-template.html      HTML shell: head, header, sidebar/tabs/content
                        skeleton, and {{ MARKER }} slots build.js fills in.
build.js                Combines every source file into dist/app-compiled.html.
src/
  config.js             Every placeholder lives here (workflow/page IDs, etc).
  data-client.js         Generic GraphQL trigger -> poll -> cache data layer.
  theme.css               Design tokens (colours, spacing, type) + layout/
                        component CSS (header, sidebar, tabs, cards, tables,
                        banners, spinner, buttons).
pages/
  app.js                 App shell: sidebar, tabs, nav-state persistence,
                        lazy data loading, theme toggle. Shared NAT_UTIL
                        helpers live here too.
  home.js                 Landing page. Static — no data, no workflow call.
  example.js              The one example tab: loading/error states come
                        for free from the shell; this file only handles the
                        empty and success states for its own payload shape.
mock/
  example-sample.json    Sample payload for local preview via ?mock=1.
assets/                  Static assets (images, etc) — empty by default.
dist/                    Build output (git-ignored if you add a .gitignore).
```

## The data-access pattern

Every workflow call follows the same shape, implemented once in
`src/data-client.js` and never duplicated per page:

1. **Trigger** — `executeWorkflowFromPage(id, pageId, orgId, input)` via
   GraphQL, using the org ID resolved for the current visiting user (not a
   config constant — see `getOrgId()`).
2. **Poll** — `workflowExecutions(where: { id, orgId })` every
   `POLL_INTERVAL_MS` until a terminal status (`SUCCEEDED`/`COMPLETED` or
   `FAILED`/`TERMINATED`/`TIMED_OUT`), up to `POLL_TIMEOUT_MS`.
3. **Read** — the payload is read from `conductor.output.<outputKey>` (or
   `.result` as a fallback key).
4. **Cache** — successful payloads are cached in `sessionStorage`, keyed by
   today's date, so switching tabs never re-triggers the workflow within
   the same day. The header Refresh button bypasses the cache.

Call `createWorkflowClient({ workflowId, outputKey, cacheKeyPrefix })` once
per Rewst workflow your app calls — see the bottom of `data-client.js` for
the one example client (`NAT_DATA`). Each client is fully independent, so
you can add more without touching the others.

### Calling a workflow with parameters

`getPayload()` takes an optional `input` object, passed straight through as
the `$input: JSON` variable on the trigger mutation — it becomes whatever
the workflow's **"Workflow Triggered from Page"** trigger block names its
input as (workflow-specific; check that trigger block's schema when you
build the real workflow):

```js
NAT_DATA.getPayload({
  input: { days: 90, team: 'SOME_TEAM' },
  cacheSuffix: '90_SOME_TEAM', // see caveat below
});
```

**Caching caveat**: the sessionStorage cache key is
`cacheKeyPrefix + today's date (+ cacheSuffix)`. If the same client is ever
called with more than one distinct `input` per day (a filter toggle, a
date-range picker, etc.), pass a different `cacheSuffix` per combination —
otherwise the second call will silently be served the first call's cached
payload for that calendar day.

### How the workflow's output must be wrapped

A run's result lives at `workflowExecutions[0].conductor.output` — a JSON
object. The data-client unwraps it in this order:

```
output[outputKey]  →  output.result  →  (only if rawOutputFallback: true) output itself
```

`outputKey` is whatever string you passed to `createWorkflowClient({ outputKey: '...' })`.
So the workflow's final step must set its conductor output with your actual
payload nested under that key, e.g. for `outputKey: 'payload'`:

```json
{ "payload": { "updated_at": "20260129", "items": [ ... ] } }
```

Set `rawOutputFallback: true` only for simple ack-style workflows that
return the object directly with no wrapper key (e.g. `{"ok": true}`).

**Adding a real tab**: register a page module with
`NAT_APP.registerPage('yourTabKey', { render: function (host, payload, state) {...} })`,
add the tab to `AREAS`/`TAB_LABELS` in `pages/app.js`, and your render
function will be called automatically once its area's payload is ready —
loading and error states are handled for you by the shell (see
`renderActivePage()` in `pages/app.js`).

## Placeholders

All in `src/config.js` unless noted:

| Placeholder | What it is | Where to find the real value |
|---|---|---|
| `WORKFLOW_ID` | Rewst workflow ID the example page triggers | Workflows → your workflow → copy ID |
| `PAGE_ID` | App Builder page ID hosting this container | The page's URL in App Builder, or its settings panel |
| `REWST_APP_TITLE_PLACEHOLDER` (in `app-template.html`, 2 places) | Browser tab title + header title | Your app's name |
| `REWST_LOGO_URL_PLACEHOLDER` (in `app-template.html`) | Header logo image URL | Your brand's logo asset URL |

There is no `ORG_ID` placeholder — the visiting user's org is resolved at
runtime via GraphQL (`query getUserOrganization { userOrganization { id } }`),
since it varies per signed-in user rather than per deployment.

`POLL_INTERVAL_MS`, `POLL_TIMEOUT_MS` and `CACHE_KEY_PREFIX` are not secrets
— the defaults are safe to keep, or tune per workflow.

## Starting a new portal from this template

1. Copy this whole folder to a new location and rename it for your portal.
2. Open `src/config.js` and replace `WORKFLOW_ID` / `PAGE_ID` with your real
   IDs (see the table above).
3. Open `app-template.html` and replace `REWST_APP_TITLE_PLACEHOLDER` (2
   places) and `REWST_LOGO_URL_PLACEHOLDER` with your app's real title and
   logo.
4. Replace `pages/example.js` and `mock/example-sample.json` with your real
   tab(s), following the pattern described above. Update `AREAS`/
   `TAB_LABELS`/`PAGES` in `pages/app.js` to match, and update `MARKERS` in
   `build.js` if you rename/add page files.
5. Run `node build.js`. This produces `dist/app-compiled.html` — paste its
   full contents into your App Builder page's HTML container. It will
   build and load even before your real workflow/page IDs are set (data
   calls will error with a Retry button until then — use `?mock=1` to
   preview with sample data meanwhile).
6. Publish the page in App Builder as usual.

## Changing the theme

Everything — brand colours, light/dark palettes, spacing scale, type ramp,
radius/shadow — lives in one place: the `:root` / `[data-theme='light']`
and `[data-theme='dark']` blocks at the top of `src/theme.css`. Change a
value there and every component (cards, buttons, tabs, banners, tables)
picks it up automatically, since all component CSS below those blocks
reads from the same custom properties.

## Local preview

There's no dev server required for layout work — open
`dist/app-compiled.html` directly in a browser after building, or serve
`dist/` with any static file server so `mock/` is reachable, then append
`?mock=1` to the URL to render the example page against
`mock/example-sample.json` instead of a live workflow call.

Workflow calls themselves (GraphQL to `/graphql`) only work when the
compiled HTML is actually running inside a Rewst App Builder page — a
local file/static-server preview can exercise layout and the mock path,
but not a real trigger/poll cycle.
