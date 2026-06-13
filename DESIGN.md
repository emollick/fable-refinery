# SimRefinery 3D — Design

**v1.0 live at https://simrefinery.netlify.app** (Netlify site "simrefinery").
Redeploy after changes with:
`netlify deploy --prod --dir "simrefinery-3d" --site 0488cbb1-3cad-424b-9134-c755071046a7`

A three.js reconstruction of SimRefinery (Maxis Business Simulations for Chevron, 1992).
Not the original game — an homage built from the historical record. Single-file
`index.html`, three.js from CDN, no build step.

## What the historical record specifies

From the Obscuritory history (Phil Salvador) and the Esther Dyson Forbes editorial:

1. **Inputs**: various grades of crude oil at various prices.
2. **Outputs**: petroleum products at various prices.
3. **Tradeoffs**: "Produce more heating oil and you have less left over for
   high-priced gasoline and jet fuel."
4. **Maintenance**: "Skimp on maintenance spending and a plant goes down, cutting
   production for a week, lowering the plant's income, and cutting further into
   the maintenance budget."
5. **Objective**: maximize long-term profitability. Open-ended, period to period,
   no conclusion.
6. **Failure**: mess up the chemical balance badly enough and part of the
   refinery explodes. Trainers ran a "wreck the refinery / get fired" exercise.
7. **Teaching goal**: operators see they are part of a bigger system — what one
   unit does affects the others.
8. Instructors could set up scenarios for trainees.
9. The surviving screenshot shows a top-down plant view with a pop-up dialog
   listing plant components.

## Design decisions

