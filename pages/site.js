// ─────────────────────────────────────────────────────────────────────────────
// PAGE: Customer — one site's KPI tiles, status breakdown, trend, device
// table (with status chips, hide-stale toggle, hostname search) and top
// pending patches. Opened from an Overview row (state.selectedSite).
// Data: NAT_DATA.getSiteDetail(site_uid, days) -> the "site_detail" output.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  var U = NAT_UTIL;
  var el = U.el;
  var days = 30;
  var token = 0;

  function isEmpty(d) {
    return !d || (!(d.devices || []).length && !(d.trend || []).length && !(d.tiles && d.tiles.devices_in_scope));
  }

  function section(title) {
    var head = el('h3', { class: 'pi-section-title' }, [title]);
    var body = el('div', {});
    return { root: el('section', { class: 'pi-section' }, [head, body]), head: head, body: body };
  }

  // Builds the Autotask company URL from the config template. Returns null
  // while the {ZONE} placeholder is unset, or when the result isn't http(s).
  function autotaskUrl(id) {
    var tpl = typeof NAT_CONFIG !== 'undefined' && NAT_CONFIG.AUTOTASK_COMPANY_URL_TEMPLATE;
    if (!tpl || !id || tpl.indexOf('{ZONE}') !== -1) return null;
    return U.safeUrl(tpl.split('{id}').join(encodeURIComponent(String(id))));
  }

  function renderHeader(host, site, asOf) {
    U.clear(host);
    host.appendChild(el('div', { class: 'pi-back' }, [
      el('button', { type: 'button', class: 'nat-link-btn', onclick: function () { NAT_APP.goToTab('overview'); } }, ['\u2190 Back to overview']),
    ]));
    var row = el('div', { class: 'pi-header' }, [el('h2', {}, [(site && site.site_name) || 'Customer'])]);
    if (site && site.autotask_company_id) {
      var label = 'Autotask ID: ' + site.autotask_company_id;
      var href = autotaskUrl(site.autotask_company_id);
      row.appendChild(href
        ? el('a', { class: 'pi-sub pi-link', href: href, target: '_blank', rel: 'noopener noreferrer', title: 'Open company in Autotask' }, [label])
        : el('span', { class: 'pi-sub', title: 'Set the {ZONE} placeholder in AUTOTASK_COMPANY_URL_TEMPLATE (src/config.js) to link to Autotask' }, [label]));
    }
    if (asOf) {
      row.appendChild(el('span', { class: 'pi-sub' }, ['Data as of ' + U.fmtDate(asOf)]));
      if (!U.isFresh(asOf)) row.appendChild(U.warnBadge('Data may be out of date'));
    }
    host.appendChild(row);
  }

  function renderBreakdown(host, breakdown) {
    U.clear(host);
    host.appendChild(U.statusBreakdown(breakdown) || U.emptyPanel());
  }

  // ── Device helpers (all tolerant of missing fields) ─────────────────────
  function rebootDays(r) {
    var n = U.numOrNull(r.reboot_days);
    if (n !== null) return n;
    var t = Date.parse(r.last_reboot_utc || '');
    return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }
  function rebootOverdue(r) {
    var d = rebootDays(r);
    return (r.reboot_required === true || r.patch_status === 'RebootRequired') && d !== null && d >= 7;
  }
  function osUnsupported(r) { return String(r.os_lifecycle || '').toLowerCase() === 'unsupported'; }

  function deviceColumns(devices) {
    var hasFamily = devices.some(function (d) { return d.os_family != null || d.os_lifecycle != null; });
    var hasReboot = devices.some(function (d) { return d.last_reboot_utc != null || d.reboot_days != null; });
    var cols = [
      { key: 'hostname', label: 'Hostname', render: function (r) {
        var cell = el('span', {}, [r.hostname || '\u2014']);
        if (r.stale) cell.appendChild(el('span', { class: 'pi-tag' }, ['Stale']));
        return cell;
      } },
      { key: 'category', label: 'Category' },
      hasFamily
        ? { key: 'os_family', label: 'OS', sortValue: function (r) { return r.os_family || r.operating_system || null; }, render: function (r) {
          var cell = el('span', { title: r.operating_system || '' }, [r.os_family || r.operating_system || '\u2014']);
          if (r.os_lifecycle) { cell.appendChild(document.createTextNode(' ')); cell.appendChild(U.lifecyclePill(r.os_lifecycle)); }
          return cell;
        } }
        : { key: 'operating_system', label: 'OS' },
      { key: 'patch_status', label: 'Status', render: function (r) { return U.statusPill(r.patch_status); } },
      { key: 'patches_pending', label: 'Pending patches', num: true, render: function (r) { return U.fmtInt(r.patches_pending); } },
    ];
    if (hasReboot) {
      cols.push({ key: 'last_reboot_utc', label: 'Last reboot', sortValue: function (r) { var d = rebootDays(r); return d === null ? null : -d; }, firstDir: 'asc',
        render: function (r) {
          var d = rebootDays(r);
          var cell = el('span', { title: r.last_reboot_utc || '' }, [r.last_reboot_utc ? U.relTime(r.last_reboot_utc) : d === null ? '\u2014' : d + (d === 1 ? ' day ago' : ' days ago')]);
          if (rebootOverdue(r)) cell.appendChild(el('span', { class: 'pi-tag' }, ['Reboot overdue']));
          return cell;
        } });
    }
    cols.push(
      { key: 'last_seen_utc', label: 'Last seen', sortValue: function (r) { return Date.parse(r.last_seen_utc) || null; }, firstDir: 'desc',
        render: function (r) { return el('span', { title: r.last_seen_utc || '' }, [U.relTime(r.last_seen_utc)]); } },
      { key: 'online', label: 'Online', render: function (r) {
        return el('span', {}, [
          el('span', { class: 'pi-dot ' + (r.online ? 'pi-dot--on' : 'pi-dot--off'), 'aria-hidden': 'true' }),
          el('span', { class: 'pi-sr' }, [r.online ? 'Online' : 'Offline']),
        ]);
      } },
      { key: 'portal_url', label: 'Datto', sortable: false, render: function (r) {
        var url = U.safeUrl(r.portal_url);
        if (!url) return '\u2014';
        return el('a', { class: 'pi-link', href: url, target: '_blank', rel: 'noopener noreferrer', onclick: function (e) { e.stopPropagation(); } }, ['Open in Datto']);
      } }
    );
    return cols;
  }

  var DEVICE_CSV = [
    ['Hostname', function (r) { return r.hostname; }],
    ['Device UID', function (r) { return r.device_uid; }],
    ['Category', function (r) { return r.category; }],
    ['Operating system', function (r) { return r.operating_system; }],
    ['OS family', function (r) { return r.os_family; }],
    ['OS lifecycle', function (r) { return r.os_lifecycle; }],
    ['Patch status', function (r) { return r.patch_status; }],
    ['Pending patches', function (r) { return r.patches_pending; }],
    ['Reboot required', function (r) { return r.reboot_required; }],
    ['Last reboot (UTC)', function (r) { return r.last_reboot_utc; }],
    ['Days since reboot', rebootDays],
    ['Reboot overdue', function (r) { return rebootOverdue(r); }],
    ['Stale', function (r) { return r.stale; }],
    ['Online', function (r) { return r.online; }],
    ['Last seen (UTC)', function (r) { return r.last_seen_utc; }],
    ['Datto URL', function (r) { return r.portal_url; }],
  ].map(function (p) { return { label: p[0], value: p[1] }; });

  // Device-table filters a drill / tile can apply. type = Type control,
  // status = status chip, extra = extra chip.
  var FILTERS = {
    workstations: { kind: 'type', id: 'ws', label: 'Workstations' },
    servers: { kind: 'type', id: 'srv', label: 'Servers' },
    install_error: { kind: 'status', id: 'InstallError' },
    no_policy: { kind: 'status', id: 'NoPolicy' },
    approved_pending: { kind: 'status', id: 'ApprovedPending' },
    reboot_required: { kind: 'status', id: 'RebootRequired' },
    stale: { kind: 'extra', id: 'stale' },
    unsupported_os: { kind: 'extra', id: 'unsupported' },
    ending_soon: { kind: 'extra', id: 'ending' },
    reboot_overdue: { kind: 'extra', id: 'overdue' },
  };
  var TYPE_OPTIONS = [{ value: 'all', label: 'All' }, { value: 'ws', label: 'Workstations' }, { value: 'srv', label: 'Servers' }];

  function deviceType(d) {
    var c = String(d.category || '');
    if (/server/i.test(c)) return 'srv';
    if (/desktop|laptop|workstation/i.test(c)) return 'ws';
    return null;
  }

  // Set by renderDevices so the page's tiles/cards can drive the table.
  var deviceCtl = null;

  function renderDevices(host, devices, site, initialKeys) {
    U.clear(host);
    deviceCtl = null;
    if (!devices.length) { host.appendChild(U.emptyPanel()); return; }

    var type = 'all';
    var selected = {};
    var counts = {};
    devices.forEach(function (d) { counts[d.patch_status] = (counts[d.patch_status] || 0) + 1; });
    var extra = {
      unsupported: { label: 'Unsupported OS', color: 'var(--color-patch-error)', test: osUnsupported, on: false },
      ending: { label: 'Support ending soon', color: 'var(--color-patch-approved)', test: function (r) { return String(r.os_lifecycle || '').toLowerCase() === 'ending_soon'; }, on: false },
      overdue: { label: 'Reboot overdue', color: 'var(--color-patch-approved)', test: rebootOverdue, on: false },
      stale: { label: 'Stale only', color: 'var(--color-patch-nopolicy)', test: function (r) { return r.stale === true; }, on: false },
    };
    Object.keys(extra).forEach(function (k) { extra[k].count = devices.filter(extra[k].test).length; });
    var hideStale = false;
    var query = '';
    var noteKeys = null; // filter keys applied by a drill/tile (drives the "Filtered:" note)
    var chipEls = {};

    var summary = el('span', { class: 'nat-muted', 'aria-live': 'polite' });
    var table = U.dataTable({
      columns: deviceColumns(devices),
      rows: devices,
      noRowsText: 'No devices match the current filters.',
      rowClass: function (r) { return r.stale ? 'pi-stale' : ''; },
      onRowClick: openDrilldown,
    });

    function apply() {
      var any = Object.keys(selected).some(function (k) { return selected[k]; });
      var q = query.trim().toLowerCase();
      var rows = devices.filter(function (d) {
        if (type !== 'all' && deviceType(d) !== type) return false;
        if (any && !selected[d.patch_status]) return false;
        if (hideStale && d.stale) return false;
        if (q && String(d.hostname || '').toLowerCase().indexOf(q) === -1) return false;
        for (var k in extra) if (extra[k].on && !extra[k].test(d)) return false;
        return true;
      });
      table.setRows(rows);
      summary.textContent = rows.length + ' of ' + devices.length + ' devices';
    }

    var note = el('div', { class: 'pi-drill-banner', role: 'status' });
    note.hidden = true;
    var typeHost = el('span', {});
    var chips = el('div', { class: 'pi-toolbar', role: 'group', 'aria-label': 'Filter by status' });
    var staleBox = el('input', { type: 'checkbox' });

    function labelOf(key) {
      var f = FILTERS[key];
      if (f.kind === 'status') return U.STATUS_META[f.id].label;
      if (f.kind === 'extra') return extra[f.id].label;
      return f.label;
    }

    function drawNote() {
      U.clear(note);
      note.hidden = !noteKeys;
      if (!noteKeys) return;
      note.appendChild(el('span', {}, ['Filtered: ' + noteKeys.map(labelOf).join(' + ') + ' \u00B7 ']));
      note.appendChild(el('button', { type: 'button', class: 'nat-link-btn', onclick: function () { setFilters([], false); } }, ['Show all devices']));
    }

    function drawType() {
      U.clear(typeHost);
      typeHost.appendChild(el('span', { class: 'nat-muted pi-type-label' }, ['Type']));
      typeHost.appendChild(U.segmented('Device type', TYPE_OPTIONS, type, function (v) { type = v; userChanged(); }));
    }

    function syncControls() {
      Object.keys(chipEls).forEach(function (id) {
        var parts = id.split(':');
        var on = parts[0] === 'status' ? !!selected[parts[1]] : extra[parts[1]].on;
        chipEls[id].setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      staleBox.checked = hideStale;
      drawType();
      drawNote();
    }

    // Any manual filter change drops the drill note and the URL filter.
    function userChanged() {
      if (noteKeys) { noteKeys = null; NAT_APP.setDeviceFilter(null); }
      syncControls();
      apply();
    }

    function addChip(id, label, count, color, onToggle) {
      var chip = el('button', { type: 'button', class: 'pi-chip', style: '--pc:' + color, 'aria-pressed': 'false' }, [label + ' (' + count + ')']);
      chip.addEventListener('click', function () {
        onToggle(chip.getAttribute('aria-pressed') !== 'true');
        userChanged();
      });
      chipEls[id] = chip;
      chips.appendChild(chip);
    }
    function statusChip(k) {
      addChip('status:' + k, U.STATUS_META[k].label, counts[k] || 0, U.STATUS_META[k].color, function (on) { selected[k] = on; });
    }
    function extraChip(k) {
      addChip('extra:' + k, extra[k].label, extra[k].count, extra[k].color, function (on) { extra[k].on = on; });
    }
    U.STATUS_ORDER.forEach(function (k) { if (counts[k]) statusChip(k); });
    Object.keys(extra).forEach(function (k) { if (extra[k].count) extraChip(k); });

    // Replaces all type/chip filters. keys = FILTERS keys; asNote shows the
    // "Filtered:" note and records the keys in the URL.
    function setFilters(keys, asNote) {
      type = 'all'; selected = {};
      Object.keys(extra).forEach(function (k) { extra[k].on = false; });
      keys.forEach(function (key) {
        var f = FILTERS[key];
        if (!f) return;
        if (f.kind === 'type') type = f.id;
        else if (f.kind === 'status') { selected[f.id] = true; if (!chipEls['status:' + f.id]) statusChip(f.id); }
        else { extra[f.id].on = true; if (f.id === 'stale') hideStale = false; if (!chipEls['extra:' + f.id]) extraChip(f.id); }
      });
      noteKeys = asNote && keys.length ? keys : null;
      NAT_APP.setDeviceFilter(noteKeys, asNote);
      syncControls();
      apply();
    }

    staleBox.addEventListener('change', function () { hideStale = staleBox.checked; apply(); });
    var search = el('input', { type: 'search', class: 'pi-search', placeholder: 'Search hostname', 'aria-label': 'Search devices by hostname' });
    search.addEventListener('input', function () { query = search.value; apply(); });

    var exportBtn = U.exportButton(function () { return table.getRows(); }, DEVICE_CSV, function () {
      return 'patch-devices-' + U.slug(site && site.site_name) + '-' + U.todayIso() + '.csv';
    });

    var hasTypes = devices.some(function (d) { return deviceType(d) !== null; });
    var typeRow = el('div', { class: 'pi-toolbar' }, [typeHost]);
    if (hasTypes) host.appendChild(typeRow);
    host.appendChild(chips);
    host.appendChild(el('div', { class: 'pi-toolbar' }, [
      search,
      el('label', { class: 'pi-check' }, [staleBox, 'Hide stale']),
      el('span', { class: 'pi-spacer' }),
      summary,
      exportBtn,
    ]));
    host.appendChild(note);
    host.appendChild(table.el);

    deviceCtl = {
      apply: function (keys) {
        setFilters(keys, true);
        var target = host.parentNode || host;
        var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(function () { try { target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* non-fatal */ } }, 0);
      },
    };

    var start = (initialKeys || []).filter(function (k) { return FILTERS[k]; });
    syncControls();
    if (start.length) setFilters(start, true);
    else apply();
  }

  function renderPending(host, items) {
    U.clear(host);
    if (!items.length) { host.appendChild(U.emptyPanel('No outstanding patches for this site.')); return; }
    host.appendChild(U.dataTable({
      columns: [
        { key: 'kb', label: 'KB' },
        { key: 'title', label: 'Title', wrap: true },
        { key: 'severity', label: 'Severity', render: function (r) { return U.severityPill(r.severity); } },
        { key: 'devices', label: 'Devices', num: true, render: function (r) { return U.fmtInt(r.devices); } },
      ],
      rows: items,
    }).el);
  }

  // ── Device drill-down side panel ────────────────────────────────────────
  // Opens over the page (no navigation). Calls NAT_DATA.getDeviceDrilldown,
  // which goes live to Datto, so the loading state says so.
  var panel = null;

  function closePanel() {
    if (!panel) return;
    document.removeEventListener('keydown', panel.onKey);
    if (panel.overlay.parentNode) panel.overlay.parentNode.removeChild(panel.overlay);
    if (panel.root.parentNode) panel.root.parentNode.removeChild(panel.root);
    var opener = panel.opener;
    panel = null;
    if (opener && opener.focus) opener.focus();
  }

  function toMs(v) {
    if (typeof v === 'number') return v;
    if (/^\d{10,}$/.test(String(v || ''))) return Number(v);
    return Date.parse(v || '');
  }

  function fmtIsoDate(iso) {
    var t = toMs(iso);
    if (isNaN(t)) return '\u2014';
    var d = new Date(t);
    return U.fmtDate('' + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0'));
  }

  function fmtIsoDateTime(iso) {
    var t = toMs(iso);
    if (isNaN(t)) return '\u2014';
    var d = new Date(t);
    return fmtIsoDate(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function patchTable(items, emptyText) {
    if (!items.length) return U.emptyPanel(emptyText);
    return U.dataTable({
      columns: [
        { key: 'kb', label: 'KB', render: function (r) { return txt(r.kb, '\u2014'); } },
        { key: 'title', label: 'Title', wrap: true, render: function (r) { return txt(r.title, '\u2014'); } },
        { key: 'severity', label: 'Severity', render: function (r) { return U.severityPill(typeof r.severity === 'string' ? r.severity : null); } },
        { key: 'release_date', label: 'Release date', sortValue: function (r) { return toMs(r.release_date) || null; },
          firstDir: 'desc', render: function (r) { return fmtIsoDate(r.release_date); } },
        { key: 'reboot_required', label: 'Reboot required', sortValue: function (r) { return bool(r.reboot_required) ? 1 : 0; },
          render: function (r) { return bool(r.reboot_required) ? 'Yes' : 'No'; } },
      ],
      rows: items,
    }).el;
  }

  function list(v) {
    return Array.isArray(v) ? v.filter(function (x) { return x && typeof x === 'object'; }) : [];
  }

  function bool(v) {
    return typeof v === 'string' ? v.trim().toLowerCase() === 'true' : !!v;
  }

  function txt(v, fallback) {
    var s = v == null || v === '' ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    return s || fallback || '';
  }

  function renderDrilldown(host, data, device) {
    U.clear(host);
    data = data && typeof data === 'object' ? data : {};
    var d = data.device && typeof data.device === 'object' ? data.device : {};
    var pending = list(data.pending_patches);
    var notApproved = list(data.not_approved_patches);
    var policies = list(data.policies);
    var online = bool(d.online);

    var meta = el('div', { class: 'pi-panel-meta' }, [
      U.statusPill(d.patch_status),
      el('span', {}, [
        el('span', { class: 'pi-dot ' + (online ? 'pi-dot--on' : 'pi-dot--off'), 'aria-hidden': 'true' }),
        online ? 'Online' : 'Offline',
      ]),
      el('span', {}, ['Last seen: ' + U.relTime(d.last_seen_utc)]),
      el('span', {}, ['Last audit: ' + fmtIsoDateTime(d.last_audit_utc)]),
    ]);
    host.appendChild(meta);
    var sub = [d.site_name, d.operating_system].filter(Boolean).map(function (x) { return txt(x); }).join(' \u00B7 ');
    if (sub) host.appendChild(el('p', { class: 'nat-muted' }, [sub]));
    var url = U.safeUrl(txt(d.portal_url) || txt(device && device.portal_url));
    if (url) host.appendChild(el('p', {}, [el('a', { class: 'nat-btn nat-btn--primary', href: url, target: '_blank', rel: 'noopener noreferrer' }, ['Open in Datto'])]));

    if (!pending.length && !notApproved.length && !policies.length && data.policy_count == null) {
      host.appendChild(U.emptyPanel('No patch details were returned for this device.'));
      return;
    }

    host.appendChild(el('h3', {}, ['Pending patches (' + pending.length + ')']));
    host.appendChild(patchTable(pending, 'No pending patches for this device.'));

    var details = el('details', {}, [
      el('summary', {}, ['Not approved (' + notApproved.length + ')']),
      patchTable(notApproved, 'No unapproved patches for this device.'),
    ]);
    host.appendChild(details);

    host.appendChild(el('h3', {}, ['Patch policies']));
    var count = Number(data.policy_count);
    if (data.policy_count == null || data.policy_count === '' || !isFinite(count)) count = policies.length;
    if (count === 0 && !policies.length) {
      host.appendChild(el('p', { class: 'pi-warn-badge', role: 'status' }, ['\u26A0 No patch policy targets this device']));
    } else {
      if (count > 1) {
        host.appendChild(el('p', { class: 'pi-warn-badge', role: 'status' }, ['\u26A0 This device is targeted by ' + count + ' patch policies. Their schedules and approval rules may overlap.']));
      }
      var ul = el('ul', { class: 'pi-policies' });
      policies.forEach(function (p) { ul.appendChild(policyItem(p)); });
      host.appendChild(ul);
    }
  }

  function titleCase(s) {
    return String(s).toLowerCase().replace(/(^|[\s_-])(\w)/g, function (m, a, b) { return (a === '_' || a === '-' ? ' ' : a) + b.toUpperCase(); });
  }

  function dayLabels(v) {
    var s = txt(v);
    if (!s) return '';
    var map = (typeof NAT_CONFIG !== 'undefined' && NAT_CONFIG.DAY_OF_WEEK_LABELS) || {};
    return s.split(',').map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) {
      return Object.prototype.hasOwnProperty.call(map, x) && map[x] ? String(map[x]) : 'Day ' + x;
    }).join(', ');
  }

  function windowLabel(v) {
    if (v == null || v === '' || typeof v === 'boolean') return '';
    var m = Number(v);
    if (!isFinite(m)) return '';
    return String(Math.round(m / 60 * 10) / 10) + 'h window';
  }

  function policyItem(p) {
    var head = [el('span', { class: 'pi-policy-name' }, [txt(p.policy_name, 'Unnamed policy')])];
    var level = txt(p.level);
    var owner = txt(p.owner_site);
    if (level) head.push(el('span', { class: 'pi-tag' }, [/^site$/i.test(level) && owner ? 'Site: ' + owner : level]));
    if (p.enabled != null && !bool(p.enabled)) head.push(el('span', { class: 'pi-tag' }, ['Disabled']));

    var rows = [el('div', { class: 'pi-policy-head' }, head)];
    var sched = [txt(p.schedule_type) ? titleCase(txt(p.schedule_type)) : '', dayLabels(p.days_of_week), txt(p.start_time), windowLabel(p.window_minutes)].filter(Boolean);
    if (sched.length) rows.push(el('div', {}, [sched.join(', ')]));

    var reboot = [];
    if (txt(p.reboot_prompt)) reboot.push('Reboot prompt: ' + txt(p.reboot_prompt));
    if (bool(p.force_reboot)) reboot.push('Forced reboot');
    if (bool(p.wake_devices)) reboot.push('Wakes devices');
    if (bool(p.audit_only)) reboot.push('Audit only');
    if (reboot.length) rows.push(el('div', {}, [reboot.join(', ')]));

    var upd = txt(p.last_updated);
    if (upd) rows.push(el('div', { class: 'nat-muted pi-policy-meta' }, ['Last updated ' + upd + (txt(p.updated_by) ? ' by ' + txt(p.updated_by) : '')]));
    return el('li', {}, rows);
  }

  function openDrilldown(device) {
    closePanel();
    var opener = document.activeElement;
    var seq = 0;
    var overlay = el('div', { class: 'pi-panel-overlay', onclick: closePanel });
    var content = el('div', {});
    var closeBtn = el('button', { type: 'button', class: 'nat-btn', 'aria-label': 'Close panel', onclick: closePanel }, ['Close']);
    var root = el('aside', { class: 'pi-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Device patch details: ' + (device.hostname || '') }, [
      el('div', { class: 'pi-panel-head' }, [el('h2', {}, [device.hostname || 'Device']), closeBtn]),
      content,
    ]);
    function onKey(e) { if (e.key === 'Escape') closePanel(); }
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    document.body.appendChild(root);
    panel = { root: root, overlay: overlay, onKey: onKey, opener: opener };
    closeBtn.focus();

    function load() {
      var my = ++seq;
      U.clear(content);
      content.appendChild(el('p', { class: 'pi-fetch-note', role: 'status' }, ['Fetching live from Datto\u2026']));
      content.appendChild(U.skelBlock('60px'));
      content.appendChild(U.skelTable(4));
      NAT_DATA.getDeviceDrilldown(device.device_uid).then(function (data) {
        if (!panel || panel.root !== root || my !== seq) return;
        try {
          renderDrilldown(content, data, device);
        } catch (e) {
          console.error('[drilldown render]', e, data);
          U.clear(content);
          content.appendChild(U.errorPanel('Could not display this device.', load));
        }
      }, function (err) {
        if (!panel || panel.root !== root || my !== seq) return;
        U.clear(content);
        content.appendChild(U.errorPanel(U.errorMessage(err), load));
      });
    }
    load();
  }

  function render(host, state, opts) {
    closePanel();
    var my = ++token;
    var trendReq = 0;
    var site = state.selectedSite;

    if (!site || !site.site_uid) { NAT_APP.goToTab('overview'); return; }

    U.clear(host);
    var header = el('div', {});
    var body = el('div', {});
    host.appendChild(header);
    host.appendChild(body);

    function load() {
      renderHeader(header, site, null);
      U.clear(body);
      var tiles = el('div', {}, [U.skelTiles()]);
      var status = section('Status breakdown');
      status.body.appendChild(U.skelBlock('120px'));
      var trend = section('Compliance and coverage trend');
      trend.body.appendChild(U.skelBlock('320px'));
      var os = section('Operating systems');
      os.body.appendChild(U.skelTable(4));
      var devs = section('Devices');
      devs.body.appendChild(U.skelTable(8));
      var pend = section('Top pending patches');
      pend.body.appendChild(U.skelTable(5));
      [tiles, status.root, trend.root, os.root, devs.root, pend.root].forEach(function (n) { body.appendChild(n); });

      var toggleHost = el('span', {});
      trend.head.appendChild(el('span', { class: 'pi-spacer' }));
      trend.head.appendChild(toggleHost);

      var lastTrend = null, curTiles = null;
      function drawToggles() {
        var avail = U.trendAvail(curTiles);
        U.clear(toggleHost);
        toggleHost.appendChild(U.trendViewToggle(U.effectiveView(avail), function () { showTrend(lastTrend); }, avail));
        toggleHost.appendChild(U.daysToggle(days, setDays));
      }

      function showTrend(points, err) {
        lastTrend = points;
        U.clear(trend.body);
        drawToggles();
        if (err) { trend.body.appendChild(U.errorPanel(err, function () { setDays(days, true); })); return; }
        var view = U.effectiveView(U.trendAvail(curTiles));
        trend.body.appendChild(points && points.length ? U.trendChart(points, view) : U.emptyPanel());
      }

      function setDays(d, retry) {
        if (d === days && !retry) return;
        days = d;
        var req = ++trendReq;
        U.clear(trend.body);
        trend.body.appendChild(U.skelBlock('320px'));
        drawToggles();
        NAT_DATA.getSiteDetail(site.site_uid, d).then(function (res) {
          if (my !== token || req !== trendReq) return;
          showTrend(res && res.trend);
        }).catch(function (err) {
          if (my !== token || req !== trendReq) return;
          showTrend(null, U.errorMessage(err));
        });
      }

      NAT_DATA.getSiteDetail(site.site_uid, days).then(function (data) {
        if (my !== token) return;
        if (data && data.site && data.site.site_uid) site = data.site;
        curTiles = data && data.tiles;
        if (isEmpty(data)) {
          renderHeader(header, site, data && data.as_of);
          U.clear(body);
          body.appendChild(U.emptyPanel());
          return;
        }
        renderHeader(header, site, data.as_of);
        // Customer-view tiles/cards apply device filters on this page.
        var HINT = 'Filter devices \u2192';
        function filterOn(map) {
          var on = {};
          Object.keys(map).forEach(function (k) {
            on[k] = function () { if (deviceCtl) deviceCtl.apply(map[k]); };
          });
          return on;
        }
        U.clear(tiles);
        tiles.appendChild(U.kpiTiles(data.tiles, { hint: HINT, on: filterOn({ install_error: ['install_error'], devices_stale: ['stale'] }) }));
        var groups = U.groupCards(data.tiles, { hint: HINT, on: filterOn({ ws_card: ['workstations'], srv_card: ['servers'] }) });
        if (groups) tiles.appendChild(groups);
        var risk = U.riskTiles(data.risk, { hint: HINT, on: filterOn({ os_unsupported: ['unsupported_os'], os_ending_soon: ['ending_soon'], reboot_overdue: ['reboot_overdue'] }) });
        if (risk) tiles.appendChild(risk);
        renderBreakdown(status.body, data.status_breakdown);
        showTrend(data.trend);
        var osNode = U.osPanel(data.os_breakdown);
        if (osNode) { U.clear(os.body); os.body.appendChild(osNode); }
        else if (os.root.parentNode) os.root.parentNode.removeChild(os.root);
        renderDevices(devs.body, data.devices || [], site, (state.deviceFilter || '').split(',').filter(Boolean));
        renderPending(pend.body, data.top_pending || []);
      }).catch(function (err) {
        if (my !== token) return;
        U.clear(body);
        body.appendChild(U.errorPanel(U.errorMessage(err), function () { load(); }));
      });
    }

    load();
  }

  NAT_APP.registerPage('site', { render: render });
})();
