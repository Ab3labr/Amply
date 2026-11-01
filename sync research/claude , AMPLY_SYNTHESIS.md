# Amply — Synthesis: What to Actually Build

> **Status audit (2026-11-01):** This is research synthesis and proposed future architecture, not a record of shipped behavior or an approved implementation mandate. The NTP-style estimator exists in `src/lib/clock-sync.ts`, but playback does not consume it. Scheduled epochs, readiness/admission tiers, playback-rate nudges, acoustic calibration and observer/satellite modes are proposals, not implemented features. The current implemented room synchronization is described in `AI_CONTEXT.md` and `Amply_Backend_Implementation.md`. `PRODUCT.md` is an untracked product brief, not implementation evidence; use source for behavior and `sync research/Amply_UI_UX_Design_Notes.md` for approved visual decisions.

Three independent takes on the same problem, run through Claude, Gemini, and Perplexity. Read together, they're more useful than any one alone — mostly because of where they *agree without coordinating*, and one place where they meaningfully disagree.

---

## 1. Scorecard — What Each Doc Actually Contributes

**Claude's doc:** Solid and practical. EWMA per-device latency calibration, rate-nudge drift correction, the acoustic-phase-lock idea (use the room's mic as a sync signal), and an honest "here's your real ceiling" framing. Weakest on rigor — treats clock offset as a single number, no uncertainty modeling, no kill criteria.

**Gemini's doc:** Names the state machine cleanly (`PREPARING` → `ARMED` → trigger), which is genuinely useful engineering vocabulary the other two lack. Its central claim — anchor everything to `AudioContext.currentTime` for "hardware independence" — is where it overreaches. More on this below; it's the one real disagreement worth resolving before you write code.

**Perplexity's doc:** The most rigorous by a clear margin. Three contributions the other two don't have:
1. **Splits the product honestly in two** — "Amply Session" (sync media *state* via YouTube, realistic today) vs. "Amply Array" (true distributed speaker, requires abandoning YouTube as the audio engine). This reframe alone is worth the read.
2. **Uncertainty as a first-class value** — every clock estimate carries an error bound (θ ± ε), and the scheduler uses it for admission control instead of pretending every device is equally trustworthy.
3. **Decision gates / kill criteria** — explicit thresholds for when to stop pursuing a target ("if 95th-percentile acoustic spread can't meet the target after pre-roll, stop treating YouTube as the Array renderer").

---

## 2. The One Real Disagreement (and Why It Matters)

Gemini's "Chronos-Audio Engine" says: anchor playback to `AudioContext.currentTime` instead of the JS event loop, because it's tied to the hardware audio clock and immune to event-loop jank.

That's true — but only for audio *you're routing through Web Audio*. YouTube's IFrame is cross-origin and gives you no access to its internal PCM pipeline. You cannot connect it to an `AudioContext` graph. So `AudioContext.currentTime` can make **your trigger call** (`player.playVideo()`) fire at a precise, jank-free moment — but it does nothing to reduce the variance *after* that call, inside YouTube's own black-box decode/buffer/render pipeline. That variance is the dominant error term, and no local clock precision touches it.

Perplexity's doc is the only one that states this cleanly: `AudioContext.currentTime` improves *scheduling precision*, not *YouTube's audible-latency floor*. Worth internalizing before you invest engineering time expecting AudioContext to buy you more than it can.

Practical takeaway: **use `AudioContext.currentTime` for firing precision — it's free and correct to do — but don't let it change your expectations about achievable sync accuracy under YouTube.** It's necessary, not sufficient.

---

## 3. Load-Bearing Consensus (High Confidence — All Three Converged Independently)

When three separate analyses land on the same answer without seeing each other, that's a stronger signal than any one being persuasive on its own:

- **"PLAY NOW" is categorically wrong.** Replace with scheduled future epochs, always. 3/3.
- **`Date.now()` is banned for timing logic; `performance.now()` is the local ruler.** 3/3.
- **NTP-style repeated exchange (not single ping) is the right clock-sync primitive.** 3/3.
- **Pre-buffer/arm before the trigger, never buffer-then-correct.** 3/3.
- **Hard seeks are the wrong correction mechanism — use micro playback-rate nudges instead.** 3/3, independently proposed. This is probably the single highest-confidence recommendation in the whole set.
- **YouTube's IFrame API is a hard ceiling somewhere in the 50–150ms range; sub-20ms is not a credible promise through it.** 3/3, though Perplexity argues it most rigorously via the Session/Array split.
- **Host-authoritative "server is the clock" is flawed; you need an actual clock-sync exchange, not just RTT.** 3/3.
- **Acoustic self-calibration (using the phone mic to measure real-world offset)** was proposed independently by both Claude and Perplexity — worth treating as validated rather than speculative.

