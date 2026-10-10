interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Was this failure OUR OWN web service? — the other half of `internal-db-class.ts`.
 *
 * fleet #1089 pulled failures from our own Postgres out of `upstream_down` by
 * keying on the SQLSTATE inside PostgREST's four-key error envelope. That
 * covered the majority and structurally could not cover the rest: the rest
 * never reach Postgres, so they carry no SQLSTATE. What was left, measured over
 * the 24h to 2026-09-02T15:00Z (fleet #1096):
 *
 *     5  pipeworx-catalog  get_pack_tools     Pipeworx catalog error: 522 — error code: 522
 *     3  fleet             fleet_list_open …  upstream_down: Fleet task queue did not respond within 25s
 *
 * 521/522/523/526 are Cloudflare saying its edge could not reach an ORIGIN, and
 * in both of those rows the origin is ours — `gateway.pipeworx.io` for the
 * catalog pack (it self-fetches when the gateway hasn't injected a manifest),
 * our own Supabase for fleet. There is no third party anywhere in either call.
 * Same defect as #1089: our own outage filed under `upstream_down`, the one
 * class that means "the source is unreachable and there is nothing for us to
 * fix", which is why the problem-tools triage skips it.
 *
 * WHY NOT A WORDING RULE. The obvious fix is to match `fleet db error:` and
 * `Pipeworx catalog error:` in classifyToolError. Each is emitted from exactly
 * one site today, so it would work today. It would also rot the first time
 * somebody rewords a label — silently, and in the direction of hiding our own
 * outage, which is worse than the bug being fixed. Every prose rule in
 * error-class.ts has needed widening as packs invented new wording (#409/#450/
 * #584); that history is most of that file's comment budget.
 *
 * WHAT THIS KEYS ON INSTEAD: **the host the call actually reached.** A URL's
 * hostname is a fact about the call, not a guess about its prose. Two
 * consequences that a pack-level flag could not give us, and the reason the
 * flag was rejected:
 *
 *   - It describes the CALL, not the pack. `govcon-intel` fans out to our own
 *     Supabase AND to genuine third parties; `court-listener` holds our cache
 *     in Supabase and fetches courtlistener.com. An `internallyHosted: true` on
 *     either pack would relabel a real third-party outage as ours — inventing
 *     work, which is the same class of error in the opposite direction.
 *   - It covers every future internal pack for free, instead of one declared
 *     slug at a time.
 *
 * WHY IT SURVIVES A REWORD. The marker below is not matched as a literal by two
 * separate files. `markInternalOrigin()` writes it and `internalHostMetricsClass()`
 * reads it, both from the single exported `INTERNAL_ORIGIN_MARKER` constant in
 * this module — so changing the wording changes both sides in the same edit and
 * cannot desynchronise them. The pack's own label (`fleet db error:`,
 * `Pipeworx catalog error:`) is not read at all: reword it freely, the class is
 * unaffected. That is the property `stripClassPrefix` lacked when it drifted
 * from its own classifier three times and needed a CI gate to hold them
 * together.
 *
 * WHERE THE 5xx TEST LIVES. `markInternalOrigin` is called from the places that
 * hold the real `Response` — `httpError`/`httpErrorMessage` and the timeout
 * branch of `fetchWithTimeout` in `shared/src/http.ts` — so "is this an
 * availability failure" is decided from the actual status code, never re-derived
 * by scraping a number out of a sentence. A 404 from our own registry for a slug
 * that does not exist is a caller's bad argument and is deliberately NOT marked.
 */

/**
 * OUR OWN web service was unreachable — not an upstream, and never `upstream_down`.
 *
 * ONE value, not three, unlike `internal_db_*`. That split existed because a
 * slow query, an exhausted pool and an unknown SQLSTATE have different owners
 * and different fixes. Here there is only one story to tell — an origin we run
 * did not answer the edge — and one owner. A bucket with no distinct owner per
 * value is decoration; #724 is what happens when a class holds several
 * situations, and inventing sub-values ahead of a reason to act on them
 * differently is the same mistake with the sign flipped.
 *
 * METRICS ONLY, exactly like PLATFORM_KEY_ERROR_CLASS and the internal_db
 * values. `classifyToolError` still answers `upstream_down` for the retry and
 * hint paths, which only care whether retrying or a sibling tool might work —
 * and it might. Nothing a caller sees or is charged changes here.
 *
 * READ SIDE: this value is in BROKEN_TOOL_CLASSES, FAULT_CLASSES and
 * ALL_ERROR_CLASSES in `workers/registry-api/src/index.ts`. All three, or it
 * lands on no dashboard — fleet #721 is the warning, where the #719 split
 * worked on the write side and was invisible for weeks.
 */
const INTERNAL_SERVICE_UNREACHABLE_CLASS = 'internal_service_unreachable';

/**
 * The token that carries "this origin is ours" from the call site to the
 * classifier.
 *
 * Appended to the error message rather than attached to the Error object,
 * because the object does not survive the trip: 275 packs return `{ error:
 * string }` instead of throwing, the gateway reads `observedError` as a string,
 * and the fleet pack rebuilds its error from a captured status + body across a
 * retry loop. A property on an Error would be dropped by every one of those
 * paths and the class would work in tests and vanish in production.
 *
 * WORDING IS LOAD-BEARING, same rule as labelAge's note in authority.ts. This
 * string is appended to a pack's thrown Error message (shared/src/http.ts),
 * and a thrown Error's message is exactly what the gateway hands back to the
 * caller as `content[0].text` when nothing rewrites it (workers/gateway/src
 * catches the throw and sets `rawResult.message = stripClassPrefix(error)`,
 * which does not touch this suffix) — so the original wording,
 * " [pipeworx-hosted origin — our own service, not a third party]", was not a
 * theoretical leak: it shipped live on pipeworx-catalog's 522s, 7 times in 6
 * hours on 2026-09-02 (see tests/golden-internal-service.test.ts), verbatim
 * naming Pipeworx as the host. check:hosting-claims never caught it because it
 * did not scan shared/ at all (task #2009). Reworded to describe the
 * OBSERVATION (the origin did not answer) without a claim about who runs it —
 * the identical fix labelAge got: drop the possessive, keep the fact.
 */
const INTERNAL_ORIGIN_MARKER = ' [origin did not respond — retry before concluding the named source is down]';

/**
 * Supabase's data plane for a project is `<ref>.supabase.co`, where the ref is
 * exactly twenty lowercase letters (ours is `pqauisounztsgdgfkhke`).
 *
 * Matching the shape rather than listing the ref keeps this correct when we add
 * a project — `supabaseEnv` on a pack entry already points some packs at a
 * second one — while still excluding `status.supabase.co`, which is Supabase's
 * own status page and emphatically not our database. Verified 2026-09-02 by
 * `grep -rhoE '[a-z0-9-]+\.supabase\.(co|in)' mcps shared workers scripts`: the
 * only real project ref anywhere in the tree is ours, the rest are doc
 * placeholders (`abc`, `xyz`, `example`) which this pattern also excludes. Same
 * finding internal-db-class.ts relies on for the PostgREST envelope being ours
 * by construction.
 */
const SUPABASE_PROJECT_HOST = /^[a-z]{20}\.supabase\.(co|in)$/;

/**
 * Is this a host WE run?
 *
 * Deliberately NOT including `*.workers.dev`: plenty of third-party APIs are
 * hosted on workers.dev, so the suffix says where something runs and not who
 * owns it. Every internal call we actually make goes to a `pipeworx.io`
 * hostname or to our Supabase project, both of which are ownership facts.
 *
 * `workers/gateway/src/provenance.ts`'s `OUR_HOSTS` answers the same
 * question and DOES include `workers.dev` — a documented divergence
 * (task #2051), not a bug to converge. That list decides what a response may
 * cite as a data SOURCE, where a false negative (citing our own worker as an
 * external source) is the hosting-disclosure leak this whole file exists to
 * prevent, so it errs broad. This one decides who gets BLAMED for a 5xx in
 * outage metrics read by on-call, where a false positive (crediting our own
 * infra with a third party's outage) hides the real failure, so it errs
 * narrow. Same suffix, opposite direction, because they are never called for
 * the same reason.
 *
 * Returns false on anything unparseable rather than throwing — this runs inside
 * an error path, and an error path that can itself throw turns a diagnosable
 * failure into a mystery.
 */
function isPipeworxOrigin(url: string | URL | undefined | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url instanceof URL ? url.href : url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'pipeworx.io' || host.endsWith('.pipeworx.io')) return true;
  return SUPABASE_PROJECT_HOST.test(host);
}

/**
 * Append the marker when this failure was OUR origin failing to answer.
 *
 * `status` is the HTTP status when there is one, and omitted for a timeout —
 * where there is no response at all, and "the origin did not answer" is the
 * whole observation. Statuses below 500 are left alone: a 404 from our own
 * registry for a slug that does not exist is the caller's argument, not our
 * outage, and marking it would put ordinary 404s on the incident dashboard.
 *
 * Idempotent, so a message that is wrapped and re-marked on the way up (the
 * fleet pack's retry loop re-throws through two layers) carries the marker once.
 */
function markInternalOrigin(
  message: string,
  url: string | URL | undefined | null,
  status?: number,
): string {
  if (status !== undefined && status < 500) return message;
  if (!isPipeworxOrigin(url)) return message;
  if (message.includes(INTERNAL_ORIGIN_MARKER)) return message;
  return message + INTERNAL_ORIGIN_MARKER;
}

/**
 * Which blob4 value a failure from our own web services books as, or undefined
 * if this is not one.
 *
 * Ordered AFTER `internalDbMetricsClass` at the call site: a PostgREST envelope
 * from our own Supabase is a strictly more specific statement about the same
 * row (which of our services, and why), and the two cannot disagree about
 * whether the failure is ours.
 */
function internalHostMetricsClass(error: string): string | undefined {
  return error.includes(INTERNAL_ORIGIN_MARKER) ? INTERNAL_SERVICE_UNREACHABLE_CLASS : undefined;
}


/**
 * One place to turn a failed `fetch` into an error a caller can act on.
 *
 * Nearly every pack was written the same way:
 *
 *     if (!res.ok) throw new Error(`Unsplash: ${res.status}`);
 *
 * which discards the response body — and the body is usually where the upstream
 * says what was actually wrong ("**symbol** not found: GBP", "parameter `year`
 * out of range", "unknown taxonomy id"). The caller gets a number, cannot
 * self-correct, and retries the same broken call. A 2026-07-31 sweep found this
 * shape in 481 of 1,400 packs, 47 of them PLATFORM-keyed.
 *
 * It also hides bugs one level down. Two of the first three packs audited had a
 * second defect that only existed because of this line: unsplash's rate-limit
 * branch sat BELOW a catch-all and was unreachable, and bea-gov parsed
 * `BEAAPI.Error.APIErrorDescription` below a `!res.ok` throw that made the
 * parsing dead code for every non-200.
 *
 * DELIBERATELY NOT A CLASSIFIER. It does not add `user_error:` /
 * `upstream_down:` prefixes. Those decide which tier a failure lands in, and the
 * `error` tier is what the daily problem-tools list is built from — it means
 * "Pipeworx has a defect". A 400 is genuinely ambiguous: often a caller's bad
 * argument, but sometimes a query WE built wrong (ted-eu comma-joined its CPV
 * values into something TED rejected, and that bug was found only because it sat
 * in `error`). Blanket-classifying 400s as caller mistakes would have hidden it.
 * A pack that KNOWS which it is should keep saying so explicitly; this helper is
 * for the 481 that say nothing at all.
 */

/** Longest upstream explanation we'll pass through. Enough for a real message,
 *  short enough that an HTML page or a stack trace can't swamp the error. */

const MAX_DETAIL = 300;

/**
 * Default bound for `fetchWithTimeout` when a pack doesn't state its own.
 *
 * 25s mirrors the number `epo-ops` landed on after measuring the real failure:
 * a degraded upstream that doesn't error, it just never answers, and a Worker
 * sits in `await fetch()` until ITS OWN execution budget kills the request —
 * which can take minutes, not seconds (epo_ops_search_patents measured 4-8
 * MINUTE hangs before this existed). 25s is short enough that a caller gets a
 * fast, actionable error instead of holding the connection, and long enough
 * that it doesn't false-trip on a merely-slow-but-alive upstream.
 */
const DEFAULT_FETCH_TIMEOUT_MS = 25_000;

/**
 * Read the body of a failed response and fold it into a throwable Error.
 *
 * Usage — note the `await`, which is the one thing that makes this a mechanical
 * change rather than a drop-in:
 *
 *     if (!res.ok) throw await httpError(res, 'Unsplash');
 *
 * Safe to call on any non-ok response: a body that is missing, empty, unreadable
 * or HTML degrades to exactly the old `Name: 404` string rather than throwing
 * something new from inside the error path.
 */
async function httpError(res: Response, name: string): Promise<Error> {
  return new Error(await httpErrorMessage(res, name));
}

/** The message text without constructing an Error — for packs that need to wrap
 *  it in their own envelope or add an explicit classification prefix. */
async function httpErrorMessage(res: Response, name: string): Promise<string> {
  // The one place a 5xx from a host WE run gets stamped as ours. `res.url` is
  // the URL the fetch actually resolved to (after redirects), so this is a fact
  // about the call rather than a guess from the `name` the pack passed in —
  // reword that label freely, the class does not move. See
  // internal-host-class.ts; no-op for every third-party upstream, which is why
  // this touches 481 packs' error text and changes none of it.
  return markInternalOrigin(
    `${name}: ${res.status}${detailSuffix(await readDetail(res))}`,
    res.url,
    res.status,
  );
}

/**
 * Just the upstream's own explanation — no name, no status.
 *
 * For a pack that has already said both in its own sentence. epo-ops reads
 * `EPO rejected this search as too large (HTTP 413) — ${httpErrorMessage(…)}`,
 * which rendered as `… (HTTP 413) — EPO: 413.` once the XML detail was being
 * dropped: the upstream named twice, the status twice, and the one thing EPO
 * actually said ("Not enough characters before truncation character") nowhere
 * (fleet #712). Returns '' when the body carries nothing readable, so a caller
 * can fall back to its own wording.
 */
async function upstreamDetail(res: Response): Promise<string> {
  return readDetail(res);
}

/**
 * Read a SUCCESSFUL response as JSON, failing loudly when it isn't JSON.
 *
 * `httpError` above only ever runs on `!res.ok`, which leaves the nastier half
 * of the problem unhandled: an upstream that answers **HTTP 200 with an HTML
 * page**. A bot wall, a login redirect, a maintenance interstitial and a CDN
 * error page are all 200s, so `res.ok` is true, and `res.json()` then throws
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
 *
 * That string is the problem. It names no upstream, carries no status, and
 * reads like a parser bug in Pipeworx — so it lands in the `error` tier, which
 * means "we have a defect", and the caller is told nothing they can act on.
 * data.govt.nz sat dead behind an Imperva challenge this way and every
 * status-code health check we own reported it green (7889a845). A zero-length
 * body has the same shape: `Unexpected end of JSON input`, seen this week on
 * uk-gazette (83% of external calls) and census.
 *
 * UNLIKE `httpError`, this one DOES classify, and the asymmetry is deliberate.
 * A 400 is genuinely ambiguous — often the caller's bad argument, sometimes a
 * query we built wrong — so blanket-classifying it would hide our own bugs.
 * There is no such ambiguity here: **no argument a caller can pass makes a JSON
 * API return an HTML page.** It is always the upstream, so `upstream_down:` is
 * a statement of fact rather than a guess, and it keeps these out of the
 * problem-tools list where they crowd out real defects.
 *
 *     const data = await parseJson<Feed>(res, 'UK Gazette');
 *
 * Call it only after the `!res.ok` check — on a failed response you want
 * `httpError`, which mines the body for the upstream's own explanation.
 */
async function parseJson<T>(res: Response, name: string): Promise<T> {
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    throw new Error(
      `upstream_down: ${name} returned a body that could not be read (HTTP ${res.status}). ` +
        'The connection most likely dropped mid-response; retrying is reasonable.',
    );
  }

  const type = res.headers.get('content-type') ?? 'no content-type';

  if (!raw.trim()) {
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with an EMPTY body where JSON was expected (${type}). ` +
        'Nothing about the request can cause this — it is an upstream fault, and the same call may well work on retry.',
    );
  }

  // Checked before parsing rather than in the catch, because knowing it is
  // markup is what turns "we failed to parse something" into "they served a
  // web page" — the second is diagnosable, the first is not.
  const head = raw.slice(0, 200).trimStart().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml')) {
    const kind = head.startsWith('<?xml') ? 'an XML document' : 'an HTML page';
    // The summary, not the source. Pasting the first 120 characters of a web
    // page handed the agent `<!DOCTYPE html><html lang="en"…` — the same leak
    // this branch exists to describe (fleet #712).
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with ${kind} instead of JSON (${type}). ` +
        'That is typically a bot wall, a login redirect or a maintenance page — it is returned as a SUCCESS, ' +
        `so status-code health checks read it as fine. No argument change will get past it. ` +
        `The page says: ${summarizeErrorBody(raw) || 'nothing readable'}`,
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with a body that is not valid JSON (${type}). ` +
        `It begins: ${stripMarkup(raw).slice(0, 120) || '(unreadable)'}`,
    );
  }
}

/**
 * `fetch`, but bounded — the fix for a systemic gap found 2026-08-30: a grep
 * audit of every pack's `mcps/*\/src/index.ts` found 1,339 of ~1,500 call
 * `fetch()` with NO timeout guard anywhere in the file. Two of those
 * (epo-ops, statcan) were confirmed live-hanging for 4-8 minutes before this
 * existed — every unguarded call carries the same risk, just unconfirmed.
 *
 * Mirrors the `epoFetch` wrapper `mcps/epo-ops/src/index.ts` shipped first:
 * bound the request with `AbortSignal.timeout`, and on a timeout/abort throw
 * an `upstream_down:` error that names the upstream and the bound rather than
 * letting the raw `TimeoutError`/`AbortError` (which names neither) propagate.
 * `upstream_down:` is deliberate, same reasoning as `parseJson` above — no
 * argument a caller passes can make an upstream hang, so it is always the
 * upstream's fault, and marking it that way keeps a slow API off the
 * problem-tools list where it would crowd out our own defects.
 *
 * Usage — a mechanical swap for a bare `fetch(url, init)`:
 *
 *     const res = await fetchWithTimeout(url, init, 'Some API');
 *
 * Pass `timeoutMs` as a fourth argument to override the default for a pack
 * with a known-slower upstream; the label should be the same short name you'd
 * pass to `httpError`/`httpErrorMessage` for that call.
 */
async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  name: string,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      // States the OBSERVATION (no response in N seconds), not a diagnosis.
      // "appears to be degraded" is an inference about the vendor that we have
      // not checked, and it is wrong in a way that misdirects whoever reads it:
      // a timeout from a Worker can equally mean OUR egress is blocked.
      //
      // Measured today (2026-09-01, fleet #1047): every call to
      // mainnet.base.org failed from the x402 facilitator while the identical
      // request from a laptop returned 200. Base was entirely healthy; the
      // public RPC refuses Cloudflare Worker egress. Had this message fired
      // there it would have blamed Base by name, and the next person would have
      // waited for a vendor outage to clear that did not exist.
      // A timeout has no status to test — there is no response at all — so
      // `markInternalOrigin` is called without one: an origin we run that never
      // answered is an availability failure by definition. This is the half of
      // fleet #1096 with neither a SQLSTATE nor a status code to key on.
      throw new Error(
        markInternalOrigin(
          `upstream_down: ${name} did not respond within ${timeoutMs / 1000}s. ` +
            `That can be ${name} being slow or down, or this environment being unable to reach it ` +
            `(some hosts refuse datacenter/Worker egress) — retry shortly, and check reachability ` +
            `from elsewhere before concluding ${name} is down.`,
          url,
        ),
      );
    }
    // Fleet #2382. Everything that isn't a timeout/abort here is a genuine
    // NETWORK-LEVEL failure — DNS resolution, connection refused, TLS handshake,
    // Cloudflare's own "Network connection lost." — meaning `fetch()` itself
    // threw and no HTTP response of any kind was ever received. Until this fix
    // that raw exception was rethrown VERBATIM: a bare `TypeError: fetch failed`
    // (or the Workers-runtime equivalent) names no upstream, carries no class
    // token, and reads exactly like a defect in OUR code — because it says
    // nothing about the call at all. It landed in `error`, the tier that means
    // "Pipeworx has a defect", for every one of the (at the time of writing)
    // ~470 packs that call this helper directly with no wrapper of their own.
    //
    // `dexscreener` hit this independently (fleet #1579) and fixed it with a
    // bespoke per-pack try/catch around `fetchWithTimeout`. That fix is correct
    // but only covers one pack; every other caller of this shared helper still
    // leaked the raw exception. Moving the same fix HERE — the one place that
    // already carries the timeout case — covers every pack that uses
    // `fetchWithTimeout` without a wrapper, for free, and without widening
    // `classifyToolError`'s regex list: the fix is giving the message a proper
    // `upstream_down:` token at the point the two facts (no response was ever
    // received, and which host we were trying to reach) are actually in hand,
    // not teaching the classifier to guess from prose after the fact.
    //
    // Safe on the same grounds as the timeout branch above: no argument a
    // caller passes can make `fetch()` itself throw a connection-level error,
    // so this is always an availability failure, never a caller mistake. Same
    // `markInternalOrigin` treatment — an origin we run that never answered is
    // still ours, not a third party's outage.
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(
      markInternalOrigin(
        `upstream_down: could not reach ${name} at all (${raw.slice(0, 160)}). ` +
          `No request reached ${name}, so this says NOTHING about whether the arguments you passed ` +
          'are valid — do not re-check them on the strength of this error. Retry shortly.',
        url,
      ),
    );
  }
}

