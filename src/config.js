// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — Novem Patch Insights
// The workflow IDs and PAGE_ID must be plain string constants — do NOT read them
// via a Jinja expression here; that would break the App Builder container's
// Jinja pre-parse pass. ORG_ID is NOT a config constant: it is resolved at
// runtime for the visiting user via GraphQL (see src/data-client.js,
// `query getUserOrganization { userOrganization { id } }`), since it varies
// per signed-in user/org rather than per deployment.
//
// Every value below must be the real value for your deployment; the three
// workflow IDs are the only place IDs appear in this project.
// ─────────────────────────────────────────────────────────────────────────────

var NAT_CONFIG = {
  // When true, pages load data from the local JSON fixtures in mock/ (inlined
  // into the compiled file by build.js) instead of calling Rewst. Set to true
  // to review the design without the workflows, then rebuild.
  USE_MOCK_DATA: false,

  // Workflow IDs live here and nowhere else.
  // Overview page workflow. Input { days: 30 | 90 }, output key "overview".
  REWST_WORKFLOW_ID_PATCH_OVERVIEW: '01a18856-d1f0-7fd2-95dc-5aee78636802',

  // Customer page workflow. Input { site_uid, days }, output key "site_detail".
  REWST_WORKFLOW_ID_PATCH_SITE_DETAIL: '01a18859-7ed0-72dc-be27-0afeaa093ed1',

  // Device drill-down workflow. Input { device_uid }, output key "drilldown".
  // NOTE: the ID supplied had a leading "R" (R01a1872f-...), which is not a
  // valid UUID character; it is entered here without it. Verify.
  REWST_WORKFLOW_ID_PATCH_DEVICE_DRILLDOWN: '01a1872f-70ab-754a-a22a-6bee2c74195a',

  // The App Builder page ID hosting this container. Find it in the page's
  // URL in App Builder, or via the page settings panel.
  PAGE_ID: '01a18856-6ff2-7e25-a43b-37befa8778e0',

  // Autotask company link on the Customer page. {id} is replaced with the
  // site's autotask_company_id. Replace {ZONE} with your Autotask zone number
  // (e.g. "6" for ww6); until you do, the Autotask ID is shown as plain text.
  AUTOTASK_COMPANY_URL_TEMPLATE: 'https://ww4.autotask.net/Autotask/AutotaskExtend/ExecuteCommand.aspx?Code=OpenAccount&AccountID={id}',

  // Labels for the policy "days_of_week" values shown in the device drill-down,
  // e.g. { '1': 'Monday', '5': 'Friday' }. Empty by default: unmapped values
  // show as "Day <value>".
  DAY_OF_WEEK_LABELS: {},

  // Poll cadence and overall timeout for trigger-then-poll workflow calls.
  // Not secrets — safe to leave as-is, or tune per workflow.
  POLL_INTERVAL_MS: 2000,
  POLL_TIMEOUT_MS: 90000,

  // sessionStorage cache key prefix; each workflow client appends its own
  // suffix (see data-client.js), and the actual key also embeds today's date
  // and the call's input, so a repeat view within the same day is instant.
  CACHE_KEY_PREFIX: 'patch_insights_',
};