If you build nothing else from these three documents, build the seven consensus items above. They're where independent analysis agreed without prompting each other.

---

## 4. The Recommended Architecture

**Step 0 — Make the product decision Perplexity forces you to make.**
Decide now: is v1 **Amply Session** (synchronized *state* across independent YouTube players, targeting ~100–150ms, honestly framed) or are you committing to **Amply Array** (true distributed speaker, which requires eventually dropping YouTube as the audio source for a controllable one)? Recommendation: **build Session first.** It's achievable within your existing constraints (no accounts, no downloads, YouTube-only), and if you architect the three planes below correctly, it evolves toward Array later without a rewrite. Don't market "one speaker made from many phones" for the Session tier — market it honestly and let the experience under-promise/over-deliver instead of the reverse.

**Step 1 — Split into three planes (Perplexity's cleanest contribution, worth adopting even for v1):**
- **Control plane** — room membership, queue, permissions. Low-rate, needs reliability not precision. This is what Socket.IO is actually good at — keep it here.
- **Clock plane** — per-client offset estimate *with* an uncertainty bound, not a single number. Repeated NTP-style exchanges, outlier rejection, weight low-RTT samples higher.
- **Media plane** — readiness state machine and scheduled trigger. This is where Gemini's `PREPARING → ARMED` naming is genuinely useful.

Keeping these separate in your code (not just conceptually) means a control-plane hiccup (someone's queue update lagging) never touches playback timing, and vice versa.

**Step 2 — Replace commands with timeline revisions.**
Every play/pause/seek/skip becomes an immutable revision: `{revision_id, epoch, media_position_at_epoch, rate, state}`, with the epoch always in the future. This is Perplexity's formalism and it's the right one — it fixes play/pause propagation delay using the *same* mechanism as startup delay, instead of treating them as separate bugs (which your original doc implicitly did).

**Step 3 — Admission control based on uncertainty, not just readiness.**
Don't schedule everyone for the same tight epoch regardless of how confident their clock estimate is. A client with ±35ms uncertainty shouldn't be held to the same target as one with ±5ms. This is the most underrated idea in the set — it turns "some devices sync badly" from a silent failure into a measured, handleable condition.

**Step 4 — Graceful degradation via membership tiers.**
Perplexity's Array/Observer/Satellite split is the single most product-relevant idea across all three docs, and none of the other two proposed it. A device that can't hit the room's accuracy target becomes a non-emitting "Observer" (sees the queue, doesn't play audio) rather than dragging the whole room's perceived quality down by playing badly out of sync. This is a UX decision as much as an engineering one — worth designing for from day one rather than bolting on later.

**Step 5 — Drift correction: rate-nudge only, deferred to musical boundaries where possible.**
Unanimous across all three: never hard-seek. Perplexity's refinement — defer correction to a beat/bar/silence boundary when detectable — is worth adopting once basic rate-nudging works.

**Step 6 — Validate before you over-build.**
Run the ground-truth experiment early: two phones, one plays through Amply, both record audio, cross-correlate the recordings to get your *actual* achievable percentile-based accuracy — before writing the scheduler. Claude and Perplexity both proposed this independently; do it in week one, not as a "nice to have" at the end. It tells you whether you're building toward a real number or a fictional one.

---

## 5. Where This Meets Your UI/UX Notes

Your vinyl-spin-up animation language ("record slows → album transitions → record accelerates → playback resumes") is already designed for song transitions — reuse it verbatim for the `ARMED`-state countdown window. The mandatory 1–3 second pre-roll that every one of these architectures requires isn't dead time to hide; it's exactly the moment your vinyl animation was built for. Let the record visibly "spin up" toward the scheduled epoch — it turns a technical necessity into the signature interaction rather than a loading spinner you're apologizing for.

The membership-tier idea (Step 4) also has a natural UI answer: an "Observer" device could show the vinyl as static/dim rather than spinning — visually honest about its role in the room without needing an error state or apology.

---

## 6. What I'd Deprioritize

- **Gemini's sub-audible phase dithering** — speculative even by Gemini's own admission ("if raw audio buffers could ever be extracted"), not actionable without raw PCM access, which you don't have with YouTube. Fine as a someday-idea for the Array tier, not worth design time now.
- **Perplexity's listening-zone/beamforming idea** — technically the most novel thing in any of the three docs, but it's an Array-tier idea (needs room geometry input, raises its own privacy questions via mic use). Park it as a v3+ idea, not something to design against now.
- **Distributed consensus (Raft/Bully) for clock election** — all three docs converge that this is unnecessary complexity for routine play/pause. A durable coordinator is enough; save consensus algorithms for if you ever need leaderless host-failover.