function detailSuffix(detail: string): string {
  return detail ? ` — ${detail}` : '';
}

async function readDetail(res: Response): Promise<string> {
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    // Body already consumed, or the connection died mid-read. The status alone
    // is still worth throwing — never let the error path throw its own error.
    return '';
  }
  return summarizeErrorBody(raw);
}

/**
 * Turn ANY error body — JSON, HTML, XML or plain text — into one short phrase
 * that never contains markup.
 *
 * This used to just drop an HTML or XML body on the floor, on the reasoning
 * that markup crowds out the status. That was half right. Dropping it loses the
 * one sentence a caller could have acted on: an `Access Denied` title, an SDMX
 * `<message:Error>` text, an OPS fault string. A 2026-08-30 support sweep
 * measured 13 of 291 caller-facing error rows carrying a raw page or document
 * verbatim, across 11 packs, and in every one of them the useful content —
 * "Access Denied", "Invalid country code", "SCRAPE_TIMEOUT" — was in there,
 * buried in markup the agent had to parse out of a string (fleet #712).
 *
 * So: extract the meaning, discard the markup. The output is passed through
 * `stripMarkup` unconditionally, which is what lets `check:error-body-leak`
 * assert mechanically that no caller-facing message can contain `<?xml`,
 * `<!DOCTYPE` or `<html`.
 */
