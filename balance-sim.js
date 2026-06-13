// Balance harness for SimRefinery 3D. Runs the sim core headless under several
// strategies and prints profit/safety statistics. The CORE section below is
// copied into index.html once tuned — keep it dependency-free and in sync.
//
// v2 adds: serializable RNG state, crude tank inventory with weekly tanker
// deliveries, reformer->hydrotreater hydrogen dependency, planned turnarounds,
// emergency shutdown, and ledger/price-history accumulators.

// ============ CORE (shared with index.html) ============

function bindRng(S){
  S.rng = function(){
    let a = S.rngState|0; a = (a + 0x6D2B79F5)|0; S.rngState = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return S;
}

const CRUDES = {
  light:  { name: 'Light Sweet', basePrice: 69, sulfur: 0.5, yields: { gas: 0.04, naphtha: 0.22, kero: 0.14, diesel: 0.22, gasoil: 0.20, resid: 0.18 } },
  medium: { name: 'Medium Blend', basePrice: 65, sulfur: 1.5, yields: { gas: 0.04, naphtha: 0.18, kero: 0.12, diesel: 0.20, gasoil: 0.22, resid: 0.24 } },
  heavy:  { name: 'Heavy Sour', basePrice: 62, sulfur: 3.0, yields: { gas: 0.03, naphtha: 0.14, kero: 0.10, diesel: 0.17, gasoil: 0.24, resid: 0.32 } },
};

// Heating/fuel oil deliberately prices BELOW crude — upgrading the bottom of the
// barrel is the whole economic point of a refinery. Winter spikes can invert this.
const BASE_PRICES = { gasoline: 102, jet: 95, diesel: 90, heating: 58, lpg: 35, sulfur: 85 }; // $/bbl, sulfur $/ton

const UNIT_DEFS = {
  cdu:      { name: 'Crude Distillation Unit', cap: 100, wear: 0.40, repairCost: 3.5, explodeCost: 10 },
  reformer: { name: 'Catalytic Reformer',      cap: 25,  wear: 0.55, repairCost: 2.0, explodeCost: 6 },
  fcc:      { name: 'Cat Cracker (FCC)',       cap: 45,  wear: 0.75, repairCost: 2.8, explodeCost: 8 },
  hydro:    { name: 'Hydrotreater',            cap: 50,  wear: 0.45, repairCost: 1.6, explodeCost: 5 },
  alky:     { name: 'Alkylation Unit',         cap: 4,   wear: 0.50, repairCost: 1.4, explodeCost: 5 },
};

// Capital projects: pay cash up front, construction runs N weeks, then live.
const PROJECTS = {
  alky:   { name: 'Alkylation Unit',        cost: 18, weeks: 8, desc: 'Converts C3-C4 into 94-octane alkylate for the gasoline pool. 4,000 BPOD; $0.3M/wk operating cost.' },
  hydro2: { name: 'Hydrotreater Expansion', cost: 12, weeks: 6, desc: '+25,000 BPOD treating capacity.' },
  cdux:   { name: 'CDU Debottleneck',       cost: 14, weeks: 6, desc: '+15,000 BPOD crude capacity.' },
  fccx:   { name: 'FCC Expansion',          cost: 12, weeks: 5, desc: '+10,000 BPOD cracking capacity.' },
  refx:   { name: 'Reformer Expansion',     cost: 8,  weeks: 4, desc: '+5,000 BPOD reforming capacity.' },
  tank4:  { name: 'Crude Tank No. 4',       cost: 6,  weeks: 4, desc: '+300,000 bbl crude storage.' },
};
const CAP_BONUS = { cdu: ['cdux', 15], fcc: ['fccx', 10], reformer: ['refx', 5], hydro: ['hydro2', 25] };

// Free placement (SimCity-style). Trains add capacity to their parent unit;
// tanks add storage; a second flare halves flaring losses; the rest is civic.
const PLACEABLE = {
  cdu2:   { name: 'Additional Crude Unit',   cost: 20,  weeks: 8, unit: 'cdu',      amt: 20 },
  fcc2:   { name: 'Additional Cat Cracker',  cost: 14,  weeks: 6, unit: 'fcc',      amt: 10 },
  ref2:   { name: 'Additional Reformer',     cost: 9,   weeks: 5, unit: 'reformer', amt: 5 },
  hyd2:   { name: 'Additional Hydrotreater', cost: 10,  weeks: 5, unit: 'hydro',    amt: 12 },
  alk2:   { name: 'Additional Alkylation',   cost: 18,  weeks: 8, unit: 'alky',     amt: 4 },
  ctank:  { name: 'Crude Tank',         cost: 4,   weeks: 3, tank: 150 },
  flare2: { name: 'Second Flare',       cost: 5,   weeks: 3, flare: true },
  ptank:  { name: 'Product Tank',       cost: 1.5, weeks: 2 },
  wh:     { name: 'Warehouse',          cost: 1,   weeks: 1 },
  office: { name: 'Office Building',    cost: 2,   weeks: 1 },
  road:   { name: 'Road',               cost: 0.05, weeks: 0 },
  trees:  { name: 'Trees',              cost: 0.02, weeks: 0 },
  pole:   { name: 'Light Mast',         cost: 0.05, weeks: 0 },
};
function capOf(S, k) {
  if (k === 'alky') return alkyCap(S);
  const b = CAP_BONUS[k];
  let cap = UNIT_DEFS[k].cap + (b && S.builds[b[0]].done ? b[1] : 0);
  for (const p of S.placed) { const d = PLACEABLE[p.type]; if (p.done && d && d.unit === k) cap += d.amt; }
  return cap;
}
// Alkylation exists only if the project was built or a train was placed.
function alkyCap(S) {
  let c = S.builds.alky.done ? UNIT_DEFS.alky.cap : 0;
  for (const p of S.placed) if (p.done && p.type === 'alk2') c += PLACEABLE.alk2.amt;
  return c;
}
function hasFlare2(S) { return S.placed.some(p => p.done && p.type === 'flare2'); }
function startProject(S, key) {
  const p = PROJECTS[key], b = S.builds[key];
  if (!p || b.started || b.done) return false;
  if (S.cash < p.cost) return false;
  S.cash -= p.cost; S.wk.capex += p.cost;
  b.started = 1; b.weeksLeft = p.weeks;
  return true;
}
function placeItem(S, type, x, z, rot, tieIn) {
  const d = PLACEABLE[type];
  tieIn = tieIn || 0;
  if (!d || S.cash < d.cost + tieIn) return null;
  S.cash -= d.cost + tieIn; S.wk.capex += d.cost + tieIn;
  const item = { id: S.placedSeq++, type, x, z, rot: rot || 0, tieIn, weeksLeft: d.weeks, done: d.weeks === 0 ? 1 : 0 };
  S.placed.push(item);
  return item;
}
function removeItem(S, id) {
  const i = S.placed.findIndex(p => p.id === id);
  if (i < 0) return false;
  const p = S.placed[i], d = PLACEABLE[p.type];
  if (p.done && d.tank) { S.tank.cap -= d.tank; S.tank.level = Math.min(S.tank.level, S.tank.cap); }
  S.placed.splice(i, 1);
  return true;
}

const OPEX_PER_DAY = 0.40;        // $M fixed
const MAINT_BASE_WEEK = 1.6;      // $M at 100%
const SULFUR_TON_PER_BBL = 0.000136; // per 1% sulfur by weight
const START_CASH = 25;            // $M
const FIRED_CASH = -20;           // $M
const TURNAROUND_COST = 1.5;      // $M, 4 days, restores condition to 95
const ESD_COST = 1.0;             // $M, 3 days all units, vents pressure
const SEASON_OFFSET = 0;          // clock starts Jan 1, 1992 (as in the original)

function newGame(scenario, seed) {
  const S = {
    rngState: seed>>>0, scenario, day: 0, week: 0,
    cash: START_CASH,
    crudeType: 'light',
    feedRate: 90,                 // kbd target into CDU
    cuts: { c1: 0, c2: 0, c3: 0 },// -5..+5 each
    maint: 100,                   // % of baseline
    refSeverity: 100,             // 80..120 %
    fccSeverity: 100,             // 80..120 %
    prices: { ...BASE_PRICES },
    crude: Object.fromEntries(Object.keys(CRUDES).map(k => [k, CRUDES[k].basePrice])),
    units: {},
    tank: { level: 150, cap: 900 },  // crude inventory, kb; first cargo lands day 1
    skipDelivery: 0,              // deliveries to skip (events)
    lastDelivery: null,           // {day, volume, cost}
    sulfurPile: 0,                // tons
    weekRevenue: 0, weekCrudeCost: 0, weekOtherCost: 0,
    wk: { revGasoline:0, revJet:0, revDiesel:0, revHeating:0, revLpg:0, revSulfur:0, flare:0, repairs:0, fines:0, crude:0, capex:0, contractAdj:0 },
    contract: null, contractOffer: null,
    builds: Object.fromEntries(Object.keys(PROJECTS).map(k => [k, { started: 0, weeksLeft: 0, done: 0 }])),
    placed: [], placedSeq: 1,
    profitHistory: [], ledger: [], priceHist: [],
    totalProfit: 0,
    breakdowns: 0, explosions: 0, fired: false, firedReason: '',
    offSpecSoldWeek: 0, damageTotal: 0,
    upDays: 0, unitDays: 0,       // uptime accounting
    mul: { gasoline:1, jet:1, diesel:1, heating:1, lpg:1, sulfur:1, crude:1, opex:1 },
    event: null, lastWeek: null, dayOutput: null,
    incidents: [],                // explosion reports
    _minTank: 1e9,
  };
  bindRng(S);
  for (const k of Object.keys(UNIT_DEFS)) {
    S.units[k] = { condition: 90, pressure: 20, downDays: 0, destroyed: 0, online: true, planned: 0, enabled: true };
  }
  if (scenario === 'failure') { for (const k of Object.keys(S.units)) S.units[k].condition = 45; S.cash = 8; }
  if (scenario === 'heavy') { S.crude.heavy = 55; S.scenarioHeavyDiscount = true; }
  if (scenario === 'winter') { S.mul.heating = 1.35; S.event = { type:'cold', name:'Sustained cold weather', weeksLeft:10 }; }
  if (scenario === 'wreck') { S.tank.level = 900; S.cash = 60; }  // instructor sandbox: runway to do real damage
  return S;
}

function seasonFactor(day, phase) {
  return Math.cos(2 * Math.PI * (((day + SEASON_OFFSET) % 364) / 364 - phase));
}
function effOf(u) { return Math.min(1, 0.7 + u.condition / 200); }

// Planned 4-day outage; unit returns at condition 95. The defensive move the
// maintenance death spiral is supposed to teach.
function scheduleTurnaround(S, k) {
  const u = S.units[k];
  if (u.downDays > 0) return false;
  u.downDays = 4; u.online = false; u.planned = 1;
  S.weekOtherCost += TURNAROUND_COST; S.wk.repairs += TURNAROUND_COST;
  return true;
}
// Emergency shutdown: trip every running unit for 3 days, vent pressure.
// Expensive, but it beats an explosion.
function emergencyShutdown(S) {
  for (const k of Object.keys(S.units)) {
    const u = S.units[k];
    if (u.downDays === 0) { u.downDays = 3; u.planned = 1; u.online = false; }
    u.pressure = Math.min(u.pressure, 30);
  }
  S.weekOtherCost += ESD_COST; S.wk.repairs += ESD_COST;
}

function tickDay(S) {
  const rng = S.rng;
  S.day++;
  const out = { flows: {}, blendOctane: 0, flared: [], notes: [], exploded: [], broke: [], delivered: 0 };

  // ---- prices: mean-reverting walk + season
  const winter = Math.max(0, seasonFactor(S.day, 0));
  const summer = Math.max(0, seasonFactor(S.day, 0.5));
  const targets = {
    gasoline: BASE_PRICES.gasoline * (1 + 0.15 * summer) * S.mul.gasoline,
    jet: BASE_PRICES.jet * S.mul.jet, diesel: BASE_PRICES.diesel * S.mul.diesel,
    heating: BASE_PRICES.heating * (1 + 0.50 * winter) * S.mul.heating,
    lpg: BASE_PRICES.lpg * S.mul.lpg, sulfur: BASE_PRICES.sulfur * S.mul.sulfur,
  };
  for (const k of Object.keys(S.prices)) {
    const drift = (targets[k] - S.prices[k]) * 0.04;
    S.prices[k] = Math.max(5, S.prices[k] + drift + S.prices[k] * (rng() - 0.5) * 0.022);
  }
  for (const k of Object.keys(S.crude)) {
    const base = ((S.scenarioHeavyDiscount && k === 'heavy') ? 55 : CRUDES[k].basePrice) * S.mul.crude;
    const drift = (base - S.crude[k]) * 0.04;
    S.crude[k] = Math.max(20, S.crude[k] + drift + S.crude[k] * (rng() - 0.5) * 0.02);
  }

  // ---- crude delivery (tanker docks day 1 of each week)
  if (S.day % 7 === 1) {
    if (S.skipDelivery > 0) {
      S.skipDelivery--;
      out.notes.push('No crude delivery this week. Tank inventory will run down.');
    } else {
      const want = Math.max(0, Math.min(S.tank.cap - S.tank.level, S.feedRate * 7.7 + 20));
      const cost = want * 1000 * S.crude[S.crudeType] / 1e6;
      S.tank.level += want;
      S.weekCrudeCost += cost; S.wk.crude += cost;
      S.lastDelivery = { day: S.day, volume: want, cost };
      out.delivered = want;
    }
  }

  // ---- unit availability
  for (const k of Object.keys(S.units)) {
    const u = S.units[k];
    if (u.downDays > 0) {
      u.downDays--;
      if (u.downDays === 0) {
        u.online = true;
        // Repairs restore service, not health: a fixed unit comes back barely
        // functional (35) unless rebuilt after an explosion (60) or given a
        // planned turnaround (95). Real recovery otherwise takes maint >115%.
        u.condition = u.planned && !u.destroyed ? Math.max(u.condition, 95)
                    : Math.max(u.condition, u.destroyed ? 60 : 35);
        u.destroyed = 0; u.planned = 0;
        out.notes.push(UNIT_DEFS[k].name + ' is back in service.');
      }
    }
  }
  const up = k => S.units[k].downDays === 0 && S.units[k].enabled;

  // ---- flows (kbd)
  const crude = CRUDES[S.crudeType];
  const cduMax = capOf(S, 'cdu') * effOf(S.units.cdu);
  // Pressure responds to what you ATTEMPT; the tower only physically processes
  // ~10% over effective capacity. Pushing harder just pressurizes the unit.
  const attempted = up('cdu') ? Math.min(S.feedRate, cduMax * 1.25) : 0;
  const feedWanted = Math.min(attempted, cduMax * 1.10);
  const feed = Math.min(feedWanted, S.tank.level);   // can't run a dry tank
  S.tank.level = Math.max(0, S.tank.level - feed);
  S._minTank = Math.min(S._minTank, S.tank.level);
  if (feedWanted > 0.5 && feed < feedWanted * 0.6) out.notes.push('Crude tank low: distillation is starving.');

  const y = { ...crude.yields };
  const sh = f => f * 0.004;
  y.naphtha += sh(S.cuts.c1); y.kero -= sh(S.cuts.c1);
  y.kero += sh(S.cuts.c2); y.diesel -= sh(S.cuts.c2);
  y.gasoil += sh(S.cuts.c3); y.resid -= sh(S.cuts.c3);
  for (const k of Object.keys(y)) y[k] = Math.max(0.01, y[k]);

  const naphtha = feed * y.naphtha, kero = feed * y.kero, diesel = feed * y.diesel;
  const gasoil = feed * y.gasoil, resid = feed * y.resid;

  // reformer
  const refS = S.refSeverity / 100;
  const refCap = up('reformer') ? capOf(S, 'reformer') * effOf(S.units.reformer) : 0;
  const refFeed = Math.min(naphtha, refCap);
  const srNaphtha = naphtha - refFeed;
  const reformate = refFeed * (0.88 - (refS - 1) * 0.35);
  const refOctane = 88 + (refS - 0.8) * 25;
  const hydrogenOk = refFeed > 1;  // reformer byproduct hydrogen feeds the hydrotreater

  // FCC
  const fccS = S.fccSeverity / 100;
  const fccCap = up('fcc') ? capOf(S, 'fcc') * effOf(S.units.fcc) : 0;
  const fccFeed = Math.min(gasoil, fccCap * 1.2);
  const fccProcessed = Math.min(fccFeed, fccCap);
  const fccGas = fccProcessed * (0.50 + (fccS - 1) * 0.25);
  const lco = fccProcessed * (0.22 - (fccS - 1) * 0.10);
  const lpg = fccProcessed * (0.08 + (fccS - 1) * 0.05);
  const unconverted = gasoil - fccProcessed;

  // hydrotreater: kero + diesel + lco need treating if sour.
  const needsTreat = crude.sulfur > 0.8;
  const distillate = kero + diesel + lco;
  let jet, dieselOut, heatingExtra = 0, offSpec = 0, sulfurTons = 0, treatedFrac = 1;
  if (needsTreat) {
    // Sourer crude consumes hydrotreater capacity faster; without reformer
    // hydrogen the unit runs at 55% capacity.
    const sulfurLoad = crude.sulfur / 1.5;
    let hCap = up('hydro') ? capOf(S, 'hydro') * effOf(S.units.hydro) / sulfurLoad : 0;
    if (!hydrogenOk) hCap *= 0.55;
    const treated = Math.min(distillate, hCap);
    treatedFrac = distillate > 0 ? treated / distillate : 0;
    sulfurTons = treated * 1000 * SULFUR_TON_PER_BBL * crude.sulfur;
    jet = kero * treatedFrac;
    heatingExtra += kero * (1 - treatedFrac);
    dieselOut = (diesel + lco);
    offSpec = (diesel + lco) * (1 - treatedFrac);
    S.units.hydro._load = treated * sulfurLoad / Math.max(1, capOf(S, 'hydro'));
  } else { jet = kero; dieselOut = diesel + lco; S.units.hydro._load = 0; }
  S.sulfurPile += sulfurTons;

  // alkylation: C3-C4 upgraded to 94-octane alkylate (when built)
  let alkyFeed = 0, alkylate = 0, lpgSold = lpg;
  const alkyOn = alkyCap(S) > 0 && up('alky');
  if (alkyOn) {
    alkyFeed = Math.min(lpg, capOf(S, 'alky') * effOf(S.units.alky));
    alkylate = alkyFeed; lpgSold = lpg - alkyFeed;
    S.weekOtherCost += 0.3 / 7;   // acid + isobutane operating cost
  }

  // blending
  const gasVol = srNaphtha + reformate + fccGas + alkylate;
  const octane = gasVol > 0 ? (srNaphtha * 71 + reformate * refOctane + fccGas * 92 + alkylate * 94) / gasVol : 0;
  const octaneSpec = S.octaneSpec || 87;
  const onSpecGas = octane >= octaneSpec;
  const heating = resid + unconverted + heatingExtra;

  // ---- revenue ($M/day)
  const P = S.prices;
  const revGasoline = gasVol * 1000 * P.gasoline * (onSpecGas ? 1 : 0.82) / 1e6;
  const revJet = jet * 1000 * P.jet / 1e6;
  const revDiesel = ((dieselOut - offSpec) * P.diesel + offSpec * P.diesel * 0.70) * 1000 / 1e6;
  const revHeating = heating * 1000 * P.heating / 1e6;
  const revLpg = lpgSold * 1000 * P.lpg / 1e6;
  const rev = revGasoline + revJet + revDiesel + revHeating + revLpg;
  S.wk.revGasoline += revGasoline; S.wk.revJet += revJet; S.wk.revDiesel += revDiesel;
  S.wk.revHeating += revHeating; S.wk.revLpg += revLpg;
  // supply contract: committed volume sells at the fixed price instead of market
  let contractAdj = 0;
  if (S.contract) {
    const c = S.contract;
    const prodMap = { gasoline: gasVol, jet, diesel: dieselOut, heating };
    const mktMap = { gasoline: P.gasoline * (onSpecGas ? 1 : 0.82), jet: P.jet, diesel: P.diesel, heating: P.heating };
    const del = Math.min(prodMap[c.product] || 0, c.bpod);
    c.deliveredWk = (c.deliveredWk || 0) + del;
    c.requiredWk = (c.requiredWk || 0) + c.bpod;
    contractAdj = del * 1000 * (c.price - mktMap[c.product]) / 1e6;
    S.wk.contractAdj += contractAdj;
  }
  const crudeCost = feed * 1000 * S.crude[S.crudeType] / 1e6; // info only; billing is on delivery

  // ---- pressure
  const press = (k, util, sev) => {
    const u = S.units[k];
    if (u.downDays > 0 && u.destroyed === 0) { u.pressure = Math.max(5, u.pressure - 8); return; }
    let target = 18 + 58 * util + (sev ? (sev - 1) * 90 : 0) + (u.condition < 50 ? 12 : 0);
    if (util > 1) target += (util - 1) * 380;
    u.pressure += (target - u.pressure) * 0.25;
    if (u.pressure > 85) { // flare relief (a second flare halves the product loss)
      u.pressure -= 10;
      const fc = hasFlare2(S) ? 0.04 : 0.08;
      S.weekOtherCost += fc; S.wk.flare += fc;
      out.flared.push(k);
    }
    if (u.pressure > 105) {
      const chance = 0.12 + (u.pressure - 105) * 0.02;
      if (rng() < chance) explode(S, k, out, util);
    }
  };
  press('cdu', attempted / Math.max(1, cduMax), null);
  press('reformer', refCap > 0 ? refFeed / refCap : 0, refS);
  press('fcc', fccCap > 0 ? fccFeed / fccCap : 0, fccS);
  press('hydro', S.units.hydro._load || 0, null);
  if (alkyCap(S) > 0) press('alky', alkyFeed / Math.max(1, capOf(S, 'alky')), null);

  // ---- wear & breakdowns
  const maintF = Math.max(-0.3, 1.65 - 1.4 * (S.maint / 100));
  const sevFor = k => k === 'fcc' ? (0.5 + 0.5 * fccS * fccS) : k === 'reformer' ? (0.5 + 0.5 * refS * refS) : 1;
  for (const k of Object.keys(S.units)) {
    if (k === 'alky' && alkyCap(S) === 0) continue;
    const u = S.units[k];
    S.unitDays++; if (u.downDays === 0) S.upDays++;
    if (u.downDays > 0) continue;
    const running = (k === 'cdu' && feed > 0) || (k === 'reformer' && refFeed > 0) || (k === 'fcc' && fccProcessed > 0) || (k === 'hydro' && (S.units.hydro._load || 0) > 0) || (k === 'alky' && alkyFeed > 0);
    if (!running) continue;
    u.condition = Math.min(100, Math.max(0, u.condition - UNIT_DEFS[k].wear * sevFor(k) * maintF));
    if (u.condition < 40) {
      const chance = (40 - u.condition) * 0.004 + 0.01;
      if (rng() < chance) {
        u.downDays = 7; u.online = false; u.planned = 0; S.breakdowns++;
        S.weekOtherCost += UNIT_DEFS[k].repairCost; S.wk.repairs += UNIT_DEFS[k].repairCost;
        S.damageTotal += UNIT_DEFS[k].repairCost;
        out.broke.push(k);
        out.notes.push(UNIT_DEFS[k].name + ' broke down. Offline 7 days. Repair $' + UNIT_DEFS[k].repairCost + 'M.');
      }
    }
  }

  // ---- costs and weekly settlement
  S.weekRevenue += rev + contractAdj;
  S.weekOtherCost += OPEX_PER_DAY * S.mul.opex + (MAINT_BASE_WEEK * S.maint / 100) / 7;
  S.offSpecSoldWeek += offSpec + (onSpecGas ? 0 : gasVol);

  if (S.day % 7 === 0) {
    S.week++;
    // capital project progress
    for (const k of Object.keys(S.builds)) {
      const b = S.builds[k];
      if (b.started && !b.done) {
        b.weeksLeft--;
        if (b.weeksLeft <= 0) {
          b.done = 1;
          if (k === 'tank4') S.tank.cap += 300;
          out.notes.push(PROJECTS[k].name + ' is complete and in service.');
        }
      }
    }
    // placed construction progress
    for (const p of S.placed) {
      if (!p.done && p.weeksLeft > 0) {
        p.weeksLeft--;
        if (p.weeksLeft <= 0) {
          p.done = 1;
          const d = PLACEABLE[p.type];
          if (d.tank) S.tank.cap += d.tank;
          out.notes.push(d.name + ' is complete and in service.');
        }
      }
    }
    // contract week settlement: penalty if delivered under 90% of commitment
    if (S.contract) {
      const c = S.contract;
      if ((c.deliveredWk || 0) < (c.requiredWk || 0) * 0.9) {
        S.cash -= c.penalty; S.wk.fines += c.penalty;
        out.notes.push('Contract shortfall on ' + c.product + ': delivered ' + Math.round((c.deliveredWk / Math.max(1, c.requiredWk)) * 100) + '% of commitment. Penalty $' + c.penalty.toFixed(1) + 'M.');
      }
      c.deliveredWk = 0; c.requiredWk = 0;
      c.weeksLeft--;
      if (c.weeksLeft <= 0) {
        out.notes.push('Contract complete: ' + c.product + ' commitment fulfilled and closed.');
        S.contract = null;
      }
    }
    const sRev = S.sulfurPile * S.prices.sulfur / 1e6; S.wk.revSulfur = sRev; S.sulfurPile = 0;
    const profit = S.weekRevenue + sRev - S.weekCrudeCost - S.weekOtherCost;
    S.cash += profit; S.totalProfit += profit;
    S.profitHistory.push(profit);
    let fine = 0;
    if (S.offSpecSoldWeek > 30 && S.rng() < 0.25) {
      fine = 1.5; S.cash -= fine; S.wk.fines += fine;
      out.notes.push('Regulatory fine: $1.5M for off-specification product shipments.');
    }
    S.lastWeek = { revenue: S.weekRevenue + sRev, crudeCost: S.weekCrudeCost, otherCost: S.weekOtherCost, profit,
      detail: { ...S.wk, maint: MAINT_BASE_WEEK * S.maint / 100, opex: OPEX_PER_DAY * 7 * S.mul.opex } };
    S.ledger.push({ week: S.week, ...S.lastWeek.detail, profit });
    if (S.ledger.length > 13) S.ledger.shift();
    S.priceHist.push({ g: S.prices.gasoline, j: S.prices.jet, d: S.prices.diesel, h: S.prices.heating });
    if (S.priceHist.length > 52) S.priceHist.shift();
    S.weekRevenue = S.weekCrudeCost = S.weekOtherCost = 0; S.offSpecSoldWeek = 0;
    S.wk = { revGasoline:0, revJet:0, revDiesel:0, revHeating:0, revLpg:0, revSulfur:0, flare:0, repairs:0, fines:0, crude:0, capex:0, contractAdj:0 };
    if (S.cash < FIRED_CASH && !S.fired) { S.fired = true; S.firedReason = 'losses'; }
  }

  out.flows = { feed, attempted, feedWanted, naphtha, srNaphtha, refFeed, reformate, refOctane, kero, diesel, gasoil,
    fccFeed: fccProcessed, fccGas, lco, lpg, lpgSold, alkyFeed, alkylate, alkyOn, resid, unconverted, jet, dieselOut, offSpec, heating, gasVol,
    octane, onSpecGas, octaneSpec, sulfurTons, treatedFrac, needsTreat, hydrogenOk, rev, crudeCost, cduMax, refCap, fccCap };
  out.blendOctane = octane;
  S.dayOutput = out;
  return out;
}

function explode(S, k, out, util) {
  const u = S.units[k];
  if (u.downDays > 0) return;
  const factors = [];
  if (util > 1.02) factors.push('feed sustained above effective capacity');
  if (k === 'fcc' && S.fccSeverity > 110) factors.push('high-severity cracking');
  if (k === 'reformer' && S.refSeverity > 110) factors.push('high-severity reforming');
  if (u.condition < 40) factors.push('advanced equipment degradation');
  if (S.maint < 60) factors.push('sustained under-maintenance');
  if (!factors.length) factors.push('overpressure');
  S.incidents.push({ day: S.day, unit: k, pressure: Math.round(u.pressure), condition: Math.round(u.condition), factors });
  u.destroyed = 1; u.downDays = 28; u.online = false; u.condition = 0; u.pressure = 10; u.planned = 0;
  S.explosions++;
  S.cash -= UNIT_DEFS[k].explodeCost; S.damageTotal += UNIT_DEFS[k].explodeCost;
  out.exploded.push(k);
  out.notes.push('EXPLOSION at the ' + UNIT_DEFS[k].name + '. Offline 28 days. Damage $' + UNIT_DEFS[k].explodeCost + 'M.');
  if (k === 'cdu') S.units.fcc.condition = Math.max(0, S.units.fcc.condition - 20);
  if (k === 'fcc') S.units.cdu.condition = Math.max(0, S.units.cdu.condition - 15);
  if (S.explosions >= 2 && !S.fired) { S.fired = true; S.firedReason = 'safety'; }
}

// ============ HARNESS ============

function runStrategy(name, setup, perWeek, weeks, seeds) {
  const results = [];
  for (let s = 0; s < seeds; s++) {
    const S = newGame(setup.scenario || 'normal', 1000 + s * 7919);
    Object.assign(S, setup.state || {});
    let firstBreak = null, firstBoom = null;
    for (let d = 0; d < weeks * 7; d++) {
      if (perWeek && d % 7 === 0) perWeek(S, Math.floor(d / 7));
      tickDay(S);
      if (firstBreak === null && S.breakdowns > 0) firstBreak = S.week + 1;
      if (firstBoom === null && S.explosions > 0) firstBoom = Math.ceil(S.day / 7);
      if (S.fired) break;
    }
    const avgWk = S.profitHistory.length ? S.profitHistory.reduce((a, b) => a + b, 0) / S.profitHistory.length : 0;
    results.push({ avgWk, total: S.totalProfit, cash: S.cash, breakdowns: S.breakdowns, explosions: S.explosions,
      fired: S.fired, firedWk: S.fired ? S.week : null, firstBreak, firstBoom, minTank: S._minTank });
  }
  const mean = f => results.reduce((a, r) => a + (f(r) ?? 0), 0) / results.length;
  const pct = (f, p) => { const v = results.map(f).filter(x => x !== null).sort((a, b) => a - b); return v.length ? v[Math.floor(p * (v.length - 1))] : null; };
  console.log(`\n=== ${name} (${weeks} wks x ${seeds} seeds) ===`);
  console.log(`avg $/wk: mean ${mean(r => r.avgWk).toFixed(2)}M  p10 ${pct(r => r.avgWk, 0.1)?.toFixed(2)}  p90 ${pct(r => r.avgWk, 0.9)?.toFixed(2)}`);
  console.log(`breakdowns mean ${mean(r => r.breakdowns).toFixed(2)} | explosions mean ${mean(r => r.explosions).toFixed(2)} | fired ${(results.filter(r => r.fired).length / results.length * 100).toFixed(0)}%`);
  console.log(`first breakdown wk: p50 ${pct(r => r.firstBreak, 0.5)} | first explosion wk: p50 ${pct(r => r.firstBoom, 0.5)} | min tank p10 ${pct(r => r.minTank, 0.1)?.toFixed(0)} kb`);
  return results;
}

const SEEDS = 60, WEEKS = 52;

runStrategy('T1 default (light, 90 kbd, maint 100)', {}, null, WEEKS, SEEDS);

runStrategy('T2 skilled (medium crude, cuts +gasoil, sev 105)', {
  state: { crudeType: 'medium', feedRate: 98, cuts: { c1: 3, c2: 0, c3: 4 }, maint: 115, refSeverity: 105, fccSeverity: 105 },
}, null, WEEKS, SEEDS);

runStrategy('T2b heavy crude (hydro-limited)', {
  state: { crudeType: 'heavy', feedRate: 95, cuts: { c1: 4, c2: -2, c3: 5 }, maint: 115, refSeverity: 105, fccSeverity: 110 },
}, null, WEEKS, SEEDS);

runStrategy('T3 neglect (maint 0)', { state: { maint: 0 } }, null, WEEKS, SEEDS);

runStrategy('T4 wreck (feed 120, sev 120/120)', {
  state: { feedRate: 120, refSeverity: 120, fccSeverity: 120, maint: 0 },
}, null, 16, SEEDS);

runStrategy('T5 push (feed 106, sev 104, maint 130)', {
  state: { feedRate: 106, refSeverity: 104, fccSeverity: 104, maint: 130 },
}, null, WEEKS, SEEDS);

// T6: turnaround discipline — run hard but take planned outages at condition 55.
runStrategy('T6 turnarounds (medium, planned outages)', {
  state: { crudeType: 'medium', feedRate: 98, cuts: { c1: 3, c2: 0, c3: 4 }, maint: 100, refSeverity: 105, fccSeverity: 108 },
}, (S) => {
  for (const k of Object.keys(S.units)) {
    if (S.units[k].condition < 55 && S.units[k].downDays === 0) { scheduleTurnaround(S, k); break; }
  }
}, WEEKS, SEEDS);

// T7: delivery shock — three skipped deliveries in a row mid-run; does the tank
// buffer absorb one and starve on the second, and does production recover?
runStrategy('T7 delivery shock (skip wk 10-12)', {}, (S, w) => {
  if (w === 10) S.skipDelivery = 3;
}, 26, SEEDS);

// T8: builder — skilled medium play, adds alky then FCC expansion when affordable.
// Should beat T2 over the year despite $30M capex.
runStrategy('T8 builder (medium + alky + fccx)', {
  state: { crudeType: 'medium', feedRate: 98, cuts: { c1: 3, c2: 0, c3: 4 }, maint: 115, refSeverity: 105, fccSeverity: 108 },
}, (S) => {
  if (!S.builds.alky.started && S.cash >= 30) startProject(S, 'alky');
  else if (S.builds.alky.done && !S.builds.fccx.started && S.cash >= 30) startProject(S, 'fccx');
}, WEEKS, SEEDS);

// T10: contract-taker — locks a jet contract at +$3/bbl above market for 6 weeks
// starting week 5, sized at ~80% of typical jet output. Small positive delta,
// penalties only if something breaks.
runStrategy('T10 contract (jet 10 kbd @ mkt+3, wk 5-10)', {
  state: { crudeType: 'medium', feedRate: 98, cuts: { c1: 3, c2: 0, c3: 4 }, maint: 115, refSeverity: 105, fccSeverity: 105 },
}, (S, w) => {
  if (w === 5 && !S.contract) S.contract = { product: 'jet', bpod: 10, price: S.prices.jet + 3, penalty: 1.5, weeksLeft: 6, deliveredWk: 0, requiredWk: 0 };
}, 26, SEEDS);

// T9: free-builder — places an FCC train then a crude train and raises feed to
// use them. Placed capacity must integrate with the aggregate flows sanely.
runStrategy('T9 free-builder (fcc2 + cdu2, feed up)', {
  state: { crudeType: 'medium', feedRate: 98, cuts: { c1: 3, c2: 0, c3: 4 }, maint: 115, refSeverity: 105, fccSeverity: 105 },
}, (S, w) => {
  if (!S.placed.some(p => p.type === 'fcc2') && S.cash >= 25) placeItem(S, 'fcc2', 0, -40, 0);
  else if (S.placed.some(p => p.done && p.type === 'fcc2') && !S.placed.some(p => p.type === 'cdu2') && S.cash >= 35) placeItem(S, 'cdu2', -8, -40, 0);
  if (S.placed.some(p => p.done && p.type === 'cdu2')) S.feedRate = 115;
}, WEEKS, SEEDS);
