# @pipeworx/tennessee-code

Tennessee Code Annotated (T.C.A.) — state statutes by citation and by
official catchline (topic search). Keyless.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1857+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

**This pack serves a POINT-IN-TIME SNAPSHOT dated 2021-05-21, not the current
code.** Read "Why this is a snapshot" below before using it for anything
where the exact current text matters — it says so on every response too.

## Tools

- `tn_statute(citation)` — full text of a T.C.A. section by citation
  ("39-13-202" is first degree murder; "66-28-301" is the security-deposit
  statute). Resolves the citation's title via a baked index, fetches that
  title's HTML live, and cuts the section out of it by its own unique
  anchor id. Also returns `later_acts` — every Public Chapter this pack's
  own home-built index shows touching this exact citation since the
  2021-05-21 snapshot (fleet #2916, see "The overlay" below).
- `tn_search(query, limit?)` — topic/keyword search over the baked
  citation + official-catchline index (not full statutory body text).

## Auth

Keyless.

## Why this is a snapshot, not the current code

Tennessee's own publishing arrangement routes the maintained, current TCA
exclusively through LexisNexis's `advance.lexis.com` — a cookie/session-gated
SPA with no stable per-citation URL, confirmed live (traced
`lexisnexis.com/hottopics/tncode` -> `advance.lexis.com/container?config=...`,
which immediately probes for cookie support and only then begins any
client-side render). That is the same class of wall this pack family treats
as OUT (ASP.NET postback / anti-bot / JS-rendered SPA).

There is no OTHER official electronic route, and that absence is litigated,
not merely undocumented: **Public.Resource.Org v. Matthew Bender & Co.**, 686
S.W.3d 1 (Tenn. Ct. App. 2023) (further appeal denied by the Tennessee
Supreme Court, 2024), held that Tennessee's Public Records Act does not reach
the electronic TCA, because LexisNexis is a private contractor performing
services for the Code Commission under a separate statutory arrangement
(T.C.A. § 1-2-114), not a state agency holding a public record. Having lost
that fight — and having lost electronic access to the Code even before filing
it — Public.Resource.Org had **UniCourt scan and transform the print
volumes**, publishing the result at `https://unicourt.github.io/cic-code-tn/`:

> "This repository was created by UniCourt on behalf of Public.Resource.Org.
> All this work is in the public domain and there are NO RIGHTS RESERVED."
> — Release 76, dated 2021.05.21.

That public-domain claim rests on the same "edict of government" theory the
U.S. Supreme Court confirmed for Georgia's own annotated code in **Georgia
v. Public.Resource.Org**, 590 U.S. 255 (2020) — and this is literally the
same transform pipeline (`cic-beautify-state-codes`) and the same stylesheet
reference this repo already trusts for `mcps/georgia-code`'s upstream.

**The same release is also uploaded to archive.org** as item `gov.tn.tca`
(byte-identical statutory text, verified directly). This pack calls the
GitHub Pages copy instead, for two concrete reasons found during
development, not a preference in the abstract:

1. **Reliability/latency.** archive.org's mirror nodes answered this release
   with multiple transient HTTP 500s and multi-second-to-indefinite stalls
   while baking the index and smoke-testing `tn_statute` (a 7.2MB title took
   12.9s on one call and simply never returned on another, even with a 60s
   client timeout and 3 retries). GitHub Pages was consistently sub-second
   for the same files, every time.
2. **Completeness.** archive.org's own upload of Title 47 (Commercial
   Instruments and Transactions / UCC) carries a LexisNexis "© ... All
   rights reserved" notice and different markup entirely (`p.p5`)
   instead of PRO's public-domain transform (`span.boldspan`) that
   every other title there carries — evidently a bad upload of that one
   file. UniCourt's copy of Title 47 is the correct public-domain transform,
   like all 67 other titles. **All 68 published titles are covered by this
   pack** as a result (archive.org's copy would only support 66, with Title
   47 and one other transient-failure title missing).