function summarizeErrorBody(raw: string): string {
  if (!raw || !raw.trim()) return '';

  const head = raw.slice(0, 400).trimStart().toLowerCase();

  // An HTML error page (Cloudflare interstitial, nginx default, a login
  // redirect) says what it is in its <title>, and almost nowhere else.
  if (head.startsWith('<!doctype') || head.startsWith('<html')) {
    const title = htmlTitle(raw);
    return title
      ? `${title} (upstream returned an HTML error page, not an API response)`
      : 'upstream returned an HTML error page, not an API response';
  }

  // XML fault documents — EPO OPS, SDMX (`<message:Error>`), SOAP faults. The
  // human sentence sits in a child element whose tag name says what it is.
  if (head.startsWith('<?xml') || head.startsWith('<')) {
    const fault = xmlFaultText(raw);
    return fault
      ? `${stripMarkup(fault).slice(0, MAX_DETAIL)} (from the upstream's XML error document)`
      : 'upstream returned an XML error document with no readable message';
  }

  // Most JSON error bodies bury one human sentence among ids and echoed request
  // params. Prefer that sentence; fall back to the whole body when the shape is
  // unfamiliar, since an unfamiliar shape is exactly when we can least afford to
  // guess wrong and show nothing.
  const fromJson = messageFromJson(raw);
  return stripMarkup(fromJson ?? raw).slice(0, MAX_DETAIL);
}

