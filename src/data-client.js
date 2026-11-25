// ─────────────────────────────────────────────────────────────────────────────
// DATA CLIENT — Rewst App Builder Starter Template
// Implements: trigger workflow -> poll workflowExecutions -> read
// conductor.output.<outputKey> once terminal (terminal-status allowlist,
// 90s cap, partial-response handling, sessionStorage caching keyed by
// date). This file is generic and tenant-agnostic — it reads everything it
// needs from NAT_CONFIG (see src/config.js) and should not need editing
// when you start a new portal from this template.
//
// createWorkflowClient() is a factory: call it once per Rewst workflow your
// app calls, each with its own workflow ID, output key, and (optionally)
// its own sessionStorage cache-key prefix. Multiple clients built from this
// factory run fully independently of one another — nothing below this
// point is shared between instances except two things that are safe and
// intentional to share: org-ID resolution (same visiting user/org serves
// every client) and the conductorFieldSupported capability flag (a
// property of the GraphQL API itself, not of any one workflow).
//
// No Jinja-collision risk: all GraphQL uses single braces, and no literal
// double-brace / percent-brace sequences appear anywhere below.
// ─────────────────────────────────────────────────────────────────────────────

var NAT_DATA;

(function () {
  'use strict';

  // Explicit allowlist — REQUESTED is a pre-running state, not terminal.
  // Rewst's real statusEnum values observed in practice use SUCCEEDED (not
  // COMPLETED) for a successful run; both are accepted for the "success"
  // case in case the API is inconsistent across workflow types.
  var TERMINAL_SUCCESS_STATUSES = ['SUCCEEDED', 'COMPLETED'];
  var TERMINAL_FAILURE_STATUSES = ['FAILED', 'TERMINATED', 'TIMED_OUT'];
  var TERMINAL_STATUSES = TERMINAL_SUCCESS_STATUSES.concat(TERMINAL_FAILURE_STATUSES);

  // Shared across every workflow client — see header comment above. Flips
  // to false if a partial-response error targets "conductor".
  var conductorFieldSupported = true;

  function todayKey() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return '' + y + m + day;
  }

  function graphql(query, variables) {
    return fetch('/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query, variables: variables }),
    }).then(function (res) {
      if (!res.ok) {
        throw new Error('GraphQL request failed with status ' + res.status);
      }
      return res.json();
    });
  }

  // Turns a GraphQL response's top-level "errors" array (if present) into a
  // short readable string, so a 200-OK response that still failed server-
  // side (bad pageId/orgId pairing, workflow not bound to the page, missing
  // permission, etc.) doesn't get swallowed into a generic message.
  function describeGraphQLErrors(json) {
    if (!json || !Array.isArray(json.errors) || json.errors.length === 0) return '';
    return json.errors.map(function (e) { return e && e.message ? e.message : String(e); }).join('; ');
  }

  function hasConductorPathError(json) {
    if (!json || !json.errors) return false;
    return json.errors.some(function (err) {
      return Array.isArray(err.path) && err.path.some(function (seg) {
        return String(seg).indexOf('conductor') !== -1;
      });
    });
  }

  // ── Org ID resolution ────────────────────────────────────────────────────
  // The visiting user's org ID varies per user/session, so it cannot be a
  // static config constant (and must not be read via Jinja). Resolve it once
  // via GraphQL, matching the pattern used elsewhere in the Rewst portals,
  // then cache in-memory and in sessionStorage so subsequent triggers/polls
  // (and reloads within the same tab) don't pay for a second round trip.
  // Shared by every workflow client — every call runs as the same visiting
  // user, so there is only ever one org ID to resolve.
  var ORG_ID_STORAGE_KEY = 'nat_resolved_org_id';
  var resolvedOrgId = null;
  var resolvingOrgIdPromise = null;

  var CURRENT_ORG_QUERY = 'query getUserOrganization { userOrganization { id } }';

  function getOrgId() {
    if (resolvedOrgId) return Promise.resolve(resolvedOrgId);

    try {
      var cached = sessionStorage.getItem(ORG_ID_STORAGE_KEY);
      if (cached) {
        resolvedOrgId = cached;
        return Promise.resolve(cached);
      }
    } catch (e) { /* sessionStorage unavailable — fall through to network */ }

    if (resolvingOrgIdPromise) return resolvingOrgIdPromise;

    resolvingOrgIdPromise = graphql(CURRENT_ORG_QUERY, {}).then(function (json) {
      var id = json && json.data && json.data.userOrganization && json.data.userOrganization.id;
      if (!id) {
        var detail = describeGraphQLErrors(json);
        throw new Error('Could not resolve the current organization ID.' + (detail ? ' ' + detail : ''));
      }
      resolvedOrgId = id;
      try { sessionStorage.setItem(ORG_ID_STORAGE_KEY, id); } catch (e) { /* non-fatal */ }
      return id;
    }).finally(function () {
      resolvingOrgIdPromise = null;
    });

    return resolvingOrgIdPromise;
  }

  // ── Logged-in user (best-effort) ─────────────────────────────────────────
  // Optional helper for any page that wants to pre-fill the current user's
  // name (e.g. a review/approval form). Never rejects — any failure just
  // resolves null, so a page module can treat "no logged-in user available"
  // as a normal case and fall back to asking.
  var resolvedUsername = null;
  var resolvingUsernamePromise = null;
  var CURRENT_USER_QUERY = 'query getMe { me { id username } }';

  function getCurrentUsername() {
    if (resolvedUsername) return Promise.resolve(resolvedUsername);
    if (resolvingUsernamePromise) return resolvingUsernamePromise;

    resolvingUsernamePromise = graphql(CURRENT_USER_QUERY, {}).then(function (json) {
      var username = json && json.data && json.data.me && json.data.me.username;
      resolvedUsername = username || null;
      return resolvedUsername;
    }).catch(function () {
      return null;
    }).finally(function () {
      resolvingUsernamePromise = null;
    });

    return resolvingUsernamePromise;
  }

  var TRIGGER_MUTATION =
    'mutation Trigger($id: ID!, $pageId: ID!, $orgId: ID!, $input: JSON) {' +
    '  executeWorkflowFromPage(id: $id, pageId: $pageId, orgId: $orgId, input: $input) {' +
    '    executionId' +
    '  }' +
    '}';

  function statusQuery(includeConductor) {
    var fields = 'id status statusEnum numSuccessfulTasks';
    if (includeConductor) fields += ' conductor { output }';
    return (
      'query ExecStatus($id: ID!, $orgId: ID!) {' +
      '  workflowExecutions(where: { id: $id, orgId: $orgId }) {' +
      '    ' + fields +
      '  }' +
      '}'
    );
  }

  // Builds one independent workflow client: its own workflow ID, its own
  // output key to read the result from, and (optionally) its own
  // sessionStorage cache key prefix. Two clients built from this factory
  // can trigger, poll and cache fully in parallel — nothing below this
  // point is shared between instances (only the module-level helpers above
  // are shared, and those are safe to share — see the file header comment).
  //
  // `cacheKeyPrefix` is optional. When omitted (e.g. the drill-through
  // ticket lookup, which is keyed on {start,end,team,metric,value} rather
  // than "once per day"), caching is a no-op here and getPayload() always
  // fetches fresh — callers that need per-parameter caching keep their own
  // in-memory cache instead.
  function createWorkflowClient(clientOptions) {
    var workflowId     = clientOptions.workflowId;
    var outputKey       = clientOptions.outputKey;
    var cacheKeyPrefix = clientOptions.cacheKeyPrefix;
    // When true, and neither output[outputKey] nor output.result is present,
    // fall back to using the whole conductor.output object as the payload.
    // Useful for a "fire and forget" write-style workflow whose real
    // conductor.output shape hasn't been observed yet (e.g. a workflow that
    // just returns "{ok: true}") — this avoids the call hanging/erroring if
    // the workflow returns the object directly with no wrapper key, without
    // changing behaviour for any other client.
    var rawOutputFallback = !!clientOptions.rawOutputFallback;

    // `suffix` lets a single client cache more than one thing per day —
    // e.g. a client that's re-triggered with different filter input
    // (dates, team, etc.) whenever those filters change needs its own
    // cache slot per combination, to avoid serving one filter combo's
    // payload under another's. Omitted by callers that only ever fetch one
    // thing per day.
    function cacheKey(suffix) {
      return cacheKeyPrefix + todayKey() + (suffix ? '_' + suffix : '');
    }

    function readCache(suffix) {
      if (!cacheKeyPrefix) return null;
      try {
        var raw = sessionStorage.getItem(cacheKey(suffix));
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    function writeCache(payload, suffix) {
      if (!cacheKeyPrefix) return;
      try {
        sessionStorage.setItem(cacheKey(suffix), JSON.stringify(payload));
      } catch (e) {
        // sessionStorage unavailable/full — non-fatal, just skip caching.
      }
    }

    function clearCache(suffix) {
      if (!cacheKeyPrefix) return;
      try {
        sessionStorage.removeItem(cacheKey(suffix));
      } catch (e) { /* noop */ }
    }

    function triggerWorkflow(input) {
      return getOrgId().then(function (orgId) {
        return graphql(TRIGGER_MUTATION, {
          id: workflowId,
          pageId: NAT_CONFIG.PAGE_ID,
          orgId: orgId,
          input: input || {},
        });
      })
        .then(function (json) {
          var executionId = json && json.data && json.data.executeWorkflowFromPage &&
            json.data.executeWorkflowFromPage.executionId;
          if (!executionId) {
            var detail = describeGraphQLErrors(json);
            throw new Error('No execution ID returned when triggering the workflow.' + (detail ? ' ' + detail : ''));
          }
          return executionId;
        });
    }

    function pollOnce(executionId) {
      var query = statusQuery(conductorFieldSupported);
      return getOrgId().then(function (orgId) {
        return graphql(query, { id: executionId, orgId: orgId });
      }).then(function (json) {
        if (conductorFieldSupported && hasConductorPathError(json)) {
          // Partial response: a row resolved but conductor was refused.
          // Drop conductor from the query going forward and keep polling status.
          conductorFieldSupported = false;
          return { partial: true, execution: null };
        }
        var list = (json && json.data && json.data.workflowExecutions) || [];
        var execution = list[0] || null;
        return { partial: false, execution: execution };
      });
    }

    // `elapsed`/`timedOut` live inside this per-call Promise executor, so
    // concurrent polls from different clients never share a timer or a
    // timeout flag.
    function waitForCompletion(executionId, onProgress) {
      return new Promise(function (resolve, reject) {
        var elapsed = 0;
        var timedOut = false;

        function tick() {
          if (timedOut) return;
          elapsed += NAT_CONFIG.POLL_INTERVAL_MS;

          pollOnce(executionId).then(function (result) {
            if (timedOut) return;

            if (result.partial) {
              if (onProgress) {
                onProgress({ status: 'running', numSuccessfulTasks: null, degraded: true });
              }
            } else {
              var execution = result.execution;
              if (!execution) {
                if (onProgress) onProgress({ status: 'unknown', numSuccessfulTasks: null });
              } else {
                if (onProgress) {
                  onProgress({
                    status: execution.status,
                    numSuccessfulTasks: execution.numSuccessfulTasks,
                  });
                }

                var isTerminal = TERMINAL_STATUSES.indexOf(execution.statusEnum) !== -1;
                if (isTerminal) {
                  var succeeded = TERMINAL_SUCCESS_STATUSES.indexOf(execution.statusEnum) !== -1;
                  if (!succeeded) {
                    reject(new Error('Workflow execution ended with status ' + execution.statusEnum + '.'));
                    return;
                  }
                  var output = execution.conductor && execution.conductor.output;
                  // "result" is also accepted as a fallback key in case a
                  // workflow uses that generic name instead of its own.
                  var payload = output && (output[outputKey] || output.result);
                  if (!payload && rawOutputFallback && output && typeof output === 'object') {
                    payload = output;
                  }
                  if (!payload) {
                    if (!conductorFieldSupported) {
                      reject(new Error(
                        'Workflow completed but result data was unavailable (conductor field was refused by the API).'
                      ));
                      return;
                    }
                    // Completed but result not populated yet on this tick — keep polling briefly.
                  } else {
                    resolve(payload);
                    return;
                  }
                }
              }
            }

            if (elapsed >= NAT_CONFIG.POLL_TIMEOUT_MS) {
              timedOut = true;
              reject(new Error('TIMEOUT'));
              return;
            }
            setTimeout(tick, NAT_CONFIG.POLL_INTERVAL_MS);
          }).catch(function (err) {
            if (timedOut) return;
            if (elapsed >= NAT_CONFIG.POLL_TIMEOUT_MS) {
              timedOut = true;
              reject(new Error('TIMEOUT'));
              return;
            }
            // Transient fetch error mid-poll — retry rather than fail hard.
            setTimeout(tick, NAT_CONFIG.POLL_INTERVAL_MS);
          });
        }

        setTimeout(tick, NAT_CONFIG.POLL_INTERVAL_MS);
      });
    }

    // Runs trigger + poll, always writing a fresh cache entry on success.
    function fetchFresh(input, onProgress, suffix) {
      conductorFieldSupported = true;
      if (onProgress) onProgress({ status: 'REQUESTED', numSuccessfulTasks: 0 });
      return triggerWorkflow(input).then(function (executionId) {
        return waitForCompletion(executionId, onProgress);
      }).then(function (payload) {
        writeCache(payload, suffix);
        return payload;
      });
    }

    // Public API: returns cached payload if present for today, otherwise
    // triggers + polls. `forceRefresh` bypasses the cache (Refresh button).
    // `input` is passed through to the workflow trigger (e.g. { days: 90 });
    // defaults to {}.
    // `cacheSuffix` namespaces the cache slot when a client can be called
    // with more than one distinct input per day (see the comment on
    // cacheKey() above) — omitted by callers that only ever fetch one
    // thing per day.
    function getPayload(getOptions) {
      getOptions = getOptions || {};
      var onProgress = getOptions.onProgress;
      var input = getOptions.input || {};
      var suffix = getOptions.cacheSuffix;
      if (!getOptions.forceRefresh) {
        var cached = readCache(suffix);
        if (cached) return Promise.resolve(cached);
      } else {
        clearCache(suffix);
      }
      return fetchFresh(input, onProgress, suffix);
    }

    return {
      getPayload: getPayload,
      clearCache: clearCache,
    };
  }

  // One client per Rewst workflow, each with its own outputKey and
  // cacheKeyPrefix so their sessionStorage caches never collide.
  var overviewClient = createWorkflowClient({
    workflowId: NAT_CONFIG.REWST_WORKFLOW_ID_PATCH_OVERVIEW,
    outputKey: 'overview',
    cacheKeyPrefix: NAT_CONFIG.CACHE_KEY_PREFIX + 'getOverview_',
    rawOutputFallback: true,
  });
  var siteDetailClient = createWorkflowClient({
    workflowId: NAT_CONFIG.REWST_WORKFLOW_ID_PATCH_SITE_DETAIL,
    outputKey: 'site_detail',
    cacheKeyPrefix: NAT_CONFIG.CACHE_KEY_PREFIX + 'getSiteDetail_',
    rawOutputFallback: true,
  });
  var drilldownClient = createWorkflowClient({
    workflowId: NAT_CONFIG.REWST_WORKFLOW_ID_PATCH_DEVICE_DRILLDOWN,
    outputKey: 'drilldown',
    cacheKeyPrefix: NAT_CONFIG.CACHE_KEY_PREFIX + 'getDeviceDrilldown_',
    rawOutputFallback: true,
  });

  // ── Unwrap + normalise ───────────────────────────────────────────────────
  // The payload may arrive as { key: {...} }, { result: { key: {...} } },
  // { result: {...} }, the object itself, or a JSON string of any of those.
  function parseIfString(v) {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch (e) { return v; }
  }

  function unwrap(payload, key) {
    var p = parseIfString(payload);
    for (var depth = 0; depth < 4 && p && typeof p === 'object' && !Array.isArray(p); depth++) {
      if (p[key] != null) return parseIfString(p[key]);
      if (p.result != null) p = parseIfString(p.result);
      else break;
    }
    return p;
  }

  var BOOL_KEYS = { stale: 1, online: 1, enabled: 1, reboot_required: 1 };

  function toBool(v) {
    if (typeof v === 'string') return v.trim().toLowerCase() === 'true';
    return !!v;
  }

  // Epoch ms (number or numeric string) or ISO string -> ISO string, else null.
  function toIso(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : (/^\d{10,}$/.test(String(v)) ? Number(v) : NaN);
    var d = isNaN(n) ? new Date(v) : new Date(n);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function normalise(node) {
    if (Array.isArray(node)) return node.map(normalise);
    if (!node || typeof node !== 'object') return node;
    var out = {};
    Object.keys(node).forEach(function (k) {
      var v = node[k];
      if (BOOL_KEYS[k] && typeof v !== 'number') { out[k] = toBool(v); return; }
      if (k === 'release_date') { out[k] = toIso(v); return; }
      if (/_json$/.test(k) && typeof v === 'string') {
        var parsed = normalise(parseIfString(v));
        out[k] = parsed;
        out[k.slice(0, -5)] = parsed;
        return;
      }
      out[k] = normalise(v);
    });
    return out;
  }

  function finish(payload, key) {
    var data = unwrap(payload, key);
    if (!data || typeof data !== 'object') {
      throw new Error('The workflow returned no "' + key + '" data.');
    }
    return normalise(data);
  }

  // ── Mock data (USE_MOCK_DATA) ────────────────────────────────────────────
  // NAT_MOCK holds the fixtures from mock/ (inlined by build.js), in the same
  // wrapped shape the workflows return, so they go through the same unwrap
  // and normalise path as live data.
  function mockResponse(build) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(build()); } catch (e) { reject(e); }
      }, 450);
    });
  }

  function mockFixture(name, key) {
    if (typeof NAT_MOCK === 'undefined' || !NAT_MOCK) {
      throw new Error('Mock data is not included in this build.');
    }
    return finish(JSON.parse(JSON.stringify(NAT_MOCK[name])), key);
  }

  function trimTrend(data, days) {
    if (data.trend && days) data.trend = data.trend.slice(-days);
    return data;
  }

  // ── Cache ────────────────────────────────────────────────────────────────
  // Live calls are cached in sessionStorage by function + arguments + day
  // (see createWorkflowClient). clearCache() drops the entries for the
  // functions the current page uses; the header Refresh button calls it.
  function clearCache(fnNames) {
    var prefixes = (fnNames || ['getOverview', 'getSiteDetail', 'getDeviceDrilldown']).map(function (n) {
      return NAT_CONFIG.CACHE_KEY_PREFIX + n + '_';
    });
    try {
      var doomed = [];
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (prefixes.some(function (p) { return k.indexOf(p) === 0; })) doomed.push(k);
      }
      doomed.forEach(function (k) { sessionStorage.removeItem(k); });
    } catch (e) { /* non-fatal */ }
  }

  // The pages' only entry points to data. Mock or live is decided here, so
  // page modules never know which one they are talking to.
  NAT_DATA = {
    isMock: function () { return !!NAT_CONFIG.USE_MOCK_DATA; },

    getOverview: function (days) {
      if (NAT_CONFIG.USE_MOCK_DATA) {
        return mockResponse(function () { return trimTrend(mockFixture('overview', 'overview'), days); });
      }
      return overviewClient.getPayload({
        input: { days: days },
        cacheSuffix: JSON.stringify([days]),
      }).then(function (p) { return finish(p, 'overview'); });
    },

    getSiteDetail: function (siteUid, days) {
      if (NAT_CONFIG.USE_MOCK_DATA) {
        return mockResponse(function () { return trimTrend(mockFixture('site_detail', 'site_detail'), days); });
      }
      return siteDetailClient.getPayload({
        input: { site_uid: siteUid, days: days },
        cacheSuffix: JSON.stringify([siteUid, days]),
      }).then(function (p) { return finish(p, 'site_detail'); });
    },

    getDeviceDrilldown: function (deviceUid) {
      if (NAT_CONFIG.USE_MOCK_DATA) {
        return mockResponse(function () { return mockFixture('drilldown', 'drilldown'); });
      }
      return drilldownClient.getPayload({
        input: { device_uid: deviceUid },
        cacheSuffix: JSON.stringify([deviceUid]),
      }).then(function (p) { return finish(p, 'drilldown'); });
    },

    clearCache: clearCache,
    getCurrentUsername: getCurrentUsername,
  };
})();

