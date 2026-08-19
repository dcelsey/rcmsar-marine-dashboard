# Change Requests

Log of user-requested changes. Newest at top. Status: `open`, `in-progress`, `done`, `parked`.

---

## CR-007 — Platform limits and the "add a server" question

- **Logged:** 2026-08-04
- **Status:** parked — analysis done, direction agreed, **no code written**. Resume from the full plan at `C:\Users\DuncanElsey\.claude\plans\we-have-built-a-partitioned-willow.md`.
- **Prompt:** four pressures arriving together — Vercel deploys at the limit, Cloudflare sending 90%-of-quota emails, GitHub Actions unreliability, and general complexity (static site + data files + Actions + two Workers + git-as-deploy-trigger) — plus an expectation of coming requests for per-user preferences ("my station", which cards to show). Duncan's proposal: rather than paying for more Vercel capacity, add a server on the existing (already-paid-for) Bluehost account. Either **(1)** a data-only server — cron fetches, data in a DB rather than JSON files, something pokes cron — or **(2)** move everything, Astro build included.

### The finding: three pressures, three different causes

Only one of them is server-shaped, and the Cloudflare one gets *worse* with a shared host.

| Symptom | Actual cause | Fixed by a Bluehost server? |
|---|---|---|
| Vercel pinned at 95 deploys / rolling 24 h | Data commits to `main` rebuild 95 static pages to move a 39 KB file. **2,052 bot commits vs 105 human commits in the 30 days to 2026-08-04.** | Yes — but so does a free change |
| Cloudflare 90% emails | See arithmetic below — a cron pins the Durable Object awake 24/7 | **No.** Shared hosting is the worst place to hold a persistent WebSocket |
| GH Actions unreliability | Already worked around via `fetch-wind-trigger` → `workflow_dispatch` | Yes — the cleanest genuine server win |
| Complexity | Five moving parts | Only if the server *replaces* pieces rather than joining them |

### The Cloudflare alert is arithmetic, not growth

`crons = ["*/5 * * * *"]` in `cf-workers/ais-proxy/wrangler.toml` exists solely to keep the Durable Object warm. A DO pinned awake bills wall-clock × memory:

- **Duration:** 86,400 s/day × 128 MB = **~11,000 GB-s/day against a 13,000 GB-s/day free allowance ≈ 85%** — before anyone opens the map.
- **Requests:** the `BROADCAST_MS = 1500` alarm tick is ~57,600 alarm invocations/day against a **100,000/day** free allowance ≈ 58%.

That is why the emails arrive regardless of whether the layer is being used. Both metrics collapse together under the fix already logged in CR-003 ("idle when no clients"): with zero clients there is no wall-clock and no alarm tick.

**Correction to CR-003:** that entry says the lever is *not* `BROADCAST_MS`. True for **duration**, false for **requests** — alarm invocations are billed as requests, so 1500 → 3000 ms would halve that number. Idling is still the better fix; keep `BROADCAST_MS` as a second lever if the 90% email names requests rather than duration.

### The strongest argument for a data server — and it wasn't on the original list

Every browser calls Open-Meteo, marine-api and DFO IWLS **directly, every 10 minutes, per viewer** (`refreshMs: 10 * 60 * 1000` on all 31 units; `loadWeather` / `loadWindByLocation` / `loadMarine` / `loadTides` in `src/lib/sources.ts`). With ready-room kiosks running 24/7 across 31 units that is an unbounded per-viewer dependency on two third-party APIs, with no cache, no shielding and no fallback if one gets slow. A data server collapses it to a handful of calls per interval. Neither a data branch nor a Worker buys that cheaply, and operationally it matters more than stored history does.

### Decisions taken (2026-08-04)

