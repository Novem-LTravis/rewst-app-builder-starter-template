# Novem Patch Insights

Two pages (Overview, Customer) built on the Novem starter template. Output: `dist/app-compiled.html`, pasted into the Rewst App Builder HTML component.

## Build
`node build.js`

## Files
- `src/config.js` - `USE_MOCK_DATA`, `REWST_WORKFLOW_ID_PATCH_OVERVIEW`, `REWST_WORKFLOW_ID_PATCH_SITE_DETAIL`, `PAGE_ID`
- `src/data-client.js` - `NAT_DATA.getOverview(days)` / `getSiteDetail(siteUid, days)`; trigger, poll, read `output.overview` / `output.site_detail`
- `src/theme.css` - design tokens and `pi-*` component styles
- `pages/app.js` - shared components (`NAT_UTIL`) and shell
- `pages/overview.js`, `pages/site.js` - the pages
- `mock/overview.json`, `mock/site_detail.json` - fixtures, inlined at build when mock is on

## Going live
1. Set the two workflow IDs and `PAGE_ID` in `src/config.js`.
2. Set `USE_MOCK_DATA: false`.
3. Run `node build.js` and paste `dist/app-compiled.html` into Rewst.

Each workflow needs a "Workflow Triggered from Page" trigger.
Do not use double braces or `{% %}` in any source file; Rewst pre-parses them as Jinja and the build aborts if found.

(The starter `README.md` and `CLAUDE.md` are OneDrive-locked and still describe the old template.)
