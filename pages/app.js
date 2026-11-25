// ─────────────────────────────────────────────────────────────────────────────
// UTIL — shared helpers used by every page module: DOM builder, formatters,
// KPI tiles, pills, info tooltips, SVG trend chart, sortable/paged table and
// the loading / error / empty state panels.
// Note: this file must never contain a double-curly or curly-percent
// sequence (build.js aborts if it does) — keep a space or newline between
// consecutive closing braces.
// ─────────────────────────────────────────────────────────────────────────────

var NAT_UTIL = (function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var EMPTY_TEXT = 'No snapshot data yet. The first daily snapshot runs at 05:31.';

  var STATUS_ORDER = ['FullyPatched', 'ApprovedPending', 'RebootRequired', 'InstallError', 'NoPolicy', 'NoData'];
  var STATUS_META = {
    FullyPatched:    { label: 'Fully patched',    color: 'var(--color-patch-fully)' },
    ApprovedPending: { label: 'Approved pending', color: 'var(--color-patch-approved)' },
    RebootRequired:  { label: 'Reboot required',  color: 'var(--color-patch-reboot)' },
    InstallError:    { label: 'Install error',    color: 'var(--color-patch-error)' },
    NoPolicy:        { label: 'No policy',        color: 'var(--color-patch-nopolicy)' },
    NoData:          { label: 'No data',          color: 'var(--color-patch-nodata)' },
  };
  var SEVERITY_META = {
    CRITICAL:    { label: 'Critical',    color: 'var(--color-sev-critical)' },
    IMPORTANT:   { label: 'Important',   color: 'var(--color-sev-important)' },
    MODERATE:    { label: 'Moderate',    color: 'var(--color-sev-moderate)' },
    LOW:         { label: 'Low',         color: 'var(--color-sev-low)' },
    UNSPECIFIED: { label: 'Unspecified', color: 'var(--color-sev-low)' },
  };

  var TILE_DEFS = [
    { key: 'devices_in_scope', label: 'Devices in scope', kind: 'int' },
    { key: 'coverage_pct', label: 'Coverage', kind: 'pct',
      tip: 'Devices with a patch policy, out of all devices in scope.' },
    { key: 'compliance_pct', label: 'Compliance', kind: 'pct',
      tip: 'Fully patched devices, out of devices with a policy that reported in the last 14 days.' },
    { key: 'install_error', label: 'Install errors', kind: 'int' },
    { key: 'devices_stale', label: 'Stale devices', kind: 'int',
      tip: "Devices that haven't reported to Datto in 14+ days. Excluded from compliance." },
  ];

  // ── Drill-through definitions ───────────────────────────────────────────
  // Overview metric -> customer-table filter/sort and the device filter carried
  // to the Customer view. `field` is both the sites-list field and its column
  // key. `device` is a DEVICE_FILTERS key (or null for "show all devices").
  function above0(v) { var n = numOrNull(v); return n !== null && n > 0; }
  // Fields: field = sort + highlight column key; filterField = field the site
  // filter tests (defaults to field); base = the base column the Columns menu
  // knows it by; group = 'ws' | 'srv' when the table swaps to that device
  // type's columns; device = device filter keys for the Customer view.
  function below(n) { return function (v) { var x = numOrNull(v); return x !== null && x < n; }; }
  var DRILLS = {
    install_error:    { field: 'install_error',        test: above0, dir: 'desc', device: ['install_error'],    desc: 'install errors' },
    stale:            { field: 'devices_stale',        test: above0, dir: 'desc', device: ['stale'],            desc: 'stale devices' },
    no_policy:        { field: 'no_policy',            test: above0, dir: 'desc', device: ['no_policy'],        desc: 'devices with no patch policy' },
    compliance:       { field: 'compliance_pct',       test: below(95), dir: 'asc', device: [],                 desc: 'compliance below 95%' },
    os_unsupported:   { field: 'os_unsupported',       test: above0, dir: 'desc', device: ['unsupported_os'],   desc: 'unsupported operating systems' },
    os_ending_soon:   { field: 'os_ending_soon',       test: above0, dir: 'desc', device: ['ending_soon'],      desc: 'operating system support ending soon' },
    reboot_overdue:   { field: 'reboot_overdue',       test: above0, dir: 'desc', device: ['reboot_overdue'],   desc: 'overdue reboots' },
    oldest_critical:  { field: 'oldest_critical_days', test: function (v) { return numOrNull(v) !== null; }, dir: 'desc', device: ['approved_pending'], desc: 'an outstanding critical patch' },
    approved_pending: { field: 'approved_pending',     test: above0, dir: 'desc', device: ['approved_pending'], desc: 'approved patches pending' },
    reboot_required:  { field: 'reboot_required',      test: above0, dir: 'desc', device: ['reboot_required'],  desc: 'reboots required' },
  };
  [['ws', 'workstations', 'Workstations'], ['srv', 'servers', 'Servers']].forEach(function (g) {
    var p = g[0], type = g[1], name = g[2];
    function add(suffix, o) {
      DRILLS[p + '_' + suffix] = Object.assign({ group: p, dir: 'desc', test: above0 }, o);
    }
    add('card', { field: p + '_compliance_pct', filterField: p + '_devices_in_scope', base: 'compliance_pct', dir: 'asc', device: [type], desc: name + ' in scope' });
    add('compliance', { field: p + '_compliance_pct', base: 'compliance_pct', test: below(95), dir: 'asc', device: [type], desc: name + ' with compliance below 95%' });
    add('coverage', { field: p + '_coverage_pct', base: 'coverage_pct', test: below(100), dir: 'asc', device: [type, 'no_policy'], desc: name + ' with coverage below 100%' });
    add('install_error', { field: p + '_install_error', base: 'install_error', device: [type, 'install_error'], desc: name + ' with install errors' });
    add('stale', { field: p + '_stale', base: 'devices_stale', device: [type, 'stale'], desc: name + ' with stale devices' });
  });
  var DEVICE_FILTER_KEYS = ['workstations', 'servers', 'install_error', 'no_policy', 'approved_pending', 'reboot_required', 'stale', 'unsupported_os', 'ending_soon', 'reboot_overdue'];
  // Overview tile / risk-tile / status-segment key -> DRILLS key.
  var TILE_DRILL = { coverage_pct: 'no_policy', compliance_pct: 'compliance', install_error: 'install_error', devices_stale: 'stale' };
  var RISK_DRILL = { os_unsupported: 'os_unsupported', os_ending_soon: 'os_ending_soon', reboot_overdue: 'reboot_overdue', oldest_critical_days: 'oldest_critical' };
  var STATUS_DRILL = { ApprovedPending: 'approved_pending', RebootRequired: 'reboot_required', NoPolicy: 'no_policy', InstallError: 'install_error' };

  // Makes a card/item keyboard- and mouse-clickable with a hover hint pill.
  function makeClickable(node, hint, onClick) {
    node.classList.add('pi-clickable');
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.addEventListener('click', function (e) {
      var hit = e.target.closest && e.target.closest('.pi-info, .pi-clickable');
      if (hit && hit !== node) return;
      onClick();
    });
    node.addEventListener('keydown', function (e) {
      if (e.target !== node) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
    });
    return node;
  }

  // ── Formatting ──────────────────────────────────────────────────────────
  function fmtDate(yyyymmdd) {
    var s = String(yyyymmdd == null ? '' : yyyymmdd);
    if (!/^\d{8}$/.test(s)) return s;
    var m = MONTHS[parseInt(s.slice(4, 6), 10) - 1];
    if (!m) return s;
    return parseInt(s.slice(6, 8), 10) + ' ' + m + ' ' + s.slice(0, 4);
  }

  function isNum(n) { return typeof n === 'number' && isFinite(n); }

  function fmtPct(n) { return isNum(n) ? n.toFixed(1) + '%' : '\u2014'; }
  function fmtInt(n) { return isNum(n) ? n.toLocaleString('en-GB') : '\u2014'; }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function localYmd(d) { return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()); }

  // True when as_of is today or yesterday (local time).
  function isFresh(asOf) {
    var now = new Date();
    var y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    var s = String(asOf || '');
    return s === localYmd(now) || s === localYmd(y);
  }

  function relTime(iso) {
    var t = Date.parse(iso || '');
    if (isNaN(t)) return '\u2014';
    var mins = Math.floor((Date.now() - t) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    var days = Math.floor(hours / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u || '')) ? u : null;
  }

  // ── DOM ─────────────────────────────────────────────────────────────────
  // el('div', { class: 'foo', onclick: fn }, [child1, 'text']).
  // attrs.class sets className; attrs.html sets innerHTML (static markup
  // only — never pass data); on* functions become listeners; "selected"/
  // "checked" are DOM properties; everything else is setAttribute.
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'selected') node.selected = true;
      else if (k === 'checked') node.checked = true;
      else node.setAttribute(k, v);
    });
    // Any child that is not a Node is converted to text (arrays are flattened,
    // null/undefined/booleans are skipped) so bad data can never reach
    // appendChild as a non-Node.
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || typeof c === 'boolean') return;
        if (Array.isArray(c)) { add(c); return; }
        if (typeof c === 'object' && typeof c.nodeType === 'number') { node.appendChild(c); return; }
        node.appendChild(document.createTextNode(typeof c === 'object' ? safeText(c) : String(c)));
      });
    })(children || []);
    return node;
  }

  // Text for any value: objects/arrays become compact JSON rather than "[object Object]".
  function safeText(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') {
      try { return JSON.stringify(v); } catch (e) { return ''; }
    }
    return String(v);
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  // ── Pills, tags, tooltip ────────────────────────────────────────────────
  function pill(text, color) {
    return el('span', { class: 'pi-pill', style: '--pc:' + color }, [text]);
  }
  function statusPill(status) {
    var m = STATUS_META[status];
    return m ? pill(m.label, m.color) : pill(safeText(status) || 'Unknown', 'var(--color-patch-nopolicy)');
  }
  function severityPill(sev) {
    var key = String(sev || 'UNSPECIFIED').toUpperCase();
    var m = SEVERITY_META[key] || SEVERITY_META.UNSPECIFIED;
    return pill(SEVERITY_META[key] ? m.label : (key.charAt(0) + key.slice(1).toLowerCase()), m.color);
  }

  var tipSeq = 0;
  function infoTip(text) {
    var id = 'pi-tip-' + (++tipSeq);
    return el('span', { class: 'pi-info' }, [
      el('button', { type: 'button', class: 'pi-info-btn', 'aria-label': 'More information', 'aria-describedby': id }, ['i']),
      el('span', { class: 'pi-info-tip', role: 'tooltip', id: id }, [text]),
    ]);
  }

  function warnBadge(text) {
    return el('span', { class: 'pi-warn-badge', role: 'status' }, ['\u26A0 ' + text]);
  }

  // Compliance cell: colour plus a symbol and the number, so colour is never
  // the only signal.
  function complianceCell(n) {
    if (!isNum(n)) return '\u2014';
    var cls = n >= 95 ? 'pi-cell-good' : n >= 80 ? 'pi-cell-warn' : 'pi-cell-bad';
    var icon = n >= 95 ? '\u2713 ' : n >= 80 ? '! ' : '\u2715 ';
    return { cls: cls, node: el('span', {}, [icon + n.toFixed(1) + '%']) };
  }

  function deltaNode(n) {
    if (!isNum(n)) return '\u2014';
    if (n > 0) return el('span', { class: 'pi-delta-up' }, ['\u25B2 +' + n.toFixed(1) + ' pts']);
    if (n < 0) return el('span', { class: 'pi-delta-down' }, ['\u25BC ' + n.toFixed(1) + ' pts']);
    return '0.0 pts';
  }

  // ── States ──────────────────────────────────────────────────────────────
  function skel(height, extra) {
    return el('div', { class: 'pi-skel', style: 'height:' + height + ';' + (extra || ''), 'aria-hidden': 'true' });
  }
  function skelTiles() {
    var wrap = el('div', { class: 'pi-tiles', role: 'status', 'aria-label': 'Loading' });
    for (var i = 0; i < 5; i++) wrap.appendChild(skel('92px'));
    var groups = el('div', { class: 'pi-groups', 'aria-hidden': 'true' }, [skel('150px'), skel('150px')]);
    var risk = el('div', { class: 'pi-risk-row', 'aria-hidden': 'true' }, [skel('110px'), skel('110px'), skel('110px'), skel('110px')]);
    return el('div', {}, [wrap, groups, risk]);
  }
  function skelBlock(height) {
    return el('div', { role: 'status', 'aria-label': 'Loading' }, [skel(height)]);
  }
  function skelTable(rows) {
    var wrap = el('div', { class: 'nat-card', role: 'status', 'aria-label': 'Loading' });
    wrap.appendChild(skel('22px', 'margin-bottom:12px;width:40%;'));
    for (var i = 0; i < (rows || 6); i++) wrap.appendChild(skel('18px', 'margin-bottom:10px;'));
    return wrap;
  }

  function errorPanel(message, retry) {
    var card = el('div', { class: 'nat-card pi-state pi-state--error', role: 'alert' }, [
      el('p', { class: 'pi-state-title' }, ['Something went wrong']),
      el('p', {}, [message]),
    ]);
    if (retry) card.appendChild(el('button', { type: 'button', class: 'nat-btn nat-btn--primary', onclick: retry }, ['Retry']));
    return card;
  }

  function emptyPanel(message) {
    return el('div', { class: 'nat-card pi-state' }, [
      el('p', { class: 'pi-state-title' }, ['Nothing to show yet']),
      el('p', {}, [message || EMPTY_TEXT]),
    ]);
  }

  function errorMessage(err) {
    if (err && err.message === 'TIMEOUT') return 'The workflow did not finish within 90 seconds.';
    return 'Could not load data: ' + (err && err.message ? err.message : 'unknown error');
  }

  // Secondary "132 of 299 devices" line + explanatory tooltip behind a
  // compliance/coverage %. Returns null when the counts are missing (older data).
  function countDetail(g, kind, noun) {
    if (!g || typeof g !== 'object') return null;
    var scope = numOrNull(g.devices_in_scope);
    var part = numOrNull(kind === 'compliance' ? g.fully_patched_assessable : g.covered);
    var whole = kind === 'compliance' ? numOrNull(g.assessable) : scope;
    if (part === null || whole === null || scope === null) return null;
    var tip = kind === 'compliance'
      ? fmtInt(part) + ' of ' + fmtInt(whole) + ' ' + noun + ' are fully patched. ' + fmtInt(Math.max(0, scope - whole)) + ' ' + noun + ' with no policy or no recent check-in are excluded.'
      : fmtInt(part) + ' of ' + fmtInt(whole) + ' ' + noun + ' have a patch policy. ' + fmtInt(Math.max(0, scope - part)) + ' have no policy.';
    return { text: fmtInt(part) + ' of ' + fmtInt(whole) + ' devices', tip: tip };
  }

  // ── KPI tiles ───────────────────────────────────────────────────────────
  // drill = { hint, on: { <tile key>: fn } } makes the listed tiles clickable.
  function kpiTiles(tiles, drill) {
    tiles = tiles || {};
    var grid = el('div', { class: 'pi-tiles' });
    TILE_DEFS.forEach(function (d) {
      var v = tiles[d.key];
      var label = el('p', { class: 'nat-metric-label' }, [d.label]);
      if (d.tip) label.appendChild(infoTip(d.tip));
      var card = el('div', { class: 'nat-card nat-metric-card' }, [
        label,
        el('p', { class: 'nat-metric-pct' }, [d.kind === 'pct' ? fmtPct(v) : fmtInt(v)]),
      ]);
      var detail = d.kind === 'pct' ? countDetail(tiles, d.key === 'compliance_pct' ? 'compliance' : 'coverage', 'devices') : null;
      if (detail) card.appendChild(el('p', { class: 'nat-metric-count', title: detail.tip }, [detail.text]));
      if (drill && drill.on[d.key]) makeClickable(card, drill.hint, drill.on[d.key]);
      grid.appendChild(card);
    });
    return grid;
  }

  // ── Workstations / Servers split ────────────────────────────────────────
  // Two wider cards under the KPI tiles. A group that is missing from the
  // response (older data) is skipped; if both are missing, returns null.
  var GROUP_DEFS = [
    { key: 'workstations', p: 'ws', title: 'Workstations', sub: 'Desktops and laptops', none: 'No workstations at this site' },
    { key: 'servers', p: 'srv', title: 'Servers', sub: 'Physical and virtual servers', none: 'No servers at this site' },
  ];

  function numOrNull(v) {
    if (v == null || v === '' || typeof v === 'boolean') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // drill = { hint, on: { ws_card, ws_compliance, ws_coverage, ws_install_error,
  // ws_stale, srv_* : fn } }. A card is clickable if on.<p>_card exists, and
  // each figure if its own key exists. Empty (0 device) cards never are.
  function groupCards(tiles, drill) {
    var cards = [];
    GROUP_DEFS.forEach(function (def) {
      var g = tiles && tiles[def.key];
      if (!g || typeof g !== 'object' || Array.isArray(g)) return;
      var count = numOrNull(g.devices_in_scope);
      if (count === null) return;

      var head = el('div', { class: 'pi-grp-head' }, [
        el('h3', { class: 'pi-grp-title' }, [def.title]),
        el('p', { class: 'nat-muted' }, [def.sub]),
      ]);
      var card = el('div', { class: 'nat-card pi-grp' + (count === 0 ? ' pi-grp--empty' : '') }, [head]);
      function link(node, suffix) {
        var fn = drill && count > 0 && drill.on[def.p + '_' + suffix];
        return fn ? makeClickable(node, drill.hint, fn) : node;
      }

      if (count === 0) {
        card.appendChild(el('p', { class: 'pi-grp-none' }, [def.none]));
      } else {
        function pct(label, value, suffix) {
          var c = complianceCell(numOrNull(value));
          var shown = typeof c === 'string' ? el('span', {}, [c]) : el('span', { class: 'pi-grp-pct ' + c.cls }, [c.node]);
          var parts = [el('span', { class: 'nat-muted' }, [label]), shown];
          var detail = countDetail(g, suffix, def.key === 'servers' ? 'servers' : 'workstations');
          if (detail) parts.push(el('span', { class: 'nat-muted pi-count-line', title: detail.tip }, [detail.text]));
          return link(el('div', { class: 'pi-grp-metric', title: detail ? detail.tip : null }, parts), suffix);
        }
        function small(label, value, suffix) {
          return link(el('div', { class: 'pi-grp-small' }, [el('span', { class: 'nat-muted' }, [label]), el('b', {}, [fmtInt(numOrNull(value))])]), suffix);
        }
        card.appendChild(el('p', { class: 'pi-grp-count' }, [fmtInt(count), el('span', { class: 'nat-muted' }, [' devices'])]));
        card.appendChild(el('div', { class: 'pi-grp-row' }, [pct('Compliance', g.compliance_pct, 'compliance'), pct('Coverage', g.coverage_pct, 'coverage')]));
        card.appendChild(el('div', { class: 'pi-grp-row' }, [small('Install errors', g.install_error, 'install_error'), small('Stale', g.devices_stale, 'stale')]));
      }
      link(card, 'card');
      cards.push(card);
    });
    return cards.length ? el('div', { class: 'pi-groups' }, cards) : null;
  }

  // ── Risk row, lifecycle pills, OS panel, status bar, CSV, column menu ───
  var BAND_ICON = { good: '\u2713 ', warn: '! ', bad: '\u2715 ' };

  // Age of the oldest outstanding patch: green < 7, amber 7-14, red > 14.
  function ageCell(n) {
    n = numOrNull(n);
    if (n === null) return '\u2014';
    var b = n < 7 ? 'good' : n <= 14 ? 'warn' : 'bad';
    return { cls: 'pi-cell-' + b, node: el('span', {}, [BAND_ICON[b] + n + (n === 1 ? ' day' : ' days')]) };
  }

  function riskTiles(risk, drill) {
    if (!risk || typeof risk !== 'object' || Array.isArray(risk)) return null;
    var defs = [
      { key: 'os_unsupported', label: 'Unsupported OS', sub: 'Past end of support', band: 'bad' },
      { key: 'os_ending_soon', label: 'Support ending soon', sub: 'Ends within ~12 months', band: 'warn' },
      { key: 'reboot_overdue', label: 'Reboot overdue', sub: 'Needs a reboot, not restarted in 7+ days', band: 'warn' },
      { key: 'oldest_critical_days', label: 'Oldest critical patch', sub: 'Oldest approved critical patch still outstanding', age: true },
    ];
    var cards = [];
    defs.forEach(function (d) {
      if (risk[d.key] === undefined) return;
      var n = numOrNull(risk[d.key]);
      var value;
      if (d.age) {
        var c = ageCell(n);
        value = typeof c === 'string' ? el('span', {}, [c]) : el('span', { class: 'pi-grp-pct ' + c.cls }, [c.node]);
      } else if (n > 0) {
        value = el('span', { class: 'pi-grp-pct pi-cell-' + d.band }, [BAND_ICON[d.band] + fmtInt(n)]);
      } else {
        value = el('span', {}, [fmtInt(n)]);
      }
      var card = el('div', { class: 'nat-card pi-risk' }, [
        el('p', { class: 'nat-metric-label' }, [d.label]),
        el('p', { class: 'pi-risk-val' }, [value]),
        el('p', { class: 'nat-muted pi-risk-sub' }, [d.sub]),
      ]);
      if (d.age && risk.oldest_important_days !== undefined) {
        var imp = numOrNull(risk.oldest_important_days);
        card.appendChild(el('p', { class: 'nat-muted pi-risk-sub' }, ['Oldest important patch: ' + (imp === null ? '\u2014' : imp + (imp === 1 ? ' day' : ' days'))]));
      }
      if (drill && drill.on[d.key]) makeClickable(card, drill.hint, drill.on[d.key]);
      cards.push(card);
    });
    return cards.length ? el('div', { class: 'pi-risk-row' }, cards) : null;
  }

  var LIFECYCLE_META = {
    supported:   { label: 'Supported',      color: 'var(--color-patch-fully)' },
    ending_soon: { label: 'Ending soon',    color: 'var(--color-patch-approved)' },
    unsupported: { label: 'Unsupported',    color: 'var(--color-patch-error)' },
    unknown:     { label: 'Check manually', color: 'var(--color-patch-nopolicy)' },
  };

  function lifecyclePill(lc) {
    var m = LIFECYCLE_META[String(lc == null ? '' : lc).toLowerCase()] || LIFECYCLE_META.unknown;
    return pill(m.label, m.color);
  }

  // Fixed family -> lifecycle mapping for the OS panel.
  function familyLifecycle(family) {
    var f = String(family == null ? '' : family).toLowerCase().replace(/\s+/g, ' ').trim().replace(/^windows (?=server)/, '');
    if (/ltsc/.test(f) || /^(macos|mac os|other)/.test(f)) return 'unknown';
    if (/^windows 11\b/.test(f) || /^server 20(19|22|25)\b/.test(f)) return 'supported';
    if (/^server 2016\b/.test(f)) return 'ending_soon';
    if (/^windows 10\b/.test(f) || /^windows (8|7|vista|xp)/.test(f) || /older/.test(f) || /^server 20(12|08|03)/.test(f)) return 'unsupported';
    return 'unknown';
  }

  function osPanel(list) {
    if (!Array.isArray(list)) return null;
    var rows = [], total = 0;
    list.forEach(function (o) {
      if (!o || typeof o !== 'object' || numOrNull(o.devices) === null) return;
      var n = numOrNull(o.devices);
      total += n;
      rows.push({ family: safeText(o.family) || 'Other', devices: n });
    });
    if (!rows.length || !total) return null;
    rows.forEach(function (r) { r.share = (r.devices / total) * 100; r.lifecycle = familyLifecycle(r.family); });
    return dataTable({
      columns: [
        { key: 'family', label: 'Operating system' },
        { key: 'devices', label: 'Devices', num: true, render: function (r) { return fmtInt(r.devices); } },
        { key: 'share', label: '% of total', num: true, render: function (r) {
          return el('span', { class: 'pi-osshare' }, [
            el('span', { class: 'pi-osbar', 'aria-hidden': 'true' }, [el('span', { style: 'width:' + r.share.toFixed(1) + '%' })]),
            r.share.toFixed(1) + '%',
          ]);
        } },
        { key: 'lifecycle', label: 'Lifecycle', render: function (r) { return lifecyclePill(r.lifecycle); } },
      ],
      rows: rows,
      defaultSort: { key: 'devices', dir: 'desc' },
    }).el;
  }

  // Horizontal stacked status bar with counts. Returns null with no data.
  // drill = { hint, on: { <status key>: fn } } makes those segments and legend
  // entries clickable.
  function statusBreakdown(breakdown, drill) {
    if (!breakdown || typeof breakdown !== 'object') return null;
    var total = 0;
    STATUS_ORDER.forEach(function (k) { total += numOrNull(breakdown[k]) || 0; });
    if (!total) return null;
    var card = el('div', { class: 'nat-card' });
    var bar = el('div', { class: 'pi-stack', role: 'img', 'aria-label': 'Device status breakdown' });
    var list = el('div', { class: 'pi-breakdown' });
    STATUS_ORDER.forEach(function (k) {
      var n = numOrNull(breakdown[k]) || 0;
      var m = STATUS_META[k];
      var share = ((n / total) * 100).toFixed(1) + '%';
      var go = drill && drill.on[k];
      if (n > 0) {
        var seg = el('div', { style: '--pc:' + m.color + ';width:' + (n / total) * 100 + '%', title: m.label + ': ' + n + ' (' + share + ')' + (go ? ' \u2014 ' + drill.hint : '') });
        if (go) { seg.classList.add('pi-seg-click'); seg.addEventListener('click', go); }
        bar.appendChild(seg);
      }
      var item = el('div', { class: 'pi-breakdown-item' }, [
        el('span', { class: 'pi-swatch', style: '--pc:' + m.color, 'aria-hidden': 'true' }),
        m.label,
        el('b', {}, [fmtInt(n) + ' \u00B7 ' + share]),
      ]);
      list.appendChild(go ? makeClickable(item, drill.hint, go) : item);
    });
    card.appendChild(bar);
    card.appendChild(list);
    return card;
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function slug(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
  }

  function csvCell(v) {
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    var s = String(v);
    // Stop spreadsheet apps treating text as a formula.
    if (typeof v === 'string' && /^[=+@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // cols: [{ label, value(row) }]
  function downloadCsv(filename, cols, rows) {
    var lines = [cols.map(function (c) { return csvCell(c.label); }).join(',')];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) { var v; try { v = c.value(r); } catch (e) { v = ''; } return csvCell(v); }).join(','));
    });
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: filename, style: 'display:none' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function exportButton(getRows, cols, getFilename) {
    return el('button', { type: 'button', class: 'nat-btn', onclick: function () { downloadCsv(getFilename(), cols, getRows()); } }, ['Export CSV']);
  }

  // Show/hide columns menu; the choice is kept in sessionStorage only.
  // defs: [{ key, label, locked, on }]
  function columnMenu(defs, storageKey, onChange) {
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch (e) { saved = null; }
    var visible = {};
    var forced = null, boxes = {};
    defs.forEach(function (d) { visible[d.key] = d.locked ? true : Array.isArray(saved) ? saved.indexOf(d.key) !== -1 : !!d.on; });
    var list = el('div', { class: 'pi-menu-list' });
    defs.forEach(function (d) {
      var box = el('input', { type: 'checkbox', checked: visible[d.key], disabled: d.locked ? 'disabled' : null });
      boxes[d.key] = box;
      box.addEventListener('change', function () {
        if (forced === d.key) forced = null; // the user has taken control of this column
        visible[d.key] = box.checked;
        try { sessionStorage.setItem(storageKey, JSON.stringify(defs.filter(function (x) { return visible[x.key]; }).map(function (x) { return x.key; }))); } catch (e) { /* non-fatal */ }
        onChange();
      });
      list.appendChild(el('label', { class: 'pi-check' }, [box, d.label]));
    });
    var root = el('details', { class: 'pi-menu' }, [el('summary', { class: 'nat-btn' }, ['Columns']), list]);
    function outside(e) {
      if (!root.isConnected) { document.removeEventListener('click', outside); return; }
      if (!root.contains(e.target)) root.removeAttribute('open');
    }
    document.addEventListener('click', outside);
    // Temporarily shows a column (a drill's metric) without saving it.
    function setForced(key) {
      if (forced && boxes[forced]) boxes[forced].checked = visible[forced];
      forced = key && boxes[key] ? key : null;
      if (forced) boxes[forced].checked = true;
    }
    return { el: root, setForced: setForced, isVisible: function (key) { return visible[key] !== false || key === forced; } };
  }

  // ── Trend line chart (inline SVG, no external library) ─────────────────
  var TREND_VIEWS = [
    { key: 'overall', label: 'Overall' },
    { key: 'workstations', label: 'Workstations' },
    { key: 'servers', label: 'Servers' },
    { key: 'compare', label: 'Compare' },
  ];
  var C1 = 'var(--color-chart-1)', C2 = 'var(--color-chart-2)', C4 = 'var(--color-chart-4)';
  var TREND_SERIES = {
    overall: [
      { key: 'compliance_pct', label: 'Compliance', color: C1, dash: '' },
      { key: 'coverage_pct', label: 'Coverage', color: C2, dash: '7 4' },
    ],
    workstations: [
      { key: 'ws_compliance_pct', label: 'Workstation compliance', color: C1, dash: '' },
      { key: 'ws_coverage_pct', label: 'Workstation coverage', color: C2, dash: '7 4' },
    ],
    servers: [
      { key: 'srv_compliance_pct', label: 'Server compliance', color: C1, dash: '' },
      { key: 'srv_coverage_pct', label: 'Server coverage', color: C2, dash: '7 4' },
    ],
    compare: [
      { key: 'ws_compliance_pct', label: 'Workstations compliance', color: C2, dash: '' },
      { key: 'srv_compliance_pct', label: 'Servers compliance', color: C4, dash: '' },
    ],
  };
  var SPLIT_KEYS = ['ws_compliance_pct', 'ws_coverage_pct', 'srv_compliance_pct', 'srv_coverage_pct'];
  var SPLIT_FALLBACK_DATE = '20261030';

  // Selected trend view survives page navigation but lives only in memory
  // (gone on reload).
  var trendView = 'overall';
  function getTrendView() { return trendView; }
  function setTrendView(v) { if (TREND_SERIES[v]) trendView = v; }

  // Which split views make sense for these tiles. A group is unavailable only
  // when it is present and has 0 devices; a missing group stays selectable.
  function trendAvail(tiles) {
    function has(g) {
      var c = tiles && tiles[g] && typeof tiles[g] === 'object' ? numOrNull(tiles[g].devices_in_scope) : null;
      return c !== 0;
    }
    var ws = has('workstations'), srv = has('servers');
    return { overall: true, workstations: ws, servers: srv, compare: ws && srv };
  }

  function effectiveView(avail) {
    return avail && avail[trendView] === false ? 'overall' : trendView;
  }

  function trendViewToggle(current, onChange, avail) {
    var group = el('div', { class: 'nat-toggle-group', role: 'group', 'aria-label': 'Trend view' });
    var NONE = { workstations: 'No workstations at this site', servers: 'No servers at this site', compare: 'Needs both workstations and servers' };
    TREND_VIEWS.forEach(function (v) {
      var off = avail && avail[v.key] === false;
      var noneMsg = v.key === 'compare'
        ? (avail.workstations === false ? NONE.workstations : NONE.servers)
        : NONE[v.key];
      group.appendChild(el('button', {
        type: 'button', class: v.key === current ? 'active' : '', 'aria-pressed': v.key === current ? 'true' : 'false',
        disabled: off ? 'disabled' : null, title: off ? noneMsg : null,
        onclick: function () { if (v.key !== current) { setTrendView(v.key); onChange(v.key); } },
      }, [v.label]));
    });
    return group;
  }

  function trendChart(trend, view) {
    var pts = (trend || []).filter(function (p) { return p && p.date; });
    var wrap = el('div', { class: 'nat-card pi-chart' });
    if (!pts.length) {
      wrap.appendChild(el('p', { class: 'nat-muted' }, ['No trend data for this period.']));
      return wrap;
    }
    view = TREND_SERIES[view] ? view : 'overall';
    var series = TREND_SERIES[view];
    if (view !== 'overall' && !pts.some(function (p) { return series.some(function (s) { return isNum(p[s.key]); }); })) {
      var from = pts.filter(function (p) { return SPLIT_KEYS.some(function (k) { return isNum(p[k]); }); }).map(function (p) { return p.date; }).sort()[0];
      wrap.appendChild(el('p', { class: 'nat-muted' }, ['Workstation/server trend data starts from ' + fmtDate(from || SPLIT_FALLBACK_DATE)]));
      return wrap;
    }

    var W = 860, H = 280, m = { l: 42, r: 16, t: 12, b: 30 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b, n = pts.length;
    function x(i) { return m.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1)); }
    function y(v) { return m.t + ih * (1 - Math.max(0, Math.min(100, v)) / 100); }

    var last = pts[n - 1];
    function describe(p) {
      return fmtDate(p.date) + ' \u2014 ' + series.map(function (s) { return s.label + ' ' + fmtPct(p[s.key]); }).join(' \u00B7 ');
    }
    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Trend chart, latest ' + describe(last),
    });

    [0, 20, 40, 60, 80, 100].forEach(function (t) {
      svg.appendChild(svgEl('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? 'pi-axis' : 'pi-grid' }));
      var lbl = svgEl('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' });
      lbl.textContent = t + '%';
      svg.appendChild(lbl);
    });

    var ticks = Math.min(6, n);
    for (var k = 0; k < ticks; k++) {
      var idx = ticks === 1 ? 0 : Math.round((k * (n - 1)) / (ticks - 1));
      var tl = svgEl('text', { x: x(idx), y: H - 8, 'text-anchor': k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle' });
      tl.textContent = fmtDate(pts[idx].date).replace(/ \d{4}$/, '');
      svg.appendChild(tl);
    }

    series.forEach(function (s) {
      var d = '';
      pts.forEach(function (p, i) {
        if (!isNum(p[s.key])) return;
        // A null breaks the line: restart with M after any gap.
        var prevOk = i > 0 && isNum(pts[i - 1][s.key]);
        d += (prevOk ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[s.key]).toFixed(1);
      });
      if (d) svg.appendChild(svgEl('path', {
        d: d, fill: 'none', stroke: s.color, 'stroke-width': '2.5', 'stroke-linejoin': 'round',
        'stroke-dasharray': s.dash,
      }));
      // Isolated points between gaps would otherwise be invisible.
      pts.forEach(function (p, i) {
        if (!isNum(p[s.key])) return;
        var lone = !(i > 0 && isNum(pts[i - 1][s.key])) && !(i < n - 1 && isNum(pts[i + 1][s.key]));
        if (lone) svg.appendChild(svgEl('circle', { cx: x(i), cy: y(p[s.key]), r: 3, fill: s.color }));
      });
    });

    var cursor = svgEl('line', { y1: m.t, y2: m.t + ih, class: 'pi-axis', style: 'display:none' });
    svg.appendChild(cursor);
    var dots = series.map(function (s) {
      var c = svgEl('circle', { r: 4.5, fill: s.color, stroke: 'var(--color-bg-secondary)', 'stroke-width': '2', style: 'display:none' });
      svg.appendChild(c);
      return c;
    });

    var tip = el('div', { class: 'pi-chart-tip', 'aria-live': 'polite' });
    tip.textContent = describe(last);

    function show(i) {
      var p = pts[i];
      cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.style.display = '';
      series.forEach(function (s, si) {
        if (!isNum(p[s.key])) { dots[si].style.display = 'none'; return; }
        dots[si].setAttribute('cx', x(i)); dots[si].setAttribute('cy', y(p[s.key])); dots[si].style.display = '';
      });
      tip.textContent = describe(p);
    }
    function hide() {
      cursor.style.display = 'none';
      dots.forEach(function (c) { c.style.display = 'none'; });
      tip.textContent = describe(last);
    }

    var overlay = svgEl('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
    overlay.addEventListener('pointermove', function (e) {
      var r = svg.getBoundingClientRect();
      var px = ((e.clientX - r.left) / r.width) * W;
      var i = n === 1 ? 0 : Math.round(((px - m.l) / iw) * (n - 1));
      show(Math.max(0, Math.min(n - 1, i)));
    });
    overlay.addEventListener('pointerleave', hide);
    svg.appendChild(overlay);

    var legend = el('div', { class: 'pi-legend' });
    series.forEach(function (s) {
      var line = svgEl('svg', { width: '26', height: '10', 'aria-hidden': 'true' }, [
        svgEl('line', { x1: 0, x2: 26, y1: 5, y2: 5, stroke: s.color, 'stroke-width': '2.5', 'stroke-dasharray': s.dash }),
      ]);
      legend.appendChild(el('span', { class: 'pi-legend-item' }, [line, s.label + (s.dash ? ' (dashed)' : '')]));
    });

    wrap.appendChild(svg);
    wrap.appendChild(tip);
    wrap.appendChild(legend);
    return wrap;
  }

  // ── 30 / 90 day toggle ──────────────────────────────────────────────────
  function daysToggle(current, onChange) {
    var group = el('div', { class: 'nat-toggle-group', role: 'group', 'aria-label': 'Trend period' });
    [30, 90].forEach(function (d) {
      group.appendChild(el('button', {
        type: 'button', class: d === current ? 'active' : '', 'aria-pressed': d === current ? 'true' : 'false',
        onclick: function () { if (d !== current) onChange(d); },
      }, [d + ' days']));
    });
    return group;
  }

  // Generic single-choice segmented control (same look as the 30/90 toggle).
  function segmented(label, options, current, onChange) {
    var group = el('div', { class: 'nat-toggle-group', role: 'group', 'aria-label': label });
    options.forEach(function (o) {
      group.appendChild(el('button', {
        type: 'button', class: o.value === current ? 'active' : '', 'aria-pressed': o.value === current ? 'true' : 'false',
        onclick: function () { if (o.value !== current) onChange(o.value); },
      }, [o.label]));
    });
    return group;
  }

  // ── Sortable, paginated table ───────────────────────────────────────────
  // columns: [{ key, label, num, render(row) -> string|Node|{cls,node},
  //            sortValue(row), firstDir }]
  // Rows render 50 at a time so very large device lists stay responsive.
  function dataTable(opts) {
    var columns = opts.columns;
    var pageSize = opts.pageSize || 50;
    var rows = [];
    var page = 0;
    var sort = opts.defaultSort ? { key: opts.defaultSort.key, dir: opts.defaultSort.dir } : null;
    var highlight = null;

    var root = el('div', {});
    var card = el('div', { class: 'nat-card nat-table-wrap' });
    var pager = el('div', { class: 'pi-pager' });
    root.appendChild(card);
    root.appendChild(pager);

    function sortedRows() {
      if (!sort) return rows;
      var col = columns.filter(function (c) { return c.key === sort.key; })[0];
      if (!col) return rows;
      var get = col.sortValue || function (r) { return r[col.key]; };
      var dir = sort.dir === 'asc' ? 1 : -1;
      return rows.map(function (r, i) { return { r: r, i: i, v: get(r) }; }).sort(function (a, b) {
        var an = a.v == null || a.v === '', bn = b.v == null || b.v === '';
        if (an && bn) return a.i - b.i;
        if (an) return 1;
        if (bn) return -1;
        var c = typeof a.v === 'string'
          ? a.v.localeCompare(b.v, undefined, { numeric: true, sensitivity: 'base' })
          : a.v - b.v;
        return c ? c * dir : a.i - b.i;
      }).map(function (o) { return o.r; });
    }

    function setSort(col) {
      if (col.sortable === false) return;
      if (sort && sort.key === col.key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
      else sort = { key: col.key, dir: col.firstDir || (col.num ? 'desc' : 'asc') };
      page = 0;
      draw();
    }

    function cellContent(td, col, row) {
      var out = col.render ? col.render(row) : row[col.key];
      if (out && typeof out === 'object' && !out.nodeType) {
        if (out.cls) td.className = (td.className ? td.className + ' ' : '') + out.cls;
        out = out.node;
      }
      if (out == null || typeof out === 'boolean') out = '';
      if (!(out && typeof out === 'object' && typeof out.nodeType === 'number')) out = document.createTextNode(safeText(out));
      td.appendChild(out);
    }

    function draw() {
      var all = sortedRows();
      var pages = Math.max(1, Math.ceil(all.length / pageSize));
      if (page >= pages) page = pages - 1;
      var slice = all.slice(page * pageSize, (page + 1) * pageSize);

      var tr = el('tr', {});
      columns.forEach(function (col) {
        var sorted = sort && sort.key === col.key;
        var th = el('th', {
          scope: 'col', class: (col.num ? 'pi-num ' : '') + (sorted ? 'sorted ' : '') + (col.key === highlight ? 'pi-col-hl' : ''),
          'aria-sort': sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
          tabindex: col.sortable === false ? null : '0',
          onclick: function () { setSort(col); },
          onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSort(col); } },
        }, [col.label, el('span', { class: 'pi-sort', 'aria-hidden': 'true' }, [sorted ? (sort.dir === 'asc' ? ' \u25B2' : ' \u25BC') : ''])]);
        tr.appendChild(th);
      });

      var tbody = el('tbody', {});
      if (!slice.length) {
        tbody.appendChild(el('tr', {}, [el('td', { colspan: String(columns.length), class: 'pi-wrap' }, [opts.noRowsText || 'No matching rows.'])]));
      }
      slice.forEach(function (row) {
        var cls = (opts.onRowClick ? 'nat-clickable-row ' : '') + (opts.rowClass ? opts.rowClass(row) : '');
        var rtr = el('tr', { class: cls.trim() });
        if (opts.onRowClick) {
          rtr.setAttribute('tabindex', '0');
          rtr.setAttribute('role', 'link');
          if (opts.rowLabel) rtr.setAttribute('aria-label', opts.rowLabel(row));
          rtr.addEventListener('click', function () { opts.onRowClick(row); });
          rtr.addEventListener('keydown', function (e) { if (e.key === 'Enter') opts.onRowClick(row); });
        }
        columns.forEach(function (col) {
          var td = el('td', { class: (col.num ? 'pi-num ' : '') + (col.wrap ? 'pi-wrap' : '') });
          cellContent(td, col, row);
          if (col.key === highlight) td.classList.add('pi-col-hl');
          rtr.appendChild(td);
        });
        tbody.appendChild(rtr);
      });

      clear(card);
      card.appendChild(el('table', { class: 'nat-table' }, [el('thead', {}, [tr]), tbody]));

      clear(pager);
      if (all.length > pageSize) {
        var from = page * pageSize + 1, to = Math.min(all.length, (page + 1) * pageSize);
        pager.appendChild(el('span', {}, ['Showing ' + from + '\u2013' + to + ' of ' + all.length.toLocaleString('en-GB')]));
        pager.appendChild(el('button', { type: 'button', class: 'nat-btn', disabled: page === 0 ? 'disabled' : null, onclick: function () { page--; draw(); } }, ['Previous']));
        pager.appendChild(el('span', {}, ['Page ' + (page + 1) + ' of ' + pages]));
        pager.appendChild(el('button', { type: 'button', class: 'nat-btn', disabled: page >= pages - 1 ? 'disabled' : null, onclick: function () { page++; draw(); } }, ['Next']));
      }
    }

    function setRows(next) { rows = next || []; page = 0; draw(); }
    function setColumns(next) { columns = next; if (sort && !columns.some(function (c) { return c.key === sort.key; })) sort = null; draw(); }
    function sortBy(key, dir) { sort = key ? { key: key, dir: dir || 'desc' } : null; page = 0; draw(); }
    function setHighlight(key) { highlight = key || null; draw(); }
    setRows(opts.rows);
    return { el: root, setRows: setRows, setColumns: setColumns, getRows: sortedRows, sortBy: sortBy, setHighlight: setHighlight };
  }

  // ── "How to read this dashboard" side panel ─────────────────────────────
  var HELP_SECTIONS = [
    { h: 'Where the data comes from', p: [
      'Every morning at about 05:30, Rewst takes a snapshot of every device in Datto RMM and stores it. The figures on this page come from the latest snapshot, so they can be up to a day old. The device detail panel is the exception: it fetches live from Datto when you open it.'] },
    { h: 'Devices in scope', p: [
      "Desktops, laptops and servers in Datto RMM. It excludes On Demand sites and any device that is deleted or suspended. Printers, network devices and other non-computer devices aren't counted."] },
    { h: 'Coverage', p: [
      'The percentage of in-scope devices that have a Datto patch policy assigned. A device with no patch policy is never patched automatically, so low coverage means devices are being missed entirely.'] },
    { h: 'Compliance', p: [
      'Of the devices that have a patch policy and have reported to Datto in the last 14 days, the percentage that are Fully Patched. Fully Patched means every patch our policy has approved is installed.',
      "Compliance is measured against our patch policies, not against every update Microsoft releases. Updates the policy deliberately doesn't approve (for example feature upgrades or drivers) don't count against a device.",
      "Devices without a policy are excluded here, because they're reflected in Coverage. Stale devices are excluded because their status can't be trusted."] },
    { h: 'Stale devices', p: [
      "Devices that haven't completed a Datto audit in the last 14 days, usually because they're switched off, offline or decommissioned. Their last known patch status may be out of date, so they're counted in device totals but left out of compliance."] },
    { h: 'Install errors', p: [
      'Devices where the last patch run failed to install one or more approved patches. These usually need an engineer to look at.'] },
    { h: 'Patch statuses', items: [
      ['Fully patched', 'every approved patch is installed.'],
      ['Approved pending', 'approved patches are waiting to install, usually in the next patch window.'],
      ['Reboot required', 'patches are installed but need a restart to finish.'],
      ['Install error', 'one or more approved patches failed to install.'],
      ['No policy', "no patch policy is assigned, so the device isn't being patched."],
      ['No data', "a policy is assigned but Datto hasn't reported patch information yet."]] },
    { h: 'Operating system support', p: [
      'Each device\u2019s operating system is checked against Microsoft\u2019s support lifecycle. "Unsupported" means Microsoft no longer provides security updates (for example Windows 10 outside ESU, and Server 2012). "Ending soon" means support ends within about a year (Server 2016 ends in January 2027). Windows 10 LTSC, macOS and other systems are marked "Check manually" because their support depends on the edition.'] },
    { h: 'Reboot overdue', p: [
      'Devices that need a restart to finish installing updates and haven\u2019t restarted in 7 or more days. Patches aren\u2019t fully applied until the device restarts.'] },
    { h: 'Oldest critical patch', p: [
      'How many days the oldest approved critical patch has been waiting to install. Compliance shows how many devices are behind; this shows how long they\u2019ve been behind.'] },
    { h: 'Workstations vs servers', p: [
      "Workstations are desktops and laptops. Servers are physical and virtual servers. They're shown separately because servers usually follow a different, more cautious patch schedule."] },
    { h: '7-day change', p: [
      'Today\u2019s compliance compared with the snapshot from about a week ago. Green means improving, red means getting worse. It shows "\u2014" until there\u2019s a week of history.'] },
  ];

  var helpPanel = null;
  function closeHelp() {
    if (!helpPanel) return;
    document.removeEventListener('keydown', helpPanel.onKey);
    [helpPanel.overlay, helpPanel.root].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    var opener = helpPanel.opener;
    helpPanel = null;
    if (opener && opener.focus) opener.focus();
  }

  function openHelp() {
    closeHelp();
    var opener = document.activeElement;
    var body = el('div', {});
    HELP_SECTIONS.forEach(function (s) {
      body.appendChild(el('h3', {}, [s.h]));
      (s.p || []).forEach(function (t) { body.appendChild(el('p', {}, [t])); });
      if (s.items) {
        body.appendChild(el('ul', { class: 'pi-help-list' }, s.items.map(function (it) {
          return el('li', {}, [el('b', {}, [it[0]]), ': ' + it[1]]);
        })));
      }
    });
    var overlay = el('div', { class: 'pi-panel-overlay', onclick: closeHelp });
    var closeBtn = el('button', { type: 'button', class: 'nat-btn', 'aria-label': 'Close panel', onclick: closeHelp }, ['Close']);
    var root = el('aside', { class: 'pi-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'How to read this dashboard' }, [
      el('div', { class: 'pi-panel-head' }, [el('h2', {}, ['How to read this dashboard']), closeBtn]),
      body,
    ]);
    function onKey(e) { if (e.key === 'Escape') closeHelp(); }
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    document.body.appendChild(root);
    helpPanel = { root: root, overlay: overlay, onKey: onKey, opener: opener };
    closeBtn.focus();
  }

  return {
    openHelp: openHelp,
    trendViewToggle: trendViewToggle, trendAvail: trendAvail, effectiveView: effectiveView,
    getTrendView: getTrendView, setTrendView: setTrendView, EMPTY_TEXT: EMPTY_TEXT,
    STATUS_ORDER: STATUS_ORDER,
    STATUS_META: STATUS_META,
    fmtDate: fmtDate, fmtPct: fmtPct, fmtInt: fmtInt, isNum: isNum,
    isFresh: isFresh, relTime: relTime, safeUrl: safeUrl,
    el: el, svgEl: svgEl, clear: clear,
    pill: pill, statusPill: statusPill, severityPill: severityPill,
    infoTip: infoTip, warnBadge: warnBadge,
    complianceCell: complianceCell, deltaNode: deltaNode,
    skel: skel, skelTiles: skelTiles, skelBlock: skelBlock, skelTable: skelTable,
    errorPanel: errorPanel, emptyPanel: emptyPanel, errorMessage: errorMessage,
    kpiTiles: kpiTiles, groupCards: groupCards, trendChart: trendChart, daysToggle: daysToggle, dataTable: dataTable,
    riskTiles: riskTiles, ageCell: ageCell, lifecyclePill: lifecyclePill, osPanel: osPanel, statusBreakdown: statusBreakdown,
    exportButton: exportButton, columnMenu: columnMenu, todayIso: todayIso, slug: slug, numOrNull: numOrNull,
    segmented: segmented, DRILLS: DRILLS, DEVICE_FILTER_KEYS: DEVICE_FILTER_KEYS, TILE_DRILL: TILE_DRILL,
    RISK_DRILL: RISK_DRILL, STATUS_DRILL: STATUS_DRILL,
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// APP SHELL — sidebar, theme toggle, Refresh button and page navigation.
// Pages register with NAT_APP.registerPage(key, { render(host, state, opts) })
// and own their data loading and loading/error/empty states. The Customer
// page ('site') is not in the sidebar — it opens from an Overview row via
// NAT_APP.goToTab('site', { selectedSite: {...} }) and sits under Overview.
// ─────────────────────────────────────────────────────────────────────────────

var NAT_APP = (function () {
  'use strict';

  var state = {
    activeArea: 'overview',
    activeTab: 'overview',
    selectedSite: null, // { site_uid, site_name, autotask_company_id }
    drill: null,        // Overview drill key (NAT_UTIL.DRILLS), e.g. 'reboot_overdue'
    deviceFilter: null, // Customer view device filter keys, comma-separated
  };

  var AREAS = {
    overview: { label: 'Overview', tabs: ['site'], defaultTab: 'overview' },
  };
  var SIDEBAR_AREA_ORDER = ['overview'];

  var TAB_AREA = { overview: 'overview' };
  Object.keys(AREAS).forEach(function (areaKey) {
    AREAS[areaKey].tabs.forEach(function (tabKey) { TAB_AREA[tabKey] = areaKey; });
  });

  var PAGES = { overview: null, site: null };

  function byId(id) { return document.getElementById(id); }

  function renderSidebar() {
    var host = byId('nat-sidebar');
    if (!host) return;
    host.innerHTML = '';
    SIDEBAR_AREA_ORDER.forEach(function (areaKey) {
      host.appendChild(NAT_UTIL.el('button', {
        type: 'button',
        class: 'nat-sidebar-item' + (state.activeArea === areaKey ? ' active' : ''),
        'aria-current': state.activeArea === areaKey ? 'page' : null,
        onclick: function () { goToTab(AREAS[areaKey].defaultTab, { drill: null, deviceFilter: null }); },
      }, [AREAS[areaKey].label]));
    });
  }

  function renderActivePage(opts) {
    var host = byId('nat-main-content');
    host.innerHTML = '';
    var mod = PAGES[state.activeTab];
    if (!mod) return;
    try {
      mod.render(host, state, opts || {});
    } catch (e) {
      host.innerHTML = '';
      host.appendChild(NAT_UTIL.errorPanel('This view could not be rendered: ' + e.message, function () { renderActivePage(); }));
    }
  }

  // ── Theme toggle ─────────────────────────────────────────────────────
  // The initial theme is set on <html> by an inline script in <head> (before
  // first paint). This wires the toggle button to flip and persist it.
  var THEME_STORAGE_KEY = 'nat-theme';

  function updateThemeToggleIcon(theme) {
    var btn = byId('nat-theme-toggle-btn');
    if (btn) btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch (e) { /* non-fatal */ }
    document.documentElement.setAttribute('data-theme', next);
    updateThemeToggleIcon(next);
  }

  function registerPage(key, mod) { PAGES[key] = mod; }

  // Nav state is remembered across a reload within the same tab via
  // sessionStorage. The drill / device filter are also mirrored into the URL
  // query (?drill=... or ?site=...&filter=...) with the History API so they
  // survive a refresh, can be shared and work with Back. That part is
  // best-effort: if the host (e.g. a sandboxed Rewst iframe) refuses
  // pushState, everything still works without URL / Back support.
  var NAV_STORAGE_KEY = 'nat_nav_state';

  function persistNavState() {
    try {
      sessionStorage.setItem(NAV_STORAGE_KEY, JSON.stringify({
        activeTab: state.activeTab,
        selectedSite: state.selectedSite,
        drill: state.drill,
        deviceFilter: state.deviceFilter,
      }));
    } catch (e) { /* nav just won't persist */ }
  }

  function restoreNavState() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(NAV_STORAGE_KEY) || 'null');
      if (!saved || !TAB_AREA[saved.activeTab]) return;
      if (saved.activeTab === 'site' && !(saved.selectedSite && saved.selectedSite.site_uid)) return;
      state.activeTab = saved.activeTab;
      state.activeArea = TAB_AREA[saved.activeTab];
      state.selectedSite = saved.selectedSite || null;
      state.drill = NAT_UTIL.DRILLS[saved.drill] ? saved.drill : null;
      state.deviceFilter = saved.deviceFilter || null;
    } catch (e) { /* corrupt/unavailable — fall back to Overview */ }
  }

  function urlFor() {
    var q = [];
    if (state.activeTab === 'site' && state.selectedSite && state.selectedSite.site_uid) {
      q.push('site=' + encodeURIComponent(state.selectedSite.site_uid));
      if (state.deviceFilter) q.push('filter=' + state.deviceFilter.split(',').map(encodeURIComponent).join(','));
    } else if (state.drill) {
      q.push('drill=' + encodeURIComponent(state.drill));
    }
    return q.length ? '?' + q.join('&') : '';
  }

  function syncUrl(mode) {
    try {
      var next = urlFor();
      if (next === (location.search || '')) return;
      history[mode === 'replace' ? 'replaceState' : 'pushState'](null, '', next || location.pathname);
    } catch (e) { /* URL state unavailable in this host */ }
  }

  // Applies ?drill / ?site / ?filter to state (used on load and on Back).
  function stateFromUrl() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var site = q.get('site');
    if (site) {
      var prev = state.selectedSite;
      state.selectedSite = prev && prev.site_uid === site ? prev : { site_uid: site, site_name: null, autotask_company_id: null };
      var keys = (q.get('filter') || '').split(',').filter(function (k) { return NAT_UTIL.DEVICE_FILTER_KEYS.indexOf(k) !== -1; });
      state.deviceFilter = keys.length ? keys.join(',') : null;
      state.activeTab = 'site';
    } else {
      var drill = q.get('drill');
      state.drill = NAT_UTIL.DRILLS[drill] ? drill : null;
      state.deviceFilter = null;
      state.activeTab = 'overview';
    }
    state.activeArea = TAB_AREA[state.activeTab];
  }

  // Navigate to a tab, optionally seeding shared state first.
  function goToTab(key, stateOverrides) {
    if (stateOverrides) {
      Object.keys(stateOverrides).forEach(function (k) { state[k] = stateOverrides[k]; });
    }
    if (TAB_AREA[key]) state.activeArea = TAB_AREA[key];
    state.activeTab = key;
    persistNavState();
    syncUrl('push');
    renderSidebar();
    renderActivePage();
    try { window.scrollTo(0, 0); } catch (e) { /* non-fatal */ }
  }

  // In-page drill changes: update state + URL without re-rendering the page
  // (the page applies the change itself).
  function setDrill(key) {
    state.drill = key && NAT_UTIL.DRILLS[key] ? key : null;
    persistNavState();
    syncUrl('push');
  }
  function setDeviceFilter(keys, push) {
    state.deviceFilter = keys && keys.length ? keys.join(',') : null;
    persistNavState();
    syncUrl(push ? 'push' : 'replace');
  }

  function onPopState() {
    stateFromUrl();
    persistNavState();
    renderSidebar();
    renderActivePage();
  }

  function init() {
    var refresh = byId('nat-refresh-btn');
    if (refresh) refresh.addEventListener('click', function () {
      NAT_DATA.clearCache(state.activeTab === 'site' ? ['getSiteDetail', 'getDeviceDrilldown'] : ['getOverview']);
      renderActivePage();
    });
    var helpBtn = byId('nat-help-btn');
    if (helpBtn) helpBtn.addEventListener('click', NAT_UTIL.openHelp);
    var mode = byId('nat-mode-badge');
    if (mode) {
      var mock = NAT_DATA.isMock();
      mode.textContent = mock ? 'Mock data' : 'Live';
      mode.className = 'pi-mode ' + (mock ? 'pi-mode--mock' : 'pi-mode--live');
    }
    updateThemeToggleIcon(document.documentElement.getAttribute('data-theme') || 'light');
    var themeBtn = byId('nat-theme-toggle-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    restoreNavState();
    if (/[?&](drill|site|filter)=/.test(location.search || '')) stateFromUrl();
    persistNavState();
    syncUrl('replace');
    window.addEventListener('popstate', onPopState);
    renderSidebar();
    renderActivePage();
  }

  return { init: init, registerPage: registerPage, getState: function () { return state; }, goToTab: goToTab, setDrill: setDrill, setDeviceFilter: setDeviceFilter };
})();

document.addEventListener('DOMContentLoaded', function () {
  NAT_APP.init();
});