**No newer release exists anywhere.** Checked both the UniCourt index page's
own "Release NN dated YYYY.MM.DD" listing and archive.org's separate upload:
release 76 (2021.05.21) is the newest either has. The 2023-2024 litigation
above is *why* — Public.Resource.Org was fighting to restore a current
electronic feed and lost. So every response from this pack carries
`current_through` and `data_as_of` stating 2021-05-21 explicitly. Roughly
five Tennessee legislative sessions (2021-2025) of amendments are NOT
reflected.

**Other free routes were checked and ruled out, not merely skipped:**

| Candidate | Result |
|---|---|
| `wapp.capitol.tn.gov` / `capitol.tn.gov` (TN General Assembly) | Publishes **Public Chapters** (session laws as passed) and bill text, but no consolidated current code — its own "Tennessee Code" link routes to the same LexisNexis wall above. Session laws are a DIFFERENT document from the codified TCA (see "Public Chapters are not the Code" below). |
| `law.justia.com/codes/tennessee/` | Serves Cloudflare's "Just a moment" **managed JS challenge** (HTTP 403, `cf_chl_opt` present) to a bare fetch — not a bypassable bare-UA gate, the same bot-wall class this pack family treats as OUT. Google's own crawler evidently gets through (indexed pages appear in search), a plain HTTP client does not. |
| `codes.findlaw.com/tn/` | Same Cloudflare managed challenge, same result. |
| `law.resource.org/pub/us/code/tn/` | This is the **litigation docket** for the lawsuit above (court filings, 2021-2024), not a code mirror. The actual scanned text lives in the two mirrors above, not on law.resource.org's own file tree. |
| SOS (`sos.tn.gov`) | Publishes Acts and Resolutions (session laws), not a consolidated code; it directs electronic TCA requests to LexisNexis per the Code Commission's arrangement. |

### Public Chapters are not the Code

Tennessee's General Assembly publishes **Public Chapters** — the session
laws as enacted, year by year, e.g.
`capitol.tn.gov/Archives/Joint/publications/PublicChapters/2024/...` — and
these ARE current and free. But a Public Chapter is an amending instrument
("AN ACT to amend Tennessee Code Annotated, Title 47...") , not the
codified text itself — reading one tells you a change happened, not what the
amended section now reads as a whole next to the rest of the code. This pack
does not attempt to fold session laws into the frozen 2021-05-21 text (that
reconciliation is exactly what a Code Commission codification does, and is
out of scope here) — it would be dishonest to call that composite "the
current code" without doing the actual reconciliation work. If a caller needs
what changed since 2021, they need the Public Chapters directly, not this
pack.

## The overlay: later acts, never merged (fleet #2916)

