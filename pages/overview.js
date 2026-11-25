// ─────────────────────────────────────────────────────────────────────────────
// PAGE: Overview — fleet-wide KPI tiles, compliance/coverage trend, customer
// table (click a row to open the Customer page) and top outstanding patches.
// Data: NAT_DATA.getOverview(days) -> the workflow's "overview" output.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  var U = NAT_UTIL;
  var el = U.el;
  var days = 30;
  var token = 0;

  function isEmpty(d) {
    return !d || (!(d.sites || []).length && !(d.trend || []).length && !(d.tiles && d.tiles.devices_in_scope));
  }

  function num(label, key, render) {
    return { key: key, label: label, num: true, render: render || function (r) { return U.fmtInt(r[key]); } };
  }

  // on = visible by default; opt = hidden entirely when no site has the field
  // (older data).
  function siteColumnDefs() {
    return [
      { key: 'site_name', label: 'Site name', locked: true, on: true,
        render: function (r) { return U.el('span', { class: 'pi-link' }, [r.site_name || '(unnamed)']); } },
      Object.assign(num('Workstations', 'ws_devices_in_scope'), { opt: true, on: true }),
      Object.assign(num('Servers', 'srv_devices_in_scope'), { opt: true, on: true }),
      Object.assign(num('Devices', 'devices_in_scope'), { on: true }),
      Object.assign(num('Compliance %', 'compliance_pct', function (r) { return U.complianceCell(r.compliance_pct); }), { on: true }),
      Object.assign(num('Coverage %', 'coverage_pct', function (r) { return U.fmtPct(r.coverage_pct); }), { on: true }),
      Object.assign(num('Workstation compliance %', 'ws_compliance_pct', function (r) { return U.complianceCell(r.ws_compliance_pct); }), { opt: true }),
      Object.assign(num('Server compliance %', 'srv_compliance_pct', function (r) { return U.complianceCell(r.srv_compliance_pct); }), { opt: true }),
      Object.assign(num('Workstation coverage %', 'ws_coverage_pct', function (r) { return U.fmtPct(r.ws_coverage_pct); }), { opt: true }),
      Object.assign(num('Server coverage %', 'srv_coverage_pct', function (r) { return U.fmtPct(r.srv_coverage_pct); }), { opt: true }),
      Object.assign(num('7-day change', 'change_7d', function (r) { return U.deltaNode(r.change_7d); }), { on: true }),
      Object.assign(num('Install errors', 'install_error'), { on: true }),
      Object.assign(num('Approved pending', 'approved_pending'), { opt: true }),
      Object.assign(num('Reboot required', 'reboot_required'), { opt: true }),
      Object.assign(num('No policy', 'no_policy'), { opt: true }),
      Object.assign(num('Unsupported OS', 'os_unsupported'), { opt: true, on: true }),
      Object.assign(num('Support ending soon', 'os_ending_soon'), { opt: true }),
      Object.assign(num('Reboot overdue', 'reboot_overdue'), { opt: true }),
      Object.assign(num('Oldest critical', 'oldest_critical_days', function (r) { return U.ageCell(r.oldest_critical_days); }), { opt: true, on: true }),
      Object.assign(num('Stale', 'devices_stale'), {}),
    ];
  }

  var SITE_CSV = [
    ['Site name', 'site_name'], ['Site UID', 'site_uid'], ['Autotask company ID', 'autotask_company_id'],
    ['Devices', 'devices_in_scope'], ['Compliance %', 'compliance_pct'], ['Coverage %', 'coverage_pct'],
    ['7-day change', 'change_7d'], ['Install errors', 'install_error'], ['Approved pending', 'approved_pending'],
    ['Reboot required', 'reboot_required'], ['No policy', 'no_policy'], ['Unsupported OS', 'os_unsupported'],
    ['Support ending soon', 'os_ending_soon'], ['Reboot overdue', 'reboot_overdue'],
    ['Oldest critical (days)', 'oldest_critical_days'], ['Stale', 'devices_stale'],
    ['Workstations', 'ws_devices_in_scope'], ['Workstation compliance %', 'ws_compliance_pct'], ['Workstation coverage %', 'ws_coverage_pct'],
    ['Workstation install errors', 'ws_install_error'], ['Workstation stale', 'ws_stale'],
    ['Servers', 'srv_devices_in_scope'], ['Server compliance %', 'srv_compliance_pct'], ['Server coverage %', 'srv_coverage_pct'],
    ['Server install errors', 'srv_install_error'], ['Server stale', 'srv_stale'],
  ].map(function (p) { return { label: p[0], value: function (r) { return r[p[1]]; } }; });

  // When drilled into Workstations / Servers, these base columns swap to that
  // device type's values (and say so in the header).
  function groupColumn(base, p) {
    var word = p === 'ws' ? 'Workstation' : 'Server';
    var map = {
      devices_in_scope: { field: p + '_devices_in_scope', label: p === 'ws' ? 'Workstations' : 'Servers' },
      compliance_pct: { field: p + '_compliance_pct', label: word + ' compliance %', render: function (r) { return U.complianceCell(r[p + '_compliance_pct']); } },
      coverage_pct: { field: p + '_coverage_pct', label: word + ' coverage %', render: function (r) { return U.fmtPct(r[p + '_coverage_pct']); } },
      install_error: { field: p + '_install_error', label: word + ' install errors' },
      devices_stale: { field: p + '_stale', label: word + ' stale' },
    };
    var m = map[base.key];
    return m ? Object.assign(num(m.label, m.field, m.render), { on: base.on }) : base;
  }

  function pendingColumns() {
    return [
      { key: 'kb', label: 'KB' },
      { key: 'title', label: 'Title', wrap: true },
      { key: 'severity', label: 'Severity', render: function (r) { return U.severityPill(r.severity); } },
      { key: 'devices', label: 'Devices', num: true, render: function (r) { return U.fmtInt(r.devices); } },
      { key: 'sites', label: 'Sites', num: true, render: function (r) { return U.fmtInt(r.sites); } },
    ];
  }

  function section(title, extra) {
    var head = el('h3', { class: 'pi-section-title' }, [title]);
    var body = el('div', {});
    if (extra) { head.appendChild(el('span', { class: 'pi-spacer' })); head.appendChild(extra); }
    return { root: el('section', { class: 'pi-section' }, [head, body]), body: body };
  }

  function renderHeader(headerHost, data) {
    U.clear(headerHost);
    headerHost.appendChild(el('h2', {}, ['Novem Patch Insights']));
    if (data) {
      headerHost.appendChild(el('span', { class: 'pi-sub' }, ['Data as of ' + U.fmtDate(data.as_of)]));
      if (!U.isFresh(data.as_of)) headerHost.appendChild(U.warnBadge('Data may be out of date'));
    }
  }

  // Returns { applyDrill(key, { scroll, url }) } or null when there are no
  // sites. A drill filters + sorts the table, forces its column visible and
  // highlights it, and shows a banner with a "Clear filter" action.
  function renderCustomers(host, sites, initialDrill) {
    U.clear(host);
    if (!sites.length) { host.appendChild(U.emptyPanel()); return null; }

    var search = el('input', { type: 'search', class: 'pi-search', placeholder: 'Search site name', 'aria-label': 'Search sites by name' });
    var count = el('span', { class: 'nat-muted' });
    var banner = el('div', { class: 'pi-drill-banner', role: 'status' });
    banner.hidden = true;
    var drill = null; // { key, ...DRILLS[key] }
    var defs = siteColumnDefs().filter(function (d) {
      return !d.opt || sites.some(function (s) { return s && s[d.key] !== undefined; });
    });
    var menu = U.columnMenu(defs, 'patch_insights_cols_overview', function () { table.setColumns(shown()); });
    function shown() {
      var list = defs.filter(function (d) { return menu.isVisible(d.key); });
      if (!drill || !drill.group) return list;
      var seen = {};
      return list.map(function (d) { return groupColumn(d, drill.group); }).filter(function (d) {
        if (seen[d.key]) return false;
        seen[d.key] = true;
        return true;
      });
    }
    var table = U.dataTable({
      columns: shown(),
      rows: sites,
      defaultSort: { key: 'compliance_pct', dir: 'asc' },
      noRowsText: 'No sites match your search.',
      rowLabel: function (r) { return 'Open ' + r.site_name; },
      onRowClick: function (r) {
        NAT_APP.goToTab('site', {
          selectedSite: { site_uid: r.site_uid, site_name: r.site_name, autotask_company_id: r.autotask_company_id },
          deviceFilter: drill && drill.device.length ? drill.device.join(',') : null,
        });
      },
    });

    function plural(n) { return n + (n === 1 ? ' customer' : ' customers'); }

    function apply() {
      var q = search.value.trim().toLowerCase();
      var base = sites;
      if (drill) {
        var f = drill.filterField || drill.field;
        base = sites.filter(function (s) { return s && drill.test(s[f]); });
      }
      var rows = q ? base.filter(function (s) { return String(s.site_name || '').toLowerCase().indexOf(q) !== -1; }) : base;
      table.setRows(rows);
      count.textContent = rows.length + ' of ' + sites.length + ' sites';
      U.clear(banner);
      banner.hidden = !drill;
      if (drill) {
        banner.appendChild(el('span', {}, ['Showing ' + plural(base.length) + (drill.group ? ' \u00B7 ' : ' with ') + drill.desc + ' \u00B7 ']));
        banner.appendChild(el('button', { type: 'button', class: 'nat-link-btn', onclick: function () { applyDrill(null, { url: true }); } }, ['Clear filter']));
      }
    }

    function applyDrill(key, o) {
      o = o || {};
      var d = key && U.DRILLS[key];
      drill = d ? Object.assign({ key: key }, d) : null;
      menu.setForced(d ? (d.base || d.field) : null);
      table.setColumns(shown());
      table.setHighlight(d ? d.field : null);
      table.sortBy(d ? d.field : 'compliance_pct', d ? d.dir : 'asc');
      apply();
      if (o.url) NAT_APP.setDrill(d ? key : null);
      if (d && o.scroll) {
        var target = host.parentNode || host;
        var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(function () { try { target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* non-fatal */ } }, 0);
      }
    }

    search.addEventListener('input', apply);
    apply();

    var exportBtn = U.exportButton(function () { return table.getRows(); }, SITE_CSV, function () { return 'patch-customers-' + U.todayIso() + '.csv'; });
    host.appendChild(el('div', { class: 'pi-toolbar' }, [search, count, el('span', { class: 'pi-spacer' }), menu.el, exportBtn]));
    host.appendChild(banner);
    host.appendChild(table.el);
    if (initialDrill && U.DRILLS[initialDrill]) applyDrill(initialDrill, { scroll: true });
    return { applyDrill: applyDrill };
  }

  function renderPending(host, items) {
    U.clear(host);
    if (!items.length) { host.appendChild(U.emptyPanel('No outstanding patches in the latest snapshot.')); return; }
    host.appendChild(U.dataTable({ columns: pendingColumns(), rows: items }).el);
  }

  function render(host, state, opts) {
    var my = ++token;
    var trendReq = 0;
    var data = null;
    var custApi = null;

    // Fill a section, or drop it when the data is missing (older responses).
    function fill(sec, node) {
      U.clear(sec.body);
      if (node) sec.body.appendChild(node);
      else if (sec.root.parentNode) sec.root.parentNode.removeChild(sec.root);
    }

    U.clear(host);
    var header = el('div', { class: 'pi-header' });
    var body = el('div', {});
    host.appendChild(header);
    host.appendChild(body);
    renderHeader(header, null);

    function trendSection() {
      var sec = section('Compliance and coverage trend');
      var toggleHost = el('span', {});
      sec.root.querySelector('h3').appendChild(el('span', { class: 'pi-spacer' }));
      sec.root.querySelector('h3').appendChild(toggleHost);
      return { sec: sec, toggleHost: toggleHost };
    }

    function load() {
      U.clear(body);
      var tiles = el('div', {}, [U.skelTiles()]);
      var ts = trendSection();
      ts.sec.body.appendChild(U.skelBlock('320px'));
      var st = section('Status breakdown');
      st.body.appendChild(U.skelBlock('120px'));
      var os = section('Operating systems');
      os.body.appendChild(U.skelTable(4));
      var cust = section('Customers');
      cust.body.appendChild(U.skelTable(8));
      var pend = section('Top outstanding patches');
      pend.body.appendChild(U.skelTable(5));
      [tiles, st.root, ts.sec.root, os.root, cust.root, pend.root].forEach(function (n) { body.appendChild(n); });
      renderHeader(header, null);

      var lastTrend = null;
      function drawToggles() {
        var avail = U.trendAvail(data && data.tiles);
        U.clear(ts.toggleHost);
        ts.toggleHost.appendChild(U.trendViewToggle(U.effectiveView(avail), function () { showTrend(lastTrend); }, avail));
        ts.toggleHost.appendChild(U.daysToggle(days, setDays));
      }

      function showTrend(trend, err) {
        lastTrend = trend;
        U.clear(ts.sec.body);
        drawToggles();
        if (err) { ts.sec.body.appendChild(U.errorPanel(err, function () { setDays(days, true); })); return; }
        var view = U.effectiveView(U.trendAvail(data && data.tiles));
        ts.sec.body.appendChild(trend && trend.length ? U.trendChart(trend, view) : U.emptyPanel());
      }

      function setDays(d, retry) {
        if (d === days && !retry) return;
        days = d;
        var req = ++trendReq;
        U.clear(ts.sec.body);
        ts.sec.body.appendChild(U.skelBlock('320px'));
        drawToggles();
        NAT_DATA.getOverview(d).then(function (res) {
          if (my !== token || req !== trendReq) return;
          showTrend(res && res.trend);
        }).catch(function (err) {
          if (my !== token || req !== trendReq) return;
          showTrend(null, U.errorMessage(err));
        });
      }

      NAT_DATA.getOverview(days).then(function (res) {
        if (my !== token) return;
        data = res;
        if (isEmpty(data)) {
          renderHeader(header, null);
          U.clear(body);
          body.appendChild(U.emptyPanel());
          return;
        }
        renderHeader(header, data);
        var sites = data.sites || [];
        // A drill is offered only if the sites list carries the field it needs.
        function drillOn(map) {
          var on = {};
          Object.keys(map).forEach(function (k) {
            var key = map[k], d = U.DRILLS[key];
            var f = d.filterField || d.field;
            if (sites.some(function (s) { return s && s[f] !== undefined; })) on[k] = function () { if (custApi) custApi.applyDrill(key, { scroll: true, url: true }); };
          });
          return on;
        }
        var HINT = 'View customers \u2192';
        var groupMap = {};
        Object.keys(U.DRILLS).forEach(function (k) { if (U.DRILLS[k].group) groupMap[k] = k; });
        U.clear(tiles);
        tiles.appendChild(U.kpiTiles(data.tiles, { hint: HINT, on: drillOn(U.TILE_DRILL) }));
        var groups = U.groupCards(data.tiles, { hint: HINT, on: drillOn(groupMap) });
        if (groups) tiles.appendChild(groups);
        var risk = U.riskTiles(data.risk, { hint: HINT, on: drillOn(U.RISK_DRILL) });
        if (risk) tiles.appendChild(risk);
        fill(st, U.statusBreakdown(data.status_breakdown, { hint: HINT, on: drillOn(U.STATUS_DRILL) }));
        fill(os, U.osPanel(data.os_breakdown));
        showTrend(data.trend);
        custApi = renderCustomers(cust.body, sites, state.drill);
        renderPending(pend.body, data.top_pending || []);
      }).catch(function (err) {
        if (my !== token) return;
        U.clear(body);
        body.appendChild(U.errorPanel(U.errorMessage(err), function () { load(); }));
      });
    }

    load();
  }

  NAT_APP.registerPage('overview', { render: render });
})();