1. **Free fixes first, then decide on the server.** Both immediate pains have ~1-hour fixes that cost nothing and lock nothing in. Deploys ~68/day → ~3.5/day against a ~95 ceiling; DO usage → near zero. See CR-006 for the deploy half.
2. **Flat files, no database.** Decoupling data from deploys is the win. Structure the fetch scripts so a later history write is additive rather than a rewrite.
3. **The site stays on Vercel.** Option 2's motivation is the deploy ceiling, which the free fix removes. `dist/` is only 95 HTML files / 3.5 MB so moving it *would* work, but you would build in Actions and FTP-deploy — re-introducing the dependency being shed — and trade a CDN, branch previews and push-to-deploy for consolidation alone.
4. **Bluehost Node.js support is unverified and gates everything.** If cPanel has "Setup Node.js App" / Node.js Selector, the three `.mjs` scripts move across near-verbatim (~a day's work). If it does not, this becomes a PHP rewrite of `fetch-wind.mjs` — cadence inference, QA flags, co-located dedupe, per-source carry-forward — with real risk of silent behaviour drift. That is a separate go/no-go, not an assumption. Also verify: cron granularity, outbound HTTPS, a subdomain with Let's Encrypt SSL, and the host's long-process policy against `fetch-tides.mjs` (327 stations × 2.1 s ≈ **11–12 min wall clock**, mostly sleeping on network I/O, 4×/day).
5. **No cron-poker Worker is needed.** cPanel cron is real cron — that is much of the point of the move.

### Per-user preferences: cookie, not server

"My station" and "which cards to show" are the same shape as CR-001's unit selectors, and CR-001 already settled the storage question — **cookie, read by an inline pre-paint script**, following the `map-layers` precedent in `src/components/MarineCurrents.astro`. A server buys exactly one extra thing: cross-device sync, which needs identity → accounts → password resets and member-data handling for a volunteer organisation. **Don't build it until someone asks specifically for settings following them between devices.** Note Lively strips query strings *and* fragments, so URL-encoded preferences aren't available for the widescreen view.

### If the free fixes ever fail, for reference

Vercel Pro is $20/mo and fixes only deploys; Cloudflare Workers Paid is $5/mo and fixes only the DO. The free fixes address both.

## CR-006 — Stop the 15-min data commits consuming the Vercel deploy budget

- **Logged:** 2026-07-31
- **Status:** open — **blocking. The budget is saturated, not merely tight.**
- **Why this is now urgent:** production deploys sit pinned at **95 per rolling 24 h** (CR-005 has the measurement), so the wind bot alone consumes essentially the whole allowance. There is no spare capacity for previews *or* for a normal development session — hand-pushed commits displace the bot's data deploys and the live dashboard falls behind while you work. This isn't a future risk; it happened repeatedly on 2026-07-31.

### 2026-07-31 — the actual model: a saturated rolling window

Duncan's hypothesis, and the measurements bear it out. The limit is a **rolling 24-hour window**, not a daily quota that resets. Across 1790 deployment records, the rolling-24 h production count sits **pinned at exactly 95** — deployment after deployment, all day, not drifting around 95. That's the signature of saturation: the wind bot's 15-min cadence consumes the budget, one slot ages out roughly every 15 min, and whatever attempts next takes it.

Consequences worth internalising:

- **Every hand-pushed commit competes with the wind bot for that single slot, and can win.** Measured on 2026-07-31: bot data deploys at 19:15 and 19:30 both refused, while a code push at 19:24 succeeded — leaving the live site serving `wind.json` 28 min old. **You cannot run a development session and keep the dashboard current at the same time.** Batch commits, and expect data to lag by roughly half the staleness budget while working.
- **`retry in 24 hours` is generic text, not a literal wait.** The window drains continuously; what looked like a 9-minute "recovery" was simply the next slot freeing. There is nothing to wait out.
- **Deploys ship the whole tree, so a refusal delays data rather than losing it.** The 19:24 code deploy carried the bot's 19:15 `wind.json` with it — which is why the site had data at all. Any success brings everything current, whoever triggered it. This bounds the damage and is why the earlier "the dashboard is frozen" panic was wrong.
- **The ceiling isn't cleanly 100.** The rolling count reached **120 on 2026-07-16** without apparent trouble, so there may be burst allowance or the limit has changed. The Vercel usage page is authoritative; **GitHub deployment records miss previews entirely**, so anything inferred from them undercounts.

### 2026-07-31 18:47Z — the limit fired, briefly

Pushing `feat/ais-layer` to try a branch preview, against a budget already ~96% committed to the wind bot, produced `Deployment rate limited — retry in 24 hours`. It cost one **production** deploy as well: the AIS merge `c91ea03` was refused and carries a `Vercel: failure` status.

**It recovered in about nine minutes, not 24 hours.** The next bot commit (`addd446`, 19:01:25Z) deployed normally and carried the AIS merge live with it. Two lessons, both of which cost time here:

- **The "retry in 24 hours" text overstates it.** Treat a rate-limit failure as one refused attempt, not an outage.
- **A refused deploy is not a lost one.** Content ships with the next commit that gets through, so check whether the deployed SHA *contains* yours (`git merge-base --is-ancestor`) before concluding anything is stuck. I wrote a prominent "production is blocked, dashboard is frozen" warning into HANDOVER on the strength of one failure status and had to retract it ten minutes later — the failing status was real, the conclusion drawn from it was not.

The underlying squeeze is still real: previews genuinely can't run, and a production deploy was collateral. Also worth knowing — GitHub recorded only 75 deployments that day, but previews create no deployment records, so Vercel's own count is higher than anything observable from the API. **Don't use the GitHub deployment count to judge remaining headroom.**

### Corrected fix direction

The earlier framing — "serve `wind.json` from a Worker" — was half right. **Deploys are triggered by the commits, not by where the file is read from**, so moving only the read path leaves ~96 deploys/day untouched. The fix has to stop data commits landing on `main` at all:

1. **Data branch** (preferred, no new infrastructure): fetch workflows commit to a `data` branch; `vercel.json` sets `git.deploymentEnabled` false for it; the client reads `wind.json` from `raw.githubusercontent` at that branch. Deploys then track code changes only — a handful a week — and branch previews become possible for the first time.
2. **R2 / KV**: workflows write there instead of the repo. No data commits anywhere, cleanest, but more moving parts and Cloudflare setup.

### 2026-08-04 — implementation detail worked out (not yet built)

Designed alongside CR-007; four things that aren't obvious until you try to write it.

- **Build the seam first, and make it the deliverable.** Add one `DATA_BASE` constant in `src/lib/sources.ts` and route `loadLiveWind`, `loadCurrents` and `loadTidesMap` through it. All three already share the identical `fetch(url + '?t=' + Date.now())` → `res.json()` shape, so it's one helper and three one-line changes. That constant is what later flips to Bluehost, R2 or a Worker as a **one-line change** — so this step is worth doing even if the destination changes.
- **The workflow must keep checking out `main`.** Checking out `data` would run whatever stale copy of `scripts/fetch-wind.mjs` that branch happens to hold. Check out `main` for the script, run it, then commit only the output onto `data` via a worktree (`git fetch origin data` → `git worktree add ../data-out data` → copy → commit + push from there). **Keep the 5-attempt `git pull --rebase` retry loop** — the three workflows now race each other on `data` instead of on `main`; the race is smaller, not gone.
- **`vercel.json` is essential, not optional.** There is none in the repo today (Vercel zero-config auto-detects Astro and will continue to). Without `{"git": {"deploymentEnabled": {"data": false}}}`, a push to `data` creates a *preview* deploy, which counts against the same budget.
- **Keep the same-origin `/data/*.json` files as a fallback, because the staleness machinery makes a frozen copy fail safe.** A stranded `wind.json` ages past `max(STALE_MIN, cadence + 15)` within ~75 min and the frontend hard-filters `!stale`, so it renders *nothing* rather than something wrong; currents and tides carry event timestamps and simply run out of upcoming events. Degrading to forecast-only is the correct failure mode here — which is what makes depending on `raw.githubusercontent` acceptable as an interim step.

Do this **before** the next reset, so the first deploy after the limit clears ships the fix along with everything queued behind it. Otherwise the budget re-exhausts the following day.

- **Original entry (2026-07-31, before the limit fired):**
- **Problem:** the client reads `/data/wind.json` out of the Vercel deploy bundle, so every 15-min bot commit must trigger a full rebuild just to move a ~26 KB file. That's **~96 deploys/day against the Hobby tier's 100/day cap** (93–96/day observed all week). Nothing has broken, but the headroom is a few deploys, and the failure mode is silent: fresh data lands in the repo while the site serves a stale build. Commit-message tokens are **not** a lever — Vercel here ignores both `[skip ci]` and `[skip vercel]` (CR-005).
- **Direction:** serve `wind.json` from a Cloudflare Worker (or R2), so data freshness stops depending on a rebuild. Deploys would drop from ~96/day to a handful — only real code changes. This reuses infrastructure already in place and understood: `cf-workers/fetch-wind-trigger/` and `cf-workers/ais-proxy/`. Duncan's call, 2026-07-31, on realising the AIS layer already works this way and costs zero deploys.
- **Why a Worker over raw.githubusercontent:** raw does work — it sends `access-control-allow-origin: *` and caches 5 min, comfortably inside the 15-min refresh — and it was tried in `7c265ce`, then reverted in `e0281fd`. It's the zero-infrastructure option and a reasonable fallback. A Worker is preferred because it gives control over cache headers, can serve currents/tides the same way, and keeps the data path on infrastructure we already operate rather than depending on GitHub's CDN behaviour for a SAR tool.
- **Sequencing — this is the trap that bit once already.** The loader change must be **live in production** before any attempt to reduce deploys. Deploys are what ship the loader, so cutting them first strands the very change that makes cutting them safe. Order: (1) change the client to read from the Worker, (2) merge and confirm the **deployed bundle** actually fetches from it, (3) only then reduce deploy frequency. Verify with the deployed asset, not the repo.
- **Also worth doing at the same time:** `currents.json` and `tides-map.json` have the same shape (6-hourly, ~8 deploys/day between them). Moving all three makes the deploy count reflect code changes only.

## CR-005 — Vercel skips commits that land during an in-flight build

- **Logged:** 2026-07-30 · **corrected 2026-07-31** (the original diagnosis below was wrong)
- **Status:** understood — no action needed beyond knowing the behaviour
- **What's actually true.** Vercel deploys **promptly and indiscriminately**: every deploy studied ran **14–18 s after its commit**, for bot and code commits alike. What decides whether a commit deploys is **isolation in time**, not its author or message. A commit landing while a previous build is in flight is coalesced away; its content ships with the next deploy instead.

  Over the last 24 h (102 deployed / 32 skipped):

  | | median gap from previous commit |
  |---|---|
  | deployed | **899 s** (~15 min) |
  | skipped | **326 s** (~5 min) |

  Bot commits arrive 15 min apart in isolation, so they nearly always deploy. Hand-pushed commits tend to arrive in bursts, so they usually don't — which is the whole illusion.
- **Practical implication:** after pushing code, expect it to reach production on the **next isolated commit**, typically within one 15-min bot cycle. Don't push a burst and assume the last one shipped, and **don't read a missing deployment record as a failure**. Verify by checking whether the deployed SHA *contains* your commit (`git merge-base --is-ancestor <yours> <deployed>`), not by looking for your own SHA.
- **Still true:** Vercel ignores **both** `[skip ci]` and `[skip vercel]` here — `dd76a98` carried both and deployed anyway. Commit-message tokens are not a usable lever for cutting deploy count. An attempt to use one was reverted in `5918c7a`.
- **Why the original diagnosis was wrong** (worth recording, because the method failed silently): it claimed *"plain code pushes don't deploy — zero of the last 100 deployments correspond to a code commit."* Two compounding errors. (1) The 100-deployment sample ended at 19:45 on 2026-07-30, and the only code commits inside it had been coalesced; `e0281fd` — a code commit — deployed at 20:15:10 with a normal 15 s lag, just *after* the sampled window. (2) The per-commit probe used `GET /deployments?sha=<full-sha>`, which returned `0` even for `e0281fd`, a commit that demonstrably deployed. **That filter is unreliable — enumerate deployments and match on `.sha` instead.** Duncan caught this by comparing a commit time to its actual deploy time in the Vercel dashboard.
- **Deploy volume:** the wind bot still drives ~96 deploys/day against the Hobby tier's **100/day** cap (93–96/day observed). Nothing has broken, but headroom is thin. Reducing it means decoupling data delivery from the deploy bundle (serve `wind.json` from raw.githubusercontent, a Worker, or R2) so freshness doesn't need a rebuild — commit-message tokens won't do it. A first attempt at the raw.githubusercontent half was reverted in `e0281fd` as unverified, not as wrong.

## CR-004 — Hourly marine stations blank out at the top of each hour

- **Logged:** 2026-07-30
- **Status:** done (2026-07-31)
- **Problem:** Kelp Reefs, Discovery Island and Victoria Harbour disappear from the sar33 wind card for part of each hour. Reported live on 2026-07-30 after the CR-002 work.
- **Cause:** CR-002 set `WINDOW_MIN = STALE_MIN` (60) in `scripts/fetch-wind.mjs`. That leaves zero slack for publication lag. These sites report hourly on the hour, and ECCC publishes the ob roughly 5–6 min later. A fetch running between :00 and :06 therefore sees the previous hour's ob as *just* outside the 60-min look-back (60.5 min old → excluded) while the current one isn't published yet → the station is absent entirely. Confirmed: the 20:00:27 run wrote `count=34` with all three absent; the 20:06:32 run wrote `count=78` with all three present and fresh.
- **Why it's worse than it sounds:** whichever snapshot happens to deploy freezes for the full 15-min deploy cycle, so a blackout fetch can strand the dashboard without those stations for 15 minutes. This is still better than the pre-CR-002 behaviour (20-min window missed them ~75% of the time) but it is visibly broken.
- **Fix direction:** decouple the fetch window from the staleness bound — the look-back should be *larger* than `STALE_MIN` so the newest available ob is always retrieved, and let the `stale` flag (computed from `obs_time`) decide what renders. A station whose newest ob is 70 min old is then fetched, marked stale, and filtered by the frontend, which is the honest result. Suggested `WINDOW_MIN = 120` (2× `STALE_MIN`).
- **Measured cost of the wider window** (full BC bbox, 2026-07-30):

  | window | features | stations | payload | fetch |
  |---|---|---|---|---|
  | 60 min | 1684 | 89 | 12.3 MB | 1.3 s |
  | 120 min | 3407 | 98 | 24.9 MB | 1.9 s |
  | 180 min | 5137 | 99 | 37.5 MB | 2.7 s |

  All well under `limit=10000`. 120 min costs ~+12 MB and ~+0.6 s per run against a job that takes 12–45 s, so it is affordable — but ~25 MB every 15 min is ~2.4 GB/day off a public government API.
- **Worth trying first:** the OGC `&properties=<csv>` parameter to return only the ~14 fields `fetch-wind.mjs` actually reads, which should cut the payload dramatically and make the wider window cheap. **This was never tested** — verify GeoMet supports it, and confirm `geometry.coordinates` and the `*-qa` fields still come back, since `pickWithQa` depends on the latter.

### Resolution (2026-07-31)

Widening the window turned out to be **necessary but not sufficient**, and the second half is the interesting part.

1. **`&properties=` works and is lossless.** 25.0 MB → 1.8 MB and 1.85 s → 0.73 s on the same query. `geometry.coordinates` survives. The `-qa` fields do **not** come back unless named explicitly — they're absent from many features but are valid collection fields, so requesting them is safe. Verified by a differential run against the unfiltered query: 101 stations both ways, **zero** value or QA-flag mismatches. **Gotcha:** one unknown property name makes GeoMet return HTTP 400 for the *entire* query, so any field added here must be checked against the collection schema first.
2. **The window alone didn't fix the symptom.** With `WINDOW_MIN` widened, the hourly stations were fetched — but `STALE_MIN = 60` still hid them. An hourly station's newest ob is *always* 0–66 min old, so a flat 60-min bound classifies it stale for ~6 min of every hour while it is reporting perfectly on schedule. Caught live at 17:00:13Z with Kelp Reefs at age 60.2 min, flagged stale.
3. **Fix: cadence-aware staleness.** A station is now stale when it has *missed a report*, not merely when its reading is old: `stale = age > max(STALE_MIN, cadence + 15)`, where cadence is the median gap between that station's own recent obs (`medianCadenceMin`), carried in a new `cadence_min` field. Hourly sites stay visible to 75 min; a 1-min station that dies is still stale at 60 min, so the SAR-critical bound is untouched where it's meaningful.
4. **`WINDOW_MIN` is 180, not 120.** At 120 an hourly station intermittently had only *one* ob in-window, so cadence came back `null`, fell back to the flat floor, and the station vanished again. 180 always spans three hour boundaries, guaranteeing ≥2 obs. Cheap because of `properties=` (~2 MB, 1.7 s per run).

**Verified:** replayed the pipeline at every minute of the blackout (00–05 past the hour) with realistic publication lag — all three stations shown throughout, where previously all three were absent. Plus a 7-case table covering dead stations at each cadence.

**Known limit:** sites reporting less often than ~90 min still infer `cadence_min: null` and fall back to the `STALE_MIN` floor. None are currently in use near any station; revisit if one is ever added.

## CR-003 — AIS layer follow-ups (deferred from `feat/ais-layer`)

- **Logged:** 2026-07-14
- **Status:** open — the layer itself **shipped to `main` 2026-07-31**; these are the deferred items
- **Shipped in that merge**, beyond the original branch: debug logging stripped from the Durable Object; AIS free text (vessel name, destination) escaped before reaching `innerHTML`; the upstream connection now opens only when the layer is switched on rather than on every page load; position currency judged per vessel against its own observed reporting cadence, with markers fading and popups saying "last heard"; the feed-health indicator moved out of the legend to sit beside the AIS toggle, with a 30 s silence watchdog so it can't keep claiming "live" after a silently dropped socket.
- ~~**Needs a `wrangler deploy`:** the `cadenceMs` measurement and the `MetaData.time_utc` preference are in `cf-workers/ais-proxy/` but not yet live.~~ **Deployed 2026-08-06** alongside the watchdog fix below.

### 2026-08-06 — no vessels rendering: an aisstream.io outage, plus two defects it exposed

**The outage is upstream and nothing on our side fixes it.** aisstream.io went mute at **2026-08-05 13:31 UTC**: the handshake succeeds, the subscription is accepted, the socket stays open, and no message is ever sent. Corroborated by other users at `aisstream/issues` **#257** and **#259** — valid keys, freshly issued keys, global bounding boxes and multiple IPs all affected. Their service is chronically unreliable (see also their #21, an expired TLS cert in May 2026), so expect recurrence and **check their issue tracker before debugging our stack**.

**Triage order that got there fastest**, worth reusing:

1. `curl https://ais-proxy.fetchwind.workers.dev/health` — `msgs_this_connection: 0` while `connection_age_ms` climbs means the problem is upstream, full stop.
2. Probe aisstream directly with a deliberately invalid API key. A bad key is **closed in ~1.2 s with code 1006**, so a connection that *stays open* proves our key is registered and our subscription accepted — credentials ruled out in one step.
3. Only then look at our code.

**The bounding box is a dead end** — upstream documents that corner order has no effect. The warning in `AIS_LAYER_SPEC.md` that it was "easy to get wrong" sent this investigation chasing a bug that did not exist, and has been corrected.

**Two real defects found and fixed in `durable.js` (deployed 2026-08-06).** Both are why a 24-hour outage was invisible rather than obvious:

- **`upstreamState` was set to `"live"` on socket-open**, before a single message. An open socket only proves the WS handshake succeeded; it says nothing about whether data will ever flow. So the DO spent a day telling every dashboard the feed was healthy while `lastUpstreamMsMs` had never been set. `"live"` now requires a first message, and the reconnect backoff resets there too rather than on open.
- **No silence watchdog on the upstream leg**, which made a mute or half-open socket *terminal*: `upstreamState` only changed on `close`/`error` events that never fired, `ensureUpstream()` and `/keepalive` both short-circuit on the stale `this.upstream`, and the `*/5` cron kept the DO warm so it never restarted into a fresh connection. A 60 s watchdog now forces a re-dial. The browser client has had exactly this guard since day one (`SILENCE_TIMEOUT_MS` in `src/lib/aisClient.ts`) — only the upstream leg lacked it.

`/health` now also reports `msgs_this_connection` and `connection_age_ms`; without them, "socket never opened" and "socket open but upstream mute" both read as `last_msg_age_ms: null` and are indistinguishable.

**Interacts with "Idle when no clients" below** — the watchdog re-dials every 60 s for the duration of an upstream outage. Harmless at present, but the two should be implemented together so idling wins when client count is zero.

### 2026-08-06, later — upstream changed failure mode, and the churn exposed two more defects

**The outage is the same outage**; only its presentation changed. aisstream stopped holding sockets open and silent and began accepting them then dropping them with code **1006**. The two are indistinguishable from the dashboard — one is closed by our 60 s watchdog, the other by upstream with backoff re-dialling to a 30 s ceiling — so **`msgs_this_connection: 0` is the field that settles it**, not the state field.

**A "connecting" / "reconnecting" status chip is the expected appearance of this, not a second bug.** Worth stating plainly because it *looks* like a regression: before this week the chip would have read a confident "live" throughout, which is precisely the defect that hid the outage for a day. Honest states that change are an improvement over a stable lie.

The higher socket churn exposed two defects in the watchdog work above, both now fixed and deployed:

- **`handleUpstreamClose` acted on whichever socket was current rather than the one the event came from.** A close arriving after we had already discarded that socket and dialled a replacement would tear down the healthy new connection and schedule another reconnect. Harmless while connections lasted minutes; a real hazard once upstream started flapping, because it is a self-inflicted way to never recover when the feed returns. Listeners now name their socket and late events are discarded.
- **The connection clock was not cleared when a connection ended**, so `/health` reported a climbing `connection_age_ms` while the state said `reconnecting` and no socket was open — a self-contradiction in the one field added to remove exactly that ambiguity.

**General lesson for any reconnecting socket here:** an event handler bound to a connection must verify the connection is still the current one before acting on shared state. The bug only appears under churn, which is when recovery matters most.

### 2026-08-19 — two weeks on, aisstream looks abandoned; AIS control hidden

**Status: the feed has not returned and probably will not.** Fourteen days silent. Their tracker carries ~15 open reports dated 2026-08-07 → 08-19 with **no maintainer reply on any of them**, including #269 ("silent since 2026-08-05", our exact date), #276 ("Please Explain What's Up") and — the telling one — **#278, someone offering to buy the service or run it**. Users note previous outages ran 3–4 days. Our proxy remains healthy throughout and still reports `msgs_this_connection: 0`; a bad API key is still closed in ~1.2 s, so their auth layer is alive and only the data plane is dead. **Nothing to fix on our side.**

Beware the "alternate feed" thread (#273): it has attracted strangers posting personal Gmail addresses soliciting business. Lead-gen, not recommendations.

**Done: the AIS control is hidden**, `AIS_COVERED.show = false` in `src/lib/stations.ts` — one line, all 25 covered units, and the same line restores it. This extends the reasoning already applied to the North Coast units: with no data to deliver, a toggle plus a permanently "connecting" chip is worse than no control, because a crew reads a broken indicator as an outage they should be acting on. **This only reaches crews once deployed** — it changes site output, unlike everything else in this outage.

### Replacement feed — VesselAPI evaluated and rejected (2026-08-19)

Investigated as the most promising candidate. **It does not fit, on two independent grounds.**

- **The free tier is unusable and the streaming model is the wrong shape.** Free is **150 API calls/month** — about five a day — and **WebSocket/webhook delivery is paid-plan only**. Worse, their "WebSocket" is a *Notifications* API for discrete events (port arrivals, departures, ETA and speed changes, geofence crossings), **not a position firehose**. There is no equivalent of "stream every vessel in this box", which is the shape our whole proxy is built around.
- **At a usable cadence it costs real money.** Positions come from REST `/v1/location/vessels/bounding-box` (300 requests / 5 min limit, 4-hour query window, rejects overly dense areas). One shared poll serves all 25 units, so cost is set purely by refresh interval: 5-minute polling ≈ 8,600 calls/month → **Starter $59.99/mo**; 2-minute ≈ 21,600 → **Growth $159.99/mo**; 1-minute ≈ 43,200 → **Pro $249.99/mo**. And 5-minute-old positions are a materially worse product than the ~1.5 s live feed we had.

**The architecture is not the obstacle** — the proxy already caches by MMSI and broadcasts on a tick, so a REST poller could replace the WebSocket upstream with the fan-out untouched. Only `connectUpstream` / `handleUpstreamMessage` in `durable.js` are provider-specific. Cost and data shape are the obstacles.

**Implication: free WebSocket AIS appears to be gone as a category.** aisstream was the only provider offering it at zero cost. That reframes the choice: pay monthly for a worse-cadence REST feed, or **put up a receiver**. An RTL-SDR or dAISy at a unit is a one-off hardware cost, gives genuinely local low-latency coverage of that unit's own operating area — arguably better for SAR than regional coverage — and contributing the feed to AISHub unlocks their global data for free. Open question for Duncan; not started.
- **Context:** `feat/ais-layer` shipped the minimum viable AIS overlay (CF Worker + Durable Object proxy → sar33-only, Salish Sea bbox, in-memory cache). The following items were deferred from that branch pending review.
- **Items to resolve before wider rollout:**
  - **Persistence.** DO cache is in-memory; a proxy restart briefly blanks the map for new clients. Move cache to Supabase (or Cloudflare KV / Durable Object storage) so restarts are transparent.
  - **Default state.** Layer currently defaults OFF (opt-in via toggle). Product decision needed on whether to default ON at launch of full rollout.
  - **Own-asset styling.** Should known RCMSAR MMSIs be styled distinctly (colour, pinned always-on, "own vessel" badge)? Requires the MMSI list per unit.
  - **Coverage expansion.** Broaden bbox from Salish Sea to full BC coast (WCVI, north coast) as we enable AIS on outer-coast stations.
  - **Station rollout.** Enable `ais.show` on stations beyond sar33 once the above is settled.
  - **Breadcrumbs.** Spec §1 says historical trails are a non-goal at launch; revisit if crews ask for a short (5–15 min) tail behind moving vessels.
  - **Observability.** Add real health monitoring on the `/health` route (uptime pings, alert on `upstream != "live"` > N minutes).
  - **Idle when no clients** (noted 2026-07-31). The `*/5` Cloudflare cron keeps the Durable Object warm permanently, so it holds the upstream WebSocket and processes AIS traffic 24/7 even with nobody watching — observed live as `clients: 0` alongside `upstream: "live"`, 417 vessels. Deliberate (a cold start would make the first viewer wait for the cache to fill) but it is the only ongoing cost the layer carries. If CF Durable Object duration ever becomes a concern, the lever is idling the upstream after N minutes with no clients and reconnecting on demand — **not** reducing `BROADCAST_MS`. Check DO duration in the CF dashboard before assuming it matters.
    - **Promoted 2026-08-04 — it is now the concern, and the arithmetic is in CR-007.** ~11,000 GB-s/day duration against a 13,000 free allowance (~85%) plus ~57,600 alarm invocations against 100,000 requests (~58%), which is what the Cloudflare 90% emails are. Fix: close the upstream and stop scheduling the alarm when client count hits zero, reconnect lazily on the next `/ais` upgrade, and drop the `*/5` cron — its only job is defeating exactly this. **The "not `BROADCAST_MS`" advice above is right for duration and wrong for requests** (alarm invocations bill as requests); keep it as a second lever. This deploy is overdue anyway — the `cadenceMs` / `time_utc` work above is still not live.
  - **Note for cost discussions:** AIS adds **zero** GitHub commits and **zero** Vercel deploys — the browser talks to the Worker over a WebSocket at runtime, and `wrangler deploy` is a separate Cloudflare quota. Merging the branch costs one Vercel deploy, once. This is the opposite of the wind pipeline (CR-006), and the two shouldn't be reasoned about together.
  - **API key rotation.** aisstream key is a `wrangler secret`. Note a rotation cadence and where the key lives.

## CR-002 — Preserve wind stations missing from a pull

- **Logged:** 2026-07-13
- **Status:** done (2026-07-30)
- **Problem:** Some live wind stations occasionally don't appear on the dashboard. Suspected cause: they aren't included in every upstream pull (source may drop stations intermittently rather than the fetch failing).
- **Diagnosis:** Reported again 2026-07-30 as "no live wind on Oak Bay, forecast only". Two independent causes, both in `scripts/fetch-wind.mjs`:
  1. **Whole-source failure wiped the source.** GeoMet is intermittently flaky — it returns both `fetch failed` and spurious `HTTP 404`s on URLs that work seconds later (reproduced twice while fixing this). The old code only preserved the previous file when *every* source failed, so a SWOB outage with NDBC healthy wrote a valid-looking file containing just the 6 offshore buoys. Nothing within 25 km of Oak Bay survived, so the card fell back to forecast-only. Hit 9 of the last 150 runs (~6%), each blanking live wind for a full 15-min cycle.
  2. **The 20-min look-back window missed hourly reporters.** The marine sites that matter most to Oak Bay — KELP REEFS, DISCOVERY ISLAND, Victoria Harbour — only report hourly, so they landed in roughly 1 run in 4. This is the original CR-002 symptom: stations flickering in and out with no fetch failure at all. Station counts swung 32 ↔ 89 between runs for this reason.
- **Resolution:**
  - Per-source carry-forward: when one source fails, its stations are carried from the previous file with `stale` recomputed from the real `obs_time`. Answers the open questions — carried entries persist only while inside `STALE_MIN` (60 min), then drop, so a prolonged outage decays to nothing instead of freezing an ancient snapshot. Persisted in `wind.json` itself, no separate cache file. The frontend already hard-filters `!stale`, so no UI change was needed to keep carried data honest.
  - `WINDOW_MIN` now tracks `STALE_MIN` (60 min). Nothing inside the window is stale by definition, and the existing newest-per-station reduction keeps it to one ob each. Costs ~300 ms per fetch; station count is now a stable ~89.
  - New `degraded` flag on the payload so a source failure is visible in the committed JSON, not just in ephemeral Actions logs.
  - Added co-located dedupe: the wider window exposed 9 sites publishing under two `msc_id`s at identical coordinates (Victoria Harbour, Tofino, Nanaimo, Abbotsford …), which stacked two markers on the same pixel. Now collapsed to the most complete record.

## CR-001 — Imperial ↔ metric unit toggle

- **Logged:** 2026-07-13
- **Status:** open
- **Problem:** Units are currently fixed (metric-ish — knots for wind, metres/°C, etc.). Users want a global toggle between imperial and metric.
- **Proposal:** Global unit preference persisted in localStorage. Toggle affects:
  - Wind speed (kts ↔ mph — note kts is arguably neither; confirm desired default per mode)
  - Temperature (°C ↔ °F)
  - Distance / height (m ↔ ft) — tide heights, wave heights, visibility
  - Precipitation (mm ↔ in)
- **Open questions (mostly answered 2026-07-31, see below):**
  - ~~Where should the toggle live in the UI? (header, settings drawer, per-tile?)~~ → settings icon opening a popup.
  - ~~Marine convention keeps wind in knots regardless — should "imperial" mean mph or stay knots?~~ → dissolved: speed is a three-way choice, not part of a binary.
  - Should the toggle apply to forecast tiles as well as live/glance tiles?

### 2026-07-31 — Duncan's direction

Not scheduled; logged so the shape isn't re-derived later. Re-raised independently of this entry, which suggests it's a real recurring want rather than a one-off.

**It isn't one imperial/metric switch — it's per-quantity selectors.** That supersedes the binary framing above:

- **Speed** (wind *and* current): knots / km/h / mph — three options, so the "does imperial mean mph or knots" question no longer arises. A crew can keep knots for water and still read km/h for wind if that's what they think in.
- **Distance / height:** m / ft
- **Temperature:** °C / °F

**Persist in a cookie, not localStorage** — correcting the proposal above. This matters beyond preference: the map-layer toggles already use a cookie (`map-layers`) read by an inline pre-paint script in `MarineCurrents.astro`, precisely so the page doesn't paint the wrong state and then correct itself. Units have the same problem in a worse form — a wind speed that renders as `12` and flips to `22` a moment later is briefly *wrong*, not merely restyled. Follow the existing pattern.

**UI:** a settings icon opening a popup. Worth noting the kiosk and widescreen views have no room for another control and are read from a distance, so this likely belongs on the standard view with both other views inheriting the cookie.

**Scope worth knowing before estimating.** Units are formatted in more places than the tiles:

- `refresh.ts` renderers — glance tiles, wind table, hourly strip, daily list, marine/wave table, tide table
- Leaflet marker tooltips and popups for wind barbs, tide markers, current arrows, AIS vessels
- The **map legend's speed ramp** is labelled in knots (`< 0.2`, `5+ kn`) and the wind chips in `< 15 / 15–21 / 22+ kn` — the thresholds themselves are conventional in knots, so converting the labels without rethinking the bands would produce odd boundaries like `27.8+ km/h`
- AIS vessel speed (SOG) and the wave/period columns

A single formatting helper reading the cookie is the obvious approach; the work is in routing every call site through it rather than in the conversion itself.