Bruce kept `tn_statute` on the frozen 2021-05-21 snapshot ("figure something
out") rather than chase a fully reconciled current code — same call as
Arkansas (fleet #2906) and Mississippi (fleet #2915). This overlay is the
cheapest honest improvement on top of that decision — design and
measurements in `docs/current-statute-routes.md` (#2902).

**The rule: never rewrite the snapshot `text`. Only ever ADD a dated, linked
list beside it, explicitly labelled as not merged.** `tn_statute`'s response
carries:

- `later_acts` — one entry per Public Chapter that touched this exact
  citation since the snapshot date: `public_chapter` (number),
  `general_assembly` (e.g. `"114"`), `bill` (e.g. `"HB0001"`), `link` (the
  bill's own PDF), `verb` (`"amended"` / `"repealed"` / `"new_section"`),
  `source: "tnga"`, `merged: false`. Empty (`[]`) means this pack's own
  index shows no later Public Chapter for this citation across every
  Effective Report checked — not that the overlay failed to load (a
  missing/malformed baked index throws loudly instead, same as
  `tn_search`'s catchline index).
- `sessions_checked` — every Public Chapters Effective Report the index
  covers, named even when `later_acts` is empty, so a caller can tell
  "nothing changed" from "we didn't check."
- `later_acts_data_as_of` — when the overlay was last baked.
- `later_acts_parse_rate_pct` — the measured share of "Tennessee Code
  Annotated, Section/Title ..." amendment clauses the baker could actually
  resolve to a citation, across every bill PDF it fetched for this bake
  (see "Measured coverage" below). `date: null` on every act entry,
  **honestly** — neither the Effective Report nor the bill PDF gives a
  per-citation enactment date (the Effective Report's date is per-chapter,
  not per-section); guessing one would be worse than saying so.

**Source, and why it is HOME-BUILT rather than a state-maintained index
(unlike Arkansas):** Tennessee's legislature publishes no "citation touched
by this act" index the way `arkleg.state.ar.us` does — confirmed by
docs/current-statute-routes.md. This pack builds the index itself from two
keyless public sources, both confirmed live with no bot wall and no login:

1. **Which bills became law, and their Public Chapter number** — the
   Tennessee General Assembly's own "Public Chapters Effective Report"
   (`capitol.tn.gov/Archives/Joint/publications/PublicChapters/<year>/
   PublicChapters_<year><01|07>.pdf`), published twice a year. A plain,
   keyless, text-extractable PDF table of every bill that became a Public
   Chapter that General Assembly, with its PC number and effective
   date(s) — but only a Title/Chapter-level abstract, not exact section
   citations.
2. **The exact citation touched** — each enacted bill's own text, served
   keylessly at `capitol.tn.gov/Bills/<ga>/Bill/<billId>.pdf`, parsed for
   the fixed boilerplate `"Tennessee Code Annotated, Section <cite>, is
   amended ..."` (also `"... is repealed ..."` and, for a wholly new
   section, `"... Title X, Chapter Y[, Part Z], is amended by adding the
   following as a new part/section:"` followed by the new section's own
   numbered heading).

**Known, stated limit: the linked bill text is AS-FILED, not a separately
published AS-ENACTED document.** Tennessee does not host a stable keyless
URL for the signed, final text the way Arkansas's index links straight to
the Act PDF — the one source that would carry it, the Secretary of State's
"Acts and Resolutions" page (`sos.tn.gov`), answers this pack's honest
User-Agent with an HTTP 403 from a CloudFront/WAF rule (confirmed live,
2026-10-09) while a browser UA passes; this pack does not spoof a UA to get
through that wall. So a `later_acts` entry is a reliable signal that *this
citation was touched by this Public Chapter*, linked to the bill's own
filed text — not a guarantee that text is byte-identical to the final
floor-amended language.

**Discovery, not hardcoding:** the set of Effective Reports to check is read
live from `wapp.capitol.tn.gov/apps/WebPublications/Index`'s own publications
table, so a newly published report shows up with no code change — same
self-extension property as Arkansas's `<select>`-driven session discovery.

**A section not found in the Release-76 snapshot but present in the
overlay** is flagged specially: `tn_statute`'s `found: false` response
carries `later_acts_if_created` — if the index shows Public Chapters against
a citation that does not exist in the 2021 snapshot, that is a signal the
section may have been CREATED after the snapshot date, not necessarily a
bad citation.

### Measured coverage (fleet #2916 bake, captured 2026-10-10)

- **11 Effective Reports** checked (July 2021 through July 2026), covering
  the **112th, 113th, and 114th General Assemblies**.
- **1,289 unique (General Assembly, Public Chapter) pairs** discovered.
- **1,289 of 1,289 bill PDFs fetched successfully** (0 missing at the
  expected `capitol.tn.gov/Bills/<ga>/Bill/<billId>.pdf` path).
- **4,245 "Tennessee Code Annotated, ..." amendment CLAUSES** found across
  those bills; **3,858 resolved (90.9%)** into a citation (amended/
  repealed/new-section), **387 unparsed**. The parse rate counts at CLAUSE
  granularity — a clause naming several citations ("Sections 1-2-3 and
  4-5-6, are amended") is one clause, not two, so it cannot inflate the
  rate.
- **3,873 citations extracted** from those resolved clauses (3,767
  amended, 0 repealed — no bill in this window used a bare "is repealed"
  boilerplate, every repeal-shaped clause found used "is amended by
  deleting ... and substituting", which the parser could not safely
  distinguish from an ordinary rewrite and so leaves unparsed rather than
  mislabel — 106 new-section), deduplicated to **2,834 `TN_LATER_ACTS`
  rows**.
- The 387 unparsed clauses break down into two known, honest gaps (never
  silently dropped — a capped 60-entry sample ships in
  `TN_LATER_ACTS_UNPARSED_SAMPLE` in `src/tn-index-data.ts`, and the bake
  script's stderr reports the full count every run):
  - **A chapter/part-level "is amended by adding ... as a new section"
    clause whose new section has no numbered heading in the bill text
    at all** — Tennessee drafting sometimes leaves the citation for the
    Code Commission to assign during codification, so the bill text itself
    never states one (confirmed by eye on several samples — the inserted
    text starts directly with substantive language, no "NN-NN-NNN."
    heading). This is a real limit of the SOURCE, not a fixable parser gap.
  - **A small set of one-off drafting variations** this parser does not
    (yet) special-case: whole-chapter "is amended by deleting the chapter
    and substituting," multi-citation lists with an internal line-wrap this
    build's two repair passes didn't cover, and a few sentences that
    mention "Tennessee Code Annotated" without being an amendment clause at
    all (e.g. a Code Commission publication instruction).
- **Example** (the task's own test citation): **T.C.A. § 39-13-202** (first
  degree murder) carries **3 later Public Chapters** — PC 528 (HB0511), PC
  394 (HB0512), PC 500 (SB1228), all 112th GA — none merged into the
  2021-05-21 snapshot text.

### For the next overlay build: reuse, don't re-derive

The response shape (`later_acts`/`sessions_checked`/
`later_acts_merged_into_text: false`/the "never rewrite text" rule), the
baked-index + KV injection pattern (append new exports to the SAME
`src/tn-index-data.ts` file the catchline index already uses), and the
"discover live, don't hardcode" trick all carry over directly from
Arkansas's #2906 and this pack's own #2916. What's genuinely different per
state: whether the legislature maintains its own citation-to-act index
(Arkansas: yes; Mississippi and Tennessee: no, build one from signed-bill
text) and whether a stable keyless URL exists for the AS-ENACTED text
specifically (Arkansas: yes, the Act PDF; Tennessee: no — see above).

## Four capabilities — two available, two are not

- **Citation lookup** — available (`tn_statute`), across all 68 titles.
- **Topic/keyword search** — available (`tn_search`), but it matches
  OFFICIAL CATCHLINES (section/chapter headings), not full statutory body
  text — the same shape as `mcps/north-dakota-code`'s `nd_search`. There is
  no live full-text search available for this source (it is a static scan,
  not a search API).
- **Amendments/enactment history** — partially available: the "Acts YYYY,
  ch. N, § N; ..." legislative-history line that follows most amended
  sections is included in `tn_statute`'s `text` and, when it parses cleanly,
  surfaced separately as `history`. A section never amended since its
  original enactment may carry no such line at all.
- **Historical version** (a section's text as it read before a given
  amendment) — **not available** beyond whatever this one 2021-05-21
  snapshot preserves. There is no per-year archive the way Colorado or
  Indiana publish, and the live site that would have one (LexisNexis) is the
  wall this pack cannot reach.

## Cutting a section out of its title file

Unlike most sibling state-code packs, there is no heading-regex ambiguity to
resolve here: Public.Resource.Org's transform already gives every section a
**unique anchor id** (`id="t{title}c{chapter}s{citation}"`, e.g.
`id="t39c13s39-13-202"` for 39-13-202). `tn_statute` cuts from that id to
whichever comes first: the next section's id, the next chapter's `<h2>`, or
the title's own `h4#...-NOTESTODECISIONS` heading — the point where
the annotated text switches from the statute (plus its own legislative/
compiler notes) to a digest of case law. That case-law digest is excluded
from every response, the same editorial-vs-statute line `mcps/colorado-code`
draws before its own "ANNOTATION" block.

One markup difference from archive.org's upload of the same release:
UniCourt's HTML uses a bare `<br />` between "Title NN"/"Chapter NN" and the
name, where archive.org's copy used `span.headbreak` (empty) —
`scripts/bake-index.mjs`'s title/chapter regexes accept either, in case a
future release reintroduces the other convention.

## Refresh path

`src/tn-index-data.ts` carries TWO independently-baked tables, both injected
from KV via `workers/gateway/src/pack-baked-indexes.json` as one combined
`_bakedIndex` object rather than bundled (fleet #2754: a value-imported
multi-MB table loads into every gateway isolate whether or not it ever
serves this pack) — same two-table shape as `mcps/arkansas-code`'s
`ar-index-data.ts`:

- `TN_CHAPTERS`/`TN_SECTIONS` — `tn_search`'s catchline index. Rebuild with
  `node scripts/bake-index.mjs > src/tn-index-data.ts` (OVERWRITES the
  file — see below). Re-run only if Public.Resource.Org/UniCourt ever posts
  a release newer than 76 (it always resolves the SITE'S OWN latest
  "Release NN dated YYYY.MM.DD" line rather than hard-coding it).
- `TN_LATER_ACTS`/`TN_LATER_ACTS_SESSIONS_CHECKED` — `tn_statute`'s overlay
  index (fleet #2916, see "The overlay" above). Rebuild with
  `node scripts/bake-later-acts.mjs >> src/tn-index-data.ts` (APPENDS).
  Re-run after each Public Chapters Effective Report is published
  (January, July) — see
  `.github/workflows/tennessee-later-acts-refresh.yml` for the scheduled
  version. Report discovery is automatic (reads the live publications table
  on `wapp.capitol.tn.gov/apps/WebPublications/Index`), so a new report
  shows up with no code change.

**Full regen (both tables)**:

```bash
node mcps/tennessee-code/scripts/bake-index.mjs > mcps/tennessee-code/src/tn-index-data.ts
node mcps/tennessee-code/scripts/bake-later-acts.mjs >> mcps/tennessee-code/src/tn-index-data.ts
```

The catchline bake fetches all ~68 title files (~145MB total) with a short
pause between requests, and fails loudly rather than silently if it parses
suspiciously few rows — that would mean the source's markup changed, not
that the Code got smaller. `TN_EXCLUDED_TITLES` stays wired in as a
defensive check: a title whose HTML does not carry PRO's "is in the public
domain" sentence is dropped and named there rather than silently served as
if it were public domain (empty today — every title in this release
passes). The later-acts bake fetches every Effective Report plus every
bill PDF it discovers, with its own `MIN_ROWS` sanity floor for the same
reason.

Run `node ../../scripts/check-baked-indexes.mjs` after either (from the
repo root) — it dynamically imports the regenerated file the same way the
KV uploader does, and refuses an empty exported array before it ever
reaches deploy.

## Citations

Tennessee cites by title-chapter-section, e.g. "39-13-202" (Title 39,
Chapter 13, Section 202: First degree murder) or "66-28-301" (Title 66,
Chapter 28, Section 301: security deposits). `tn_statute` looks the citation
up against the baked index directly rather than parsing it into parts, so any
suffix shape the index itself uses (e.g. a lettered subsection like
"39-17-417(a)") round-trips correctly as long as it matches an indexed id
exactly.

## Data sources

- `https://unicourt.github.io/cic-code-tn/` — the release index page. Read
  once per bake, not per call, to resolve the current release tag.
- `https://unicourt.github.io/cic-code-tn/transforms/tn/octn/r76/gov.tn.tca.title.{NN}.html`
  — one title's full text (statute + legislative notes + case-law digest).
  Baked ONCE into `src/tn-index-data.ts` as a citation+catchline index (NOT
  statutory text); `tn_statute` fetches the specific title live on every
  call and extracts just the requested section.

Both are plain, keyless, static files on GitHub Pages — no login, no JS, no
rate limit observed, consistently sub-second during development.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "tennessee-code": {
      "url": "https://gateway.pipeworx.io/tennessee-code/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/tennessee-code/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1857+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/tn_statute \
  -H 'Content-Type: application/json' \
  -d '{"citation":"39-13-202"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/tn_statute`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-tennessee-code` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/tennessee-code/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "tennessee-code": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-tennessee-code"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Tennessee Code data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