/** The `<title>` of an HTML error page, or its first `<h1>` — the two places a
 *  bot wall, a 502 and an "Access Denied" all state what happened. */
function htmlTitle(raw: string): string | null {
  const head = raw.slice(0, 4000);
  for (const re of [/<title[^>]*>([\s\S]*?)<\/title>/i, /<h1[^>]*>([\s\S]*?)<\/h1>/i]) {
    const m = re.exec(head);
    const text = m ? stripMarkup(m[1]) : '';
    if (text) return text.slice(0, 160);
  }
  return null;
}

/** Tag names that carry the explanation in an XML fault document, namespace
 *  prefix optional (`<message:Error>`, `<com:Text>`, `<faultstring>`). */
const XML_FAULT_TAG_RE =
  /<(?:[A-Za-z0-9_.-]+:)?(?:text|message|description|faultstring|reason|detail|title|errormessage|error)\b[^>]*>([^<]{2,400})</i;

function xmlFaultText(raw: string): string | null {
  const head = raw.slice(0, 8000);
  const tagged = XML_FAULT_TAG_RE.exec(head);
  if (tagged && tagged[1].trim()) return tagged[1];

  // Nothing conventionally named — take the longest text node instead. A fault
  // document with one sentence in an oddly named element is still readable;
  // returning nothing at all is not.
  let best = '';
  for (const m of head.matchAll(/>([^<>]{8,400})</g)) {
    const text = m[1].trim();
    if (text.length > best.length) best = text;
  }
  return best || null;
}

/**
 * Remove every tag and stray angle bracket, then collapse whitespace.
 *
 * Applied to everything on the way out, including the JSON and plain-text
 * paths, because an upstream is free to embed markup in a JSON string field —
 * and a leak is a leak regardless of which branch produced it.
 */
function stripMarkup(s: string): string {
  return collapse(decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/[<>]/g, ' '));
}

/** The handful of entities that show up in error-page titles. Decoded AFTER
 *  tags are stripped and BEFORE the angle-bracket sweep, so `&lt;script&gt;`
 *  in a title cannot decode into markup that survives — EMBL-EBI's ChEMBL 500
 *  page renders as `500 Internal Server Error &lt; EMBL-EBI` otherwise. */