- **Operations, not construction.** The plant already exists (it's Richmond).
  You run it. This matches the historical game; the 2D `simrefinery.html` from
  January was a builder, this is deliberately different.
- **View**: low-poly 3D plant, orthographic camera at a SimCity-like high angle,
  orbit/zoom/pan. Clicking a unit opens a beveled dialog (echoing the surviving
  screenshot) with its numbers and controls.
- **UI chrome**: early-90s system style (menu bar, beveled gray panels). Copy is
  plain and instructional throughout — no whimsy.
- **Time**: 1 tick = 1 day. Settlement (buy crude, sell products, pay costs)
  weekly. Speeds: pause / 1x / 3x / 10x.

## Process model (simplified but real)

Crude tank → **CDU** (100 kbd) splits crude into: refinery gas, naphtha,
kerosene, diesel, gas oil, residuum. Yield vector depends on crude grade.
Three **cutpoint sliders** shift volume between adjacent fractions — this is the
heating-oil-vs-gasoline tradeoff lever.

- **Reformer** (25 kbd): naphtha → reformate (high octane) + hydrogen. Severity
  slider trades yield for octane.
- **FCC** (45 kbd): gas oil → FCC gasoline + light cycle oil + LPG + coke.
  Severity slider trades gasoline yield for wear and heat.
- **Hydrotreater** (60 kbd): removes sulfur from kero/diesel up to capacity.
  Sulfur goes to a visible pile (the Hiles anecdote). Untreated sulfur =
  off-spec products sold at a discount, occasional fine.
- **Blender**: gasoline = straight-run naphtha + reformate + FCC gasoline.
  Volume-weighted octane must reach 87 or the batch sells sub-octane at a
  discount. Kerosene → jet. Diesel + LCO → diesel. Residuum + unsold gas oil →
  heating/fuel oil.
- **Flare**: relieves over-pressure automatically; burns money, visible flame.

## Degradation and danger

Each unit: condition 0–100 and pressure 0–120.

- Wear/day = base × severity × (2 − maintenance level). Maintenance budget
  slider 0–200% of baseline, paid weekly.
- Condition < 40: efficiency loss and daily breakdown risk. Breakdown = unit
  offline 7 days (the article's "down for a week"), repair bill.
- Pressure rises with overfeed (feed > capacity), high severity, low condition;
  flare bleeds it at a product cost. Pressure > 100 risks **explosion**:
  unit destroyed, offline ~4 weeks, large write-off, fire and smoke in scene,
  incident report dialog.
- Fired if: cumulative cash < −$20M, or a second explosion. Plain termination
  dialog, stats, restart.

## Economy (tuned by balance-sim.js)

- Crudes ($/bbl): Light Sweet ~78 / Medium ~72 / Heavy Sour ~64; sulfur 0.5 /
  1.5 / 3.0 %. Heavier = cheaper, more residuum, more sulfur.
- Products ($/bbl base): gasoline 96, jet 92, diesel 90, heating oil 70, LPG 35.
  Prices random-walk; winter raises heating oil, summer raises gasoline.
- Default settings → modest profit (~$1–3M/wk). Skilled play (crude choice,
  cutpoints, blend, severity) roughly doubles it. Neglect → the maintenance
  death spiral from the article. Start cash $25M.

## Scenarios (File menu)

1. Steady State — light crude, healthy plant. The default.
2. Heavy Crude — heavy sour is cheap; hydrotreater is the bottleneck.
3. Winter — heating oil demand spike; re-cut the barrel.
4. Run to Failure — worn units, thin cash.
5. Wreck the Refinery — explicit goal: destroy it and get fired (per Hiles).

## v2 additions ("even better and more so")

- **Crude supply chain**: tank farm inventory (150 kb start, 900 cap) with a
  weekly tanker delivery, billed by the cargo. Floating tank roofs show the
  level in the 3D scene; the tanker visibly arrives and departs. Skipped
  deliveries (events) drain the buffer; a dry tank starves the CDU.
- **Hydrogen dependency**: reformer byproduct hydrogen feeds the hydrotreater;
  with the reformer down, treating capacity drops to 55%. Cross-unit coupling
  is the teaching goal made mechanical.
- **Planned turnarounds**: 4 days, $1.5M, unit returns at condition 95 — the
  defensive answer to the death spiral (validated as T6 in the harness).
- **Emergency shutdown**: red panel button; trips all units 3 days, vents
  pressure, $1M. The correct operator move when pressure runs away.
- **Incident reports**: explosions pause the game and produce a report with
  auto-derived contributing factors; quarterly performance reviews; per-scenario
  objectives checked at a stated week.
- **Ledger and graphs windows**: weekly P&L by product and cost line; profit
  bars and price lines, drawn period-style on canvas.
- **Living scene**: day/night cycle (~150 s) with mast lighting, furnace glow,
  beacons, admin windows; cooling-tower steam; water glint; fence, rail spur,
  high-mast poles, parked cars; ground-scorch decals and shockwave rings on
  explosions; screen flash.
- **Sound**: synthesized WebAudio — ambient hum, flare roar tied to flaring,
  explosion, klaxon on pressure-critical, breakdown clunk, UI clicks. View >
  Sound toggles; preference persists.
- **Save/continue**: serializable RNG state (`rngState` + `bindRng`), autosave
  at each weekly settlement, Continue button on the splash.
- Crude is billed on delivery, not on feed (week 1 runs slightly negative while
  the first cargo fills the tank — honest accounting).

## v3: original UI grammar (from the surviving screenshots)

The user supplied the three surviving screenshots; v3 adopts the original's
interface conventions onto the 3D scene:

- **Menu bar**: File, Options, Refinery, Windows, Pause (a direct menubar
  toggle), Help — with the original's date *and time-of-day* clock ("Jan 2,
  1992  4:39am"; time sweeps between daily ticks). Game starts Jan 1, 1992 as
  in the screenshots (SEASON_OFFSET 0, re-validated in the harness).
- **Stream palette** (left button column, as in the Map window): AUTO CTL /
  MANUAL / SHUTDOWN / START UP, then one button per stream — CRUDE, C3−C4,
  NAPHTHA, REFORMATE, FCC GASO, JET, DIESEL, GAS OIL, RESIDUUM, H2, SULFUR —
  each showing its live BPOD figure; clicking highlights that pipe route in 3D
  and dims the rest. $ BUDGET and REPORT buttons at the bottom (original Edit
  toolbar).
- **AUTO CTL** is a real supervisor mode: cuts feed 5/day while any unit is
  above pressure 88, restores toward the setpoint when pressure clears below
  70 (it finds ~105 BPOD as the safe ceiling of a healthy plant and refuses to
  go back to an unsafe setpoint). SHUTDOWN/START UP are orderly (free, wearless
  idle) vs. the red emergency trip.
- **Crude Unit dialog** rebuilt to match the screenshot: NEXT CRUDE cycler with
  CURRENT→ readout, cutpoints listed as temperatures (175/268 fixed LSR/HSR,
  jet 560 / diesel 750 / VGO 977 °F moving ±10°F per slider step), and a
  distillation-column graphic with colored side-draws, BPOD volumes, bars, and
  destination chips (FUEL/REF/HT/FCC/RM).
- **BPOD units** ("barrels per operating day") across the panel and dialogs,
  matching the original's labels; tank inventory in bbl.
- **Windows menu**: Operations Panel toggle, Overhead Map (camera preset that
  tweens to a straight-down "SimRefinery Map" view and retitles the viewport;
  the view title strip echoes the original window titles), Graphs, $ Budget
  (Ledger), Plant Report, Message Log.
- New H2 (reformer→hydrotreater) and C3−C4 (FCC→LPG sphere) pipe routes so the
  palette's streams all exist in the scene.
- Market events get a two-week grace period (a week-1 tanker delay starved the
  young tank buffer before the player had any cushion).

## v4: capital projects (building)

Construction, scoped to what an operating refinery actually does — capital
projects, not freeform tile placement (the 2D `simrefinery.html` covers that
fantasy):

- Six projects (Refinery > Capital Projects, or the BUILD palette button):
  **Alkylation Unit** ($18M, 8 wk — C3−C4 → 94-octane alkylate, 4,000 BPOD,
  $0.3M/wk opex; the ALK unit from the original screenshots), hydrotreater
  +25k BPOD, CDU +15k, FCC +10k, reformer +5k, Crude Tank No. 4 (+300k bbl).
- Paid in cash up front (ledger line "Capital projects"); weeks of
  construction with a wireframe scaffold and one shared animated tower crane
  at the site; geometry appears when the project completes.
- The alky is a full fifth unit: condition, pressure, breakdowns, turnaround,
  plant-table row, dialog, ALKYLATE palette stream with its own pipes. Its
  economics couple to FCC severity (more cracking → more C3−C4 to upgrade).
- Harness T8 (builder: alky then FCC expansion on medium crude): +13% over
  the skilled non-builder across year one despite $30M capex; all prior
  strategy bands unchanged.
- Old saves migrate (builds default to none).

## v5: free building (the SimCity layer)

The original was built on SimFarm's bones and its Edit window had a SimCity
tool palette — so free placement is in. BUILD opens a tool palette; a ghost
follows the cursor (green/red validity), click places, R rotates, Esc/right-
click drops the tool, bulldozer demolishes (no refund). Placement is blocked
on water and on top of existing equipment; roads/trees can overlap each other.

- **Process trains** (real capacity, integrated into the aggregate flows):
  crude unit +20k BPOD, cat cracker +10k, reformer +5k, hydrotreater +12k,
  alkylation +4k (works standalone — `alkyCap()` counts project + trains).
  Trains are clickable and open their parent unit's dialog.
- **Crude tank** +150k bbl (floating roof rides inventory), **second flare**
  (halves flaring losses, animated flame), and civic items with no process
  effect, labeled as such: product tank, warehouse, office, road, trees,
  light mast (mast heads join the night-lighting set).
- Construction weeks with scaffold wireframes; the one shared tower crane
  parks at the first active site (capital projects take precedence).
- Placed items persist in saves (`S.placed`); old saves migrate.
- Harness T9 (place FCC train then crude train, raise feed to 115): +6.1M/wk,
  the best validated strategy — built capacity pays when you actually feed it.
  All prior bands unchanged.

## v5.1: building logic + plant growth

Response to playtest feedback ("the train doesn't go anywhere; does expansion
expand the plant; are there building logics?"):

- Renamed "X Train" → "Additional X" (refinery jargon read as railroad).
- The railroad works now: a product train (locomotive + three tank cars)
  arrives on the extended rail spur days 3–5 each week, sits under the loading
  gantry, and departs — same rhythm language as the crude tanker.
- Expansion grows the plant: every industrial placement gets a permanent
  concrete apron, and the perimeter fence recomputes to enclose all placed
  structures (with a gate gap where the rail crosses).
- Building logic, stated in the Build window: industrial structures require
  road access within 16 units (ROAD tiles open new ground); process units and
  tanks pay a pipe tie-in priced at $0.02M per unit of Manhattan distance from
  their connection point, and the tie-in pipe is drawn automatically when
  construction completes; buildings can't sit on roads or each other; the
  ghost tooltip prices the placement and names the blocking rule when red.

## v1.1: operator training + supply contracts

- **Operator Training** (splash button / File menu): ten hands-on tasks checked
  against live sim state — speed, feed cuts, pressure response, crude slates,
  hydrotreating, FCC severity, graphs, a planned turnaround, then run to week 4
  in the black. The guided first hour the original got from human instructors.
- **Supply contracts**: from week 4, marketing occasionally (22%/wk, one at a
  time, not in Wreck) brings a fixed-price offer — commit N BPOD of a product
  for 4–8 weeks at roughly market +$2.50–4.50. Committed barrels sell at the
  fixed price either way (the ledger's "Contract adjustment" line can go
  negative); delivering under 90% in a week costs a $1.5M penalty, so a
  breakdown mid-contract has teeth. Validated as harness T10.
- Graphs window redraws weekly while open.

## v1.2: visual pass

ACES filmic tone mapping; mottled scrub texture on the grass; a living sky
(drifting clouds, sun disc, moon, and 520 stars that fade in with the night
cycle — all fog-exempt sprites); an additive halo on the flare that swells
with flaring; a pulsing white selection box framing whatever the cursor is
over; a patrol pickup looping the perimeter road (parks when paused); three
gulls circling the bay. No post-processing pipeline — glows are additive
sprites, so the period UI stays crisp.

## v1.3: minimap, night light, quieter world (playtest feedback)

- **Minimap**: a period "Map" window (canvas schematic) — plant footprint and
  fence bounds, roads and rail, every unit with a live status dot, placed
  structures, the tanker/train/truck as moving dots, and a crosshair for the
  camera. Click anywhere on it to look there. Opens with the game; Windows >
  Map reopens it.
- **Night lighting overhaul**: verified by actual screenshots (the page can
  render-on-demand and POST the canvas to a local receiver even while the
  preview panel is hidden). Moonlight floor with a cool tint, brighter
  hemisphere, real pools of light under the high-mast poles, and a flare glow
  that tracks the flame and swells after dark.
- **Vehicles leave properly**: the tanker and product train hide once they
  reach their away positions instead of parking in a field; rails extended to
  the map edge.
- **Sound calmed**: horns at most every ~75 s of real time and never at
  Maximum speed; quieter gains; occasional faint clank/steam-hiss one-shots so
  the ambience isn't a flat loop.
- Bug fixed via screenshot: three.js renders objects unless `visible` is
  strictly `false` — a gate that assigned numeric `0` left the Alkylation
  label floating over an empty pad.

## Out of scope (YAGNI)

Record/playback of sessions, multi-refinery, personnel management, building
placement. The 2D builder already exists for construction fantasy.

## Verification

- `balance-sim.js` (node): runs the sim core headless across strategies; checks
  profit bands, breakdown spiral, explosion timing.
- Browser preview: scene renders, dialogs work, a forced explosion plays, no
  console errors.