function decodeEntities(s: string): string {
  return s
    .replace(/&(?:amp|#0*38);/gi, '&')
    .replace(/&(?:lt|#0*60);/gi, '<')
    .replace(/&(?:gt|#0*62);/gi, '>')
    .replace(/&(?:quot|#0*34);/gi, '"')
    .replace(/&(?:#0*39|apos|#x0*27);/gi, "'")
    .replace(/&nbsp;/gi, ' ');
}

/** The conventional "what went wrong" field, under any of the names upstreams
 *  actually use. Checked in order; first non-empty string wins. */
const MESSAGE_KEYS = [
  'message', 'error_message', 'errorMessage', 'detail', 'details',
  'description', 'error_description', 'reason', 'title', 'fault',
];

function messageFromJson(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return pickMessage(parsed, 0);
}

function pickMessage(node: unknown, depth: number): string | null {
  // Two levels covers `{error: {message}}` and `{errors: [{detail}]}`, the two
  // shapes that account for nearly all of them, without walking a large payload.
  if (depth > 2 || node == null) return null;

  if (typeof node === 'string') return node.trim() || null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = pickMessage(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;

  for (const key of MESSAGE_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // `{error: …}` where error is itself an object or a string — the single most
  // common wrapper, so it is worth descending into by name rather than scanning
  // every key and risking picking up an echoed request parameter.
  for (const key of ['error', 'errors', 'fault', 'Error', 'data']) {
    if (key in obj) {
      const found = pickMessage(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Errors are read in a single line of log output; newlines and runs of
 *  whitespace make a multi-line body unreadable there. */
function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}


/**
 * HTML-to-text helpers shared by the state statute packs.
 *
 * One decoder rather than one per pack, because the copies had already begun
 * to drift: the hex-entity case (&#x2003; em space, &#x2014; em dash) was
 * handled in Florida's copy and not California's, so Californian statutes were
 * quietly emitting raw entities where punctuation belonged. Fixed once here.
 *
 * publish-pack.sh inlines workspace imports, so a standalone pack still ships
 * self-contained.
 */

const SCRIPT = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const BLOCK = /<\/?(p|div|br|tr|li|h[1-6]|blockquote)\b[^>]*>/gi;

/** Convert a slice of statute HTML to readable plain text. */
function statuteText(html: string): string {
  return html
    .replace(/\r\n?/g, '\n')
    .replace(SCRIPT, ' ')
    .replace(BLOCK, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Hex before decimal: legislature sites emit &#x2003; and &#x2014;
    // constantly, and a decimal-only decoder leaves them in the middle of the
    // statute looking like markup noise.
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&sect;/g, '\u00a7')
    // Named entities that carry MEANING, decoded before the catch-all below.
    // This was a real defect: the catch-all replaced &ndash; with a SPACE, so
    // Maryland's "&sect;2&ndash;201." decoded to "2 201" and a lookup for
    // section 2-201 reported a statute that plainly exists as missing. Dashes
    // are everywhere in statutory text and numbering, so the corruption was
    // silent and general rather than particular to one state.
    .replace(/&ndash;/g, '\u2013')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&rsquo;|&apos;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&ldquo;/g, '\u201c')
    .replace(/&rdquo;/g, '\u201d')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Text from a container, starting AFTER its opening tag.
 *
 * Slicing at the marker itself leaves the tail of the tag — `laws-body">` — as
 * the first characters of the statute, which is exactly what three packs did
 * before testing caught it.
 */
function textFromContainer(html: string, marker: string | RegExp): string | null {
  const i = typeof marker === 'string' ? html.indexOf(marker) : html.search(marker);
  if (i === -1) return null;
  const gt = html.indexOf('>', i);
  return statuteText(html.slice(gt === -1 ? i : gt + 1));
}

/**
 * Read a statute response as text, honouring its actual encoding.
 *
 * Several state sites serve WINDOWS-1252 while sending `content-type:
 * text/html` with no charset. Response.text() assumes UTF-8, so their smart
 * quotes and non-breaking spaces decode to replacement characters — Nevada
 * rendered `"Murder" defined` as mojibake, and Oregon's section headings
 * became unmatchable because the "space" after the section number is a 0xA0
 * that never survived the decode.
 *
 * That is the quiet kind of damage: the text still looks like text, so nothing
 * errors, and a heading regex simply stops matching for reasons no one can see
 * in the output.
 *
 * Strict UTF-8 first — if the bytes really are UTF-8 this succeeds and nothing
 * changes — then fall back to windows-1252, which decodes every byte and so
 * cannot itself fail.
 */
async function readStatuteResponse(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/**
 * Cut one section out of a page that holds a whole chapter.
 *
 * A section number appears several times on these pages and only one of them
 * starts the statute. The others are a table-of-contents entry at the top and
 * cross-references inside neighbouring sections. Picking the FIRST match
 * returns a heading with nothing under it; picking the LAST returns whatever
 * fragment follows a cross-reference. Both were tried and both produced
 * confident, tiny, wrong answers — Oregon 140 characters, Nevada 39, each
 * looking like a real result.
 *
 * The body is simply the candidate with the most text before the next section
 * begins, which is true regardless of where the page puts its contents list.
 *
 * @param heading matches the start of the wanted section (global flag required)
 * @param next    matches the start of ANY section, to bound the slice
 */
function sliceSection(text: string, heading: RegExp, next: RegExp): string | null {
  // Record where each candidate starts AND how long its heading is. Skipping
  // only one character past the start lets the  pattern re-match the very
  // heading we just found, which yields an empty body — that bug returned
  // section_not_found for a section plainly present on the page.
  const found: Array<{ at: number; len: number }> = [];
  const re = new RegExp(heading.source, heading.flags.includes('g') ? heading.flags : heading.flags + 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    found.push({ at: m.index, len: m[0].length });
    if (re.lastIndex === m.index) re.lastIndex++;   // guard zero-width matches
  }
  if (!found.length) return null;

  let best: string | null = null;
  for (const { at, len } of found) {
    const from = at + len;
    const nre = new RegExp(next.source, next.flags.includes('g') ? next.flags : next.flags + 'g');
    const m = nre.exec(text.slice(from));
    const body = (m ? text.slice(at, from + m.index) : text.slice(at)).trim();
    if (body.length > (best?.length ?? 0)) best = body;
  }
  return best && best.length > 0 ? best : null;
}
/**
 * Tennessee Code Annotated (T.C.A.) — Tennessee state statutes by citation
 * and by topic. Fleet #2885.
 *
 * SOURCE AND WHY THIS IS A POINT-IN-TIME SNAPSHOT, NOT A LIVE LOOKUP.
 * Tennessee's own publishing arrangement routes the current, maintained TCA
 * exclusively through LexisNexis's advance.lexis.com (the link the General
 * Assembly's own site sends you to) — confirmed dead end for a Worker fetch:
 * a cookie/session-gated SPA with no stable per-citation URL, the same class
 * of wall this pack family treats as OUT. The Tennessee Court of Appeals
 * confirmed there is no OTHER official route: Public.Resource.Org v. Matthew
 * Bender & Co., 686 S.W.3d 1 (Tenn. Ct. App. 2023) (appeal denied by the TN
 * Supreme Court, 2024) held that the state's Public Records Act does not
 * reach the electronic TCA, because Lexis is a private contractor performing
 * services for the Code Commission under a separate statutory arrangement,
 * not a state agency holding a public record.
 *
 * THAT LITIGATION IS WHY A FREE MIRROR EXISTS AT ALL: having lost electronic
 * access, Public.Resource.Org had UniCourt scan, transform and publish the
 * print volumes at `https://unicourt.github.io/cic-code-tn/` — "This
 * repository was created by UniCourt on behalf of Public.Resource.Org. All
 * this work is in the public domain and there are NO RIGHTS RESERVED," the
 * same edict-of-government theory the U.S. Supreme Court confirmed for
 * Georgia's annotated code in Georgia v. Public.Resource.Org, 590 U.S. 255
 * (2020), and the exact same `cic-beautify-state-codes` transform this repo
 * already trusts for mcps/georgia-code's upstream (verified: identical
 * stylesheet reference in the TN and GA HTML). The identical release is
 * ALSO uploaded to archive.org as item `gov.tn.tca` (verified byte-identical
 * statutory text); GitHub Pages is the one this pack calls because
 * archive.org's mirror nodes answered this release with multiple transient
 * 500s and multi-second-to-indefinite stalls during development where this
 * host was consistently sub-second, and because archive.org's own upload of
 * Title 47 carries a LexisNexis "All rights reserved" notice instead of
 * PRO's public-domain one (evidently a bad upload on that one file) where
 * UniCourt's copy of Title 47 is clean like every other title.
 *
 * NO NEWER RELEASE EXISTS. Checked at bake time via the site's own release
 * listing AND archive.org's separate upload: release 76 (2021.05.21) is the
 * newest either has, and the 2023-2024 litigation above explains why —
 * Public.Resource.Org was fighting to GET a newer electronic feed and lost.
 * So every response from this pack is TEXT FROZEN AT 2021-05-21, roughly
 * five legislative sessions behind the current TCA — `current_through` says
 * this explicitly on every call. This is a snapshot, not "the current
 * Tennessee Code"; do not change that framing without a newer upstream
 * release actually appearing.
 *
 * (Also checked and ruled out as fresher free alternatives: law.justia.com
 * serves a Cloudflare managed JS challenge to a bare fetch — the same wall
 * class as the official site, not a bypassable UA gate; codes.findlaw.com
 * the same. law.resource.org/pub/us/code/tn/ is the LITIGATION DOCKET above,
 * not a code mirror — the actual text lives only in the two mirrors above.)
 *
 * TN_EXCLUDED_TITLES stays wired in as a defensive check even though it is
 * currently empty (every title in this release carries PRO's public-domain
 * disclaimer) — keyed on that disclaimer sentence rather than a title
 * number, so a future bake that ever saw a copyrighted file again (the
 * archive.org-specific Title 47 problem above) would exclude it
 * automatically rather than serve copyrighted text silently.
 *
 * SHAPE. Each title's HTML (~0.06-10.5MB) carries the WHOLE title's
 * statutory text plus case-law annotations in one document, with every
 * section already given a UNIQUE anchor id (`id="t{title}c{chapter}s{citation}"`)
 * by PRO's transform — unlike Colorado/Iowa's siblings, there is no
 * heading-regex ambiguity to resolve, because the source hands us an exact
 * id to search for. tn_statute fetches the ONE title file live (resolved
 * via the baked index, so it knows which file without guessing) and cuts
 * the section out by that id, bounded by the next section/chapter heading
 * OR the start of the title's own "NOTES TO DECISIONS" block (`<h4
 * id="...-NOTESTODECISIONS">`) — the point where PRO's annotated text
 * switches from the statute and its legislative/compiler notes to a digest
 * of case law, which this pack does not return (same editorial-vs-statute
 * line mcps/colorado-code draws before its "ANNOTATION" block).
 *
 * A topic/keyword search over 34,000+ sections' full text would mean
 * fetching all 68 titles (~145MB) per call, so tn_search instead reads a
 * citation+official-catchline index baked ONCE by scripts/bake-index.mjs
 * (same "baked table" shape as mcps/north-dakota-code's nd-index-data.ts and
 * mcps/south-dakota-code's sd-index-data.ts) — catchline/heading search, not
 * full-text search over the statutory body. tn_statute always fetches live;
 * it does not depend on the baked index for the text itself, only to resolve
 * which title file a citation belongs to without guessing.
 *
 * FOUR CAPABILITIES — two available, two are not:
 *   - citation lookup            -> tn_statute
 *   - topic/catchline search     -> tn_search (headings only, see its own
 *     description)
 *   - amendments/enactment history -> embedded in tn_statute's returned
 *     text (the "Acts YYYY, ch. N, § N; ..." line every amended section
 *     carries) and surfaced separately as `history` when it parses cleanly.
 *   - historical version (the text of a section as it read before a given
 *     amendment) -> NOT AVAILABLE beyond whatever the 2021-05-21 snapshot
 *     itself preserves; there is no per-year archive the way Colorado or
 *     Indiana publish, and the live LexisNexis site this pack cannot reach
 *     is the only place a true point-in-time history would live.
 *
 * Keyless, no signup.
 */
import type { TnChapterRow, TnSectionRow, TnLaterActRow } from './tn-index-data.js';

// fleet #2754 (LIVE INCIDENT 2026-10-07): a baked index that is VALUE-imported
// puts the whole table into every gateway isolate's bundle and heap whether
// or not that isolate ever serves this pack. The data module is uploaded to
// KV at deploy (workers/gateway/src/pack-baked-indexes.json registers it) and
// the gateway injects the parsed object as `args._bakedIndex` on every call
// into this pack. NEVER value-import ./tn-index-data.js here — a type-only
// import (above) is erased at build time; a value import is not.
let TN_CHAPTERS: TnChapterRow[] = [];
let TN_SECTIONS: TnSectionRow[] = [];
let TN_INDEX_CAPTURED_AT = '';
let TN_RELEASE = '';
let TN_RELEASE_DATE = '';
let TN_EXCLUDED_TITLES: Array<[string, string]> = [];

function ensureIndex(args: Record<string, unknown>): void {
  if (TN_SECTIONS.length) return;
  const idx = args._bakedIndex as Record<string, unknown> | null | undefined;
  const chapters = idx?.TN_CHAPTERS;
  const sections = idx?.TN_SECTIONS;
  const capturedAt = idx?.TN_INDEX_CAPTURED_AT;
  const release = idx?.TN_RELEASE;
  const releaseDate = idx?.TN_RELEASE_DATE;
  if (
    !Array.isArray(chapters) || !Array.isArray(sections) || sections.length === 0 ||
    typeof capturedAt !== 'string' || typeof release !== 'string' || typeof releaseDate !== 'string'
  ) {
    // Loud on purpose: an empty table would read as "no such section" / "no
    // match", a silent wrong answer rather than the server-side fault it is.
    throw new Error(
      `tennessee-code: the baked section index is unavailable (${idx == null ? 'not injected' : 'malformed'}). ` +
        'The gateway loads it from KV on the first call into this pack; this is a server-side fault, not a bad citation or query — retry shortly.',
    );
  }
  TN_CHAPTERS = chapters as TnChapterRow[];
  TN_SECTIONS = sections as TnSectionRow[];
  TN_INDEX_CAPTURED_AT = capturedAt;
  TN_RELEASE = release;
  TN_RELEASE_DATE = releaseDate;
  TN_EXCLUDED_TITLES = Array.isArray(idx?.TN_EXCLUDED_TITLES) ? (idx.TN_EXCLUDED_TITLES as Array<[string, string]>) : [];
}

// LATER-ACTS OVERLAY (fleet #2916, third of the AR/MS/TN overlay builds —
// docs/current-statute-routes.md, #2902, after mcps/arkansas-code's
// AR_LATER_ACTS, fleet #2906). Baked from the Tennessee General Assembly's
// own Public Chapters Effective Reports plus each enacted bill's own text
// (capitol.tn.gov) by scripts/bake-later-acts.mjs — see that script's header
// for the full sourcing story (Tennessee, unlike Arkansas, publishes no
// ready-made citation-to-act index; this one is home-built). This is an
// OVERLAY, never a merge: tn_statute's `text` field stays the frozen
// Release 76 (2021-05-21) snapshot; this table only adds a dated, linked
// list of later acts beside it, explicitly labelled as not merged into that
// text.
let TN_LATER_ACTS: TnLaterActRow[] = [];
let TN_LATER_ACTS_CAPTURED_AT = '';
let TN_LATER_ACTS_SESSIONS_CHECKED: string[] = [];
let TN_LATER_ACTS_PARSE_RATE_PCT: number | null = null;
let TN_LATER_ACTS_LOADED = false;

function ensureLaterActs(args: Record<string, unknown>): void {
  if (TN_LATER_ACTS_LOADED) return;
  const idx = args._bakedIndex as Record<string, unknown> | null | undefined;
  const rows = idx?.TN_LATER_ACTS;
  const capturedAt = idx?.TN_LATER_ACTS_CAPTURED_AT;
  const sessionsChecked = idx?.TN_LATER_ACTS_SESSIONS_CHECKED;
  if (
    !Array.isArray(rows) ||
    rows.length === 0 ||
    typeof capturedAt !== 'string' ||
    !Array.isArray(sessionsChecked) ||
    sessionsChecked.length === 0
  ) {
    // Loud, same shape as ensureIndex() above: a missing/malformed overlay
    // index is a server-side KV fault, not evidence the section has no later
    // acts. tn_statute must not silently claim later_acts: [] when the real
    // answer is "the index did not load" — those are different failures and
    // collapsing them would be exactly the silent-empty-array trap this
    // fleet holds every pack to (docs/silent-zero-policy.md).
    throw new Error(
      `tennessee-code: the baked later-acts overlay index is unavailable (${idx == null ? 'not injected' : 'malformed'}). ` +
        'The gateway loads it from KV on the first call into this pack; this is a server-side fault, not "no later acts" — retry shortly.',
    );
  }
  TN_LATER_ACTS = rows as TnLaterActRow[];
  TN_LATER_ACTS_CAPTURED_AT = capturedAt;
  TN_LATER_ACTS_SESSIONS_CHECKED = sessionsChecked as string[];
  const parseRate = idx?.TN_LATER_ACTS_PARSE_RATE_PCT;
  TN_LATER_ACTS_PARSE_RATE_PCT = typeof parseRate === 'number' ? parseRate : null;
  TN_LATER_ACTS_LOADED = true;
}

interface LaterAct {
  public_chapter: number;
  general_assembly: string;
  bill: string;
  date: null;
  link: string;
  verb: 'amended' | 'repealed' | 'new_section';
  source: 'tnga';
  merged: false;
}

function laterActsFor(citation: string): LaterAct[] {
  return TN_LATER_ACTS.filter(([cite]) => cite === citation).map(
    ([, pc, ga, billId, verb, billUrl]) => ({
      public_chapter: pc,
      general_assembly: ga,
      bill: billId,
      // The Effective Report gives effective date(s) for the WHOLE chapter,
      // not a per-citation enactment date, and the linked bill text is the
      // as-filed document rather than a dated signed copy — null, honestly,
      // same rule as Arkansas's overlay, rather than guessing.
      date: null,
      link: billUrl,
      verb: verb as LaterAct['verb'],
      source: 'tnga',
      merged: false,
    }),
  );
}

const UA = 'pipeworx-mcp-tennessee-code/1.0 (+https://pipeworx.io)';
// hosting-claims-ok: names the operator (UniCourt, on behalf of
// Public.Resource.Org) rather than describing this as something Pipeworx
// hosts or mirrors.
const UPSTREAM = "UniCourt's cic-code-tn (built for Public.Resource.Org — public domain, no rights reserved)";
// GitHub Pages, not archive.org: same Public.Resource.Org release (76,
// 2021.05.21 — byte-identical statutory text, verified against the
// archive.org/gov.tn.tca upload of the same release), but archive.org's
// mirror nodes answered multiple transient 500s and multi-second stalls
// during development while this host was consistently sub-second. It also
// carries a CLEAN Title 47 (archive.org's upload of Title 47 alone carries a
// Lexis "All rights reserved" notice instead of PRO's public-domain one —
// evidently a bad upload on that one file; TN_EXCLUDED_TITLES, driven by the
// baked index, would re-exclude it automatically if a future bake of THIS
// host ever saw that again).
const DOWNLOAD_BASE = 'https://unicourt.github.io/cic-code-tn/transforms/tn/octn';
const NOTES_TO_DECISIONS_RE = /<h4[^>]*\bid="[^"]*-NOTESTODECISIONS"[^>]*>/;

// Title files run up to ~10.5MB — the shared default (25s) is tuned for
// small JSON/HTML payloads. GitHub Pages has been sub-second for every title
// fetched during development, but the budget is kept generous rather than
// tight for the rare slow edge.
const TITLE_FETCH_TIMEOUT_MS = 45_000;

async function pwFetch(url: string | URL, timeoutMs?: number): Promise<Response> {
  return fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, UPSTREAM, timeoutMs);
}

function normalizeCitation(raw: string): string {
  return raw
    .trim()
    .replace(/^(T\.?C\.?A\.?|Tenn\.?\s*Code\s*Ann\.?)\s*/i, '')
    .replace(/^§+\s*/, '')
    .replace(/\s+/g, '');
}

let sectionByCitation: Map<string, TnSectionRow> | null = null;
function sectionIndex(): Map<string, TnSectionRow> {
  if (sectionByCitation) return sectionByCitation;
  const m = new Map<string, TnSectionRow>();
  for (const row of TN_SECTIONS) m.set(row[0], row);
  sectionByCitation = m;
  return m;
}

function titleUrl(titleNum: string): string {
  const padded = titleNum.padStart(2, '0');
  return `${DOWNLOAD_BASE}/${TN_RELEASE}/gov.tn.tca.title.${padded}.html`;
}

/** "2021.05.21" -> "2021-05-21". */
function isoDate(releaseDate: string): string {
  return releaseDate.replace(/\./g, '-');
}

function staleDataAsOf(): string {
  return isoDate(TN_RELEASE_DATE);
}

function staleCurrentThrough(): string {
  return `${isoDate(TN_RELEASE_DATE)} (release ${TN_RELEASE.replace(/^r/, '')} of UniCourt's cic-code-tn, for Public.Resource.Org) — NOT the current Tennessee Code.`;
}

/** Extract the "Acts ..." legislative-history line(s) that immediately
 *  follow a section's operative text, stopping at the next labelled note
 *  ("Compiler's Notes.", "Amendments.", "Effective Dates.", "Cross-
 *  References.", "Law Reviews.", "Attorney General Opinions.") or the end
 *  of the slice. Not every section carries one (a never-amended section has
 *  no "Acts" line at all), so returning null is an honest outcome. */
function extractHistory(text: string): string | null {
  const m = /\n(Acts\s+\d{4}[\s\S]*?)(?=\n(?:Compiler's Notes\.|Amendments\.|Effective Dates\.|Cross-References\.|Law Reviews\.|Attorney General Opinions\.)|$)/.exec(text);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

const tools: McpToolExport['tools'] = [
  {
    name: 'tn_statute',
    description:
      'Get a section of the Tennessee Code Annotated (T.C.A.) — Tennessee state law — by citation. '
      + '"39-13-202" is first degree murder; "66-28-301" is the security-deposit statute. Accepts natural '
      + 'forms: "39-13-202", "T.C.A. 39-13-202", "Tenn. Code Ann. § 39-13-202". Returns the statutory '
      + 'text, catchline, chapter context, and the "Acts ..." legislative history when the text carries '
      + 'one — but NOT case-law digest ("Notes to Decisions"), which this pack excludes. '
      + 'IMPORTANT: this is a POINT-IN-TIME snapshot frozen at 2021-05-21 (release 76 of '
      + "Public.Resource.Org's scan), not the current code — Tennessee's only current electronic TCA is "
      + 'behind a LexisNexis login/session wall this pack cannot reach (confirmed by Tennessee Court of '
      + "Appeals litigation; see this pack's README). Every response states current_through explicitly. "
      + 'Also returns later_acts: a dated, linked overlay of every Public Chapter this pack\'s own home-built '
      + 'index (built from Tennessee General Assembly Effective Reports and bill text, since Tennessee '
      + 'publishes no citation-to-act index) shows touching this exact citation since the 2021-05-21 '
      + 'snapshot (Public Chapter number, General Assembly, bill id, link to the bill text) — NOT merged '
      + 'into the text, explicitly labelled so, with sessions_checked naming every Effective Report the '
      + 'index covers even when later_acts is empty. Use for "what does T.C.A. 39-13-202 say" or to check '
      + 'a Tennessee statute AND whether it has been amended since 2021-05-21. '
      + 'All 68 published titles are covered. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'Section citation, e.g. "39-13-202" (murder) or "66-28-301" (security deposits). Title-chapter-section; the title is the part before the first dash.',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'tn_search',
    description:
      'Search the Tennessee Code Annotated (T.C.A.) BY TOPIC or keyword rather than citation — '
      + '"security deposit", "concealed carry", "DUI per se limit", "homicide". This matches OFFICIAL '
      + 'CATCHLINES/HEADINGS (e.g. "39-13-202. First degree murder." matches "murder"), not the full '
      + 'statutory body text — a word that appears only inside a section\'s text and not its heading will '
      + 'not be found this way. Returns matching citations, catchlines and chapter context; call '
      + 'tn_statute with a citation for the full text. Same 2021-05-21 point-in-time snapshot as '
      + 'tn_statute. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Topic or keywords, e.g. "security deposit".' },
        limit: { type: 'number', description: 'Max results, default 10, max 50.' },
      },
      required: ['query'],
    },
  },
];

async function tnStatute(args: Record<string, unknown>) {
  ensureIndex(args);
  ensureLaterActs(args);
  const raw = String(args.citation ?? '').trim();
  if (!raw) {
    return { found: false, reason: 'empty_citation', message: 'tn_statute needs a citation, e.g. "39-13-202" or "T.C.A. 66-28-301".' };
  }
  const citation = normalizeCitation(raw);
  const titleNum = citation.split('-')[0] ?? '';

  const excluded = TN_EXCLUDED_TITLES.find(([t]) => t === titleNum);
  if (excluded) {
    return {
      found: false,
      reason: 'title_not_available',
      citation: raw,
      title: Number(titleNum) || titleNum,
      message: `Title ${titleNum} is not available from this pack's public-domain source (${excluded[1]}).`,
      hint: 'This is a source limitation, not a bad citation — see TN_EXCLUDED_TITLES in this pack\'s baked index for which title(s) and why.',
      source: UPSTREAM,
    };
  }

  const row = sectionIndex().get(citation);
  if (!row) {
    const near = TN_SECTIONS.filter((r) => r[0].startsWith(`${titleNum}-`)).slice(0, 5).map((r) => ({ citation: r[0], catchline: r[1] }));
    const laterActsForMissing = laterActsFor(citation);
    return {
      found: false,
      reason: 'citation_not_found',
      citation: raw,
      message: `No T.C.A. section matches "${raw}" in the ${isoDate(TN_RELEASE_DATE)} snapshot.`,
      hint: laterActsForMissing.length
        ? `This citation does not appear in the Release 76 (2021-05-21) snapshot, but this pack's own home-built later-acts index shows ${laterActsForMissing.length} Public Chapter(s) touching it — it may be a section CREATED after the snapshot date. See later_acts_if_created below (not merged text, just the act references).`
        : near.length
          ? 'Nearby sections from the same title are listed in "near" — section numbers are not contiguous (repealed/reserved sections are normal), and some repealed RANGES are indexed only under their first citation.'
          : 'Call tn_search with a topic instead if you do not have an exact citation, or confirm the title number.',
      near: near.length ? near : undefined,
      later_acts_if_created: laterActsForMissing,
      sessions_checked: TN_LATER_ACTS_SESSIONS_CHECKED,
      current_through: staleCurrentThrough(),
      source: UPSTREAM,
    };
  }

  const [, catchline, chapterIdx, repealed] = row;
  const chapter = chapterIdx >= 0 ? TN_CHAPTERS[chapterIdx] : undefined;

  const res = await pwFetch(titleUrl(titleNum), TITLE_FETCH_TIMEOUT_MS);
  if (!res.ok) throw await httpError(res, UPSTREAM);
  const html = await res.text();

  const esc = citation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRe = new RegExp(`<h3[^>]*\\bid="t\\d+c[^"]*s${esc}"[^>]*>`, 'g');
  const nextRe = new RegExp(`<h3[^>]*\\bid="t\\d+c[^"]*s[^"]+"[^>]*>|<h2[^>]*\\bid="t\\d+c[^"]*"[^>]*>|${NOTES_TO_DECISIONS_RE.source}`, 'g');
  const rawBody = sliceSection(html, headingRe, nextRe);

  if (!rawBody) {
    return {
      found: false,
      reason: 'section_in_index_not_in_html',
      citation: raw,
      message: `"${citation}" is in this pack's baked index but its heading could not be located in the fetched title file — the source markup may have drifted.`,
      source: UPSTREAM,
    };
  }

  const text = statuteText(rawBody);
  const history = extractHistory(text);
  // The heading line itself ("39-13-202. First degree murder.") duplicates
  // `catchline` from the index — drop it from the returned body so callers
  // get the operative text starting at the actual statute.
  const bodyWithoutHeading = text.replace(/^\S+\.\s*[^\n]*\n?/, '').trim();
  const laterActs = laterActsFor(citation);

  return {
    found: true,
    citation: `T.C.A. § ${citation}`,
    title: Number(titleNum) || titleNum,
    title_name: chapter?.titleName ?? null,
    chapter: chapter?.chapter ?? null,
    chapter_name: chapter?.chapterName ?? null,
    catchline,
    status: repealed ? 'repealed_or_reserved' : 'active',
    text: bodyWithoutHeading,
    text_chars: bodyWithoutHeading.length,
    history,
    historical_versions: 'not available beyond this snapshot — see this pack\'s description for why.',
    url: titleUrl(titleNum),
    current_through: staleCurrentThrough(),
    data_as_of: staleDataAsOf(),
    source: UPSTREAM,
    attribution: "Tennessee statutes are public law; this document carries Public.Resource.Org's own public-domain notice. Case-law digests (\"Notes to Decisions\") that follow each section in the source are excluded.",
    // OVERLAY (fleet #2916): Public Chapters that touched this exact citation
    // AFTER the 2021-05-21 snapshot, per this pack's own home-built index
    // (Tennessee publishes no citation-to-act index the way Arkansas does —
    // see scripts/bake-later-acts.mjs). NOT MERGED into `text` above — the
    // snapshot text is unchanged by this list; it is only told alongside it.
    // Empty means the index shows no later Public Chapter for this citation
    // across every Effective Report checked (named in sessions_checked
    // below), not that the index failed — ensureLaterActs() above throws
    // loudly if the index itself is missing.
    later_acts: laterActs,
    later_acts_merged_into_text: false,
    sessions_checked: TN_LATER_ACTS_SESSIONS_CHECKED,
    later_acts_data_as_of: TN_LATER_ACTS_CAPTURED_AT,
    later_acts_parse_rate_pct: TN_LATER_ACTS_PARSE_RATE_PCT,
    later_acts_note: laterActs.length
      ? `${laterActs.length} Public Chapter(s) touched this citation since the 2021-05-21 snapshot — see later_acts. These are home-built from Tennessee's own Effective Reports and bill text, NOT a state-maintained index, and the linked bill text is as-filed, not a separately published as-enacted document.`
      : `No later Public Chapter found for this citation across every Effective Report checked since the 2021-05-21 snapshot (${TN_LATER_ACTS_SESSIONS_CHECKED.join('; ')}). This does not guarantee the text is unchanged — only that this pack's own home-built index, parsed from Tennessee's own public bill text, lists no Public Chapter against this exact citation.`,
  };
}

async function tnSearch(args: Record<string, unknown>) {
  ensureIndex(args);
  const query = String(args.query ?? '').trim();
  if (!query) {
    return { found: false, reason: 'missing_query', message: 'query is required, e.g. "security deposit".' };
  }
  const limit = Math.max(1, Math.min(50, Number(args.limit) || 10));
  const words = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];

  const results: Array<{ citation: string; catchline: string; title: string; title_name: string | null; chapter: string | null; chapter_name: string | null; status: string }> = [];
  for (const row of TN_SECTIONS) {
    const [citation, catchline, chapterIdx, repealed] = row;
    const haystack = catchline.toLowerCase();
    if (!words.every((w) => haystack.includes(w))) continue;
    const chapter = chapterIdx >= 0 ? TN_CHAPTERS[chapterIdx] : undefined;
    results.push({
      citation,
      catchline,
      title: citation.split('-')[0] ?? '',
      title_name: chapter?.titleName ?? null,
      chapter: chapter?.chapter ?? null,
      chapter_name: chapter?.chapterName ?? null,
      status: repealed ? 'repealed_or_reserved' : 'active',
    });
    if (results.length >= limit) break;
  }

  return {
    found: results.length > 0,
    query,
    returned: results.length,
    results,
    hint: results.length
      ? 'Call tn_statute with a citation above for the full text.'
      : 'No official catchline matched every word of the query — try fewer or more general words. This searches headings, not the full statutory body text.',
    current_through: staleCurrentThrough(),
    data_as_of: staleDataAsOf(),
    source: UPSTREAM,
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'tn_statute':
      return tnStatute(args);
    case 'tn_search':
      return tnSearch(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
