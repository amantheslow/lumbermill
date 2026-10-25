'use strict';
// The story: six chapters that follow the walkthrough, Edda Rowan's journal, letters that ask for a decision,
// forest fires, and the ending.

const TOWN = 'Fernhollow Town Council';
const MAYOR = 'Ilse Brannock, Mayor of Fernhollow';

// Edda Rowan ran the mill forty years ago. Her pages are read in the order they are found.
const JOURNAL = [
  ['Spring, the first year', 'The Board has given me the lease. Forty acres of spruce and maple, and an oak that must be older than the valley road. I have promised them I will take only what grows back.'],
  ['Midsummer', 'Grindstone\'s agent came again. He wants the whole north slope felled by autumn and pays three times the going rate. Tomas says we would be fools to refuse.'],
  ['Autumn', 'We took the north slope. The money paid for the new saw. The hillside looks like a shaved dog, and the stream runs brown whenever it rains.'],
  ['The second spring', 'Blight in the maples. Nothing left to slow it down: the old trees that sheltered the young ones are gone. I should have kept an arborist on.'],
  ['The dry summer', 'A spark from the steam engine, and the slope went up in an afternoon. We saved the oak and little else. Grindstone sent their condolences, and an offer for the lease.'],
  ['The last page', 'I could not sell to them. I am letting the lease lapse so the Board can find someone better. Whoever reads this: build it again, but slower. Take only what grows back.'],
];

const has3 = (fn) => () => { try { return !!fn(); } catch { return false; } };
const CHAPTERS = [
  { n: 1, title: 'A Fresh Start', goals: [] }, // the walkthrough
  {
    n: 2, title: 'Making a Name',
    intro: ['Forestry Board', 'Your first season', 'You have a working mill. Well done.\n\nThe Board will be watching how you treat the forest. Sell steadily, keep your machines running and your contracts honoured, and the valley will start to notice you.'],
    goals: [
      { id: 'c2_planks', text: 'Sell 30 planks', reward: 400, test: () => (G.stats.sold.plank || 0) >= 30 },
      { id: 'c2_contract', text: 'Complete a trade contract', reward: 500, test: () => G.stats.contracts >= 1 },
      { id: 'c2_mech', text: 'Hire a Mechanic', reward: 200, test: () => G.workers.some(w => w.role === 'mechanic') },
    ],
  },
  {
    n: 3, title: 'The Fernhollow Bridge',
    intro: [MAYOR, 'A bridge, if you can spare the planks', 'Dear neighbour,\n\nThe spring flood took our bridge, and the farms on the far bank cannot get to market. The town has scraped together what it can.\n\nWould you supply 60 planks within 12 days? We will pay well above market, and Fernhollow does not forget a favour.\n\nThere is something else. Old folk here still talk about the woman who ran your mill before, Edda Rowan. They say she kept a journal. If you find any of it in the woods, I would love to know what happened to her.'],
    start: () => addStoryContract('bridge', 'plank', 60, 22, 12),
    goals: [
      { id: 'c3_bridge', text: 'Deliver 60 planks for the Fernhollow bridge', reward: 0, test: () => G.story.flags.bridge },
      { id: 'c3_journal', text: 'Find 2 pages of Edda Rowan\'s journal', reward: 300, test: () => G.story.journal >= 2 },
    ],
  },
  {
    n: 4, title: 'Grindstone\'s Offer',
    intro: ['Grindstone Timber Co.', 'A business proposal', 'Congratulations on the bridge. Fernhollow will not stop talking about you.\n\nGrindstone supplies every mill town from here to the coast, and we do not enjoy surprises. So let us be practical. Agree to stay out of our markets and we will stop cutting our prices against you. In return, we take a tenth of what your depot sells.\n\nOr carry on alone. We wish you luck with that.'],
    choices: [['refuse', 'Refuse: we will compete'], ['truce', 'Accept: pay a tenth, no more price cuts']],
    goals: [
      { id: 'c4_choice', text: 'Answer Grindstone\'s letter', reward: 0, test: () => !!G.story.flags.rival },
      { id: 'c4_chairs', text: 'Sell 10 chairs', reward: 600, test: () => (G.stats.sold.chair || 0) >= 10 },
      { id: 'c4_staff', text: 'Grow your crew to 6', reward: 300, test: () => G.workers.length >= 6 },
      { id: 'c4_forest', text: 'Keep forest cover at 95% or more', reward: 400, test: () => G.health >= 95 && G.story.daysIn >= 2 },
    ],
  },
  {
    n: 5, title: 'The Dry Summer',
    intro: ['Forestry Board', 'Fire warning', 'No rain for weeks across the whole district. The woods are as dry as we have known them.\n\nIf fire starts, every hand you have must go to it. Staff douse flames faster with a well nearby, and a burning tree spreads to its neighbours quickly.\n\nWe found a note in the old files: the last mill on your site was lost to fire.'],
    start: () => { G.story.fireAt = G.t + 1440 * 0.6; },
    goals: [
      { id: 'c5_fire', text: 'Put out the forest fire', reward: 500, test: () => G.story.flags.fireStarted && !G.trees.some(t => t.fire > 0) },
      { id: 'c5_plant', text: 'Plant 25 saplings', reward: 400, test: () => G.stats.planted >= 25 },
      { id: 'c5_journal', text: 'Find 4 pages of the journal', reward: 400, test: () => G.story.journal >= 4 },
    ],
  },
  {
    n: 6, title: 'Heartwood',
    intro: [MAYOR, 'A town hall worth sitting in', 'Dear friend,\n\nWith the bridge open, Fernhollow is growing again, and we are building a proper town hall. The council would like it furnished from your mill and nowhere else: 12 tables, within 20 days.\n\nYou will need a skilled workshop for tables. I am told the trick is called Fine Furniture.\n\nAnd please, tell me if you find the rest of Edda\'s journal.'],
    start: () => addStoryContract('hall', 'table', 12, 260, 20),
    goals: [
      { id: 'c6_hall', text: 'Deliver 12 tables for the town hall', reward: 0, test: () => G.story.flags.hall },
      { id: 'c6_forest', text: 'Grow forest cover to 100%', reward: 600, test: () => G.health >= 100 },
      { id: 'c6_journal', text: 'Find all 6 journal pages', reward: 800, test: () => G.story.journal >= 6 },
    ],
  },
];
const EXTRAS = [ // free play, after the story
  { id: 'x_secrets', text: 'Find every secret in the forest', reward: 1000, test: () => G.secrets.every(s => s.done) },
  { id: 'x_rich', text: 'Bank 25,000 coins', reward: 0, test: () => G.money >= 25000 },
  { id: 'x_crew', text: 'Run a crew of 10', reward: 500, test: () => G.workers.length >= 10 },
  { id: 'x_rank', text: `Become the ${RANKS[RANKS.length - 1].name}`, reward: 2000, test: () => rankOf() >= RANKS.length - 1 },
  { id: 'x_power', text: 'Make 100 power at once', reward: 800, test: () => G.nets.reduce((s, n) => s + (n.supply || 0), 0) >= 100 },
  { id: 'x_mk3', text: 'Tune a machine to Mk III', reward: 600, test: () => G.buildings.some(b => b.lvl >= 3) },
  { id: 'x_kits', text: 'Ship a cabin kit', reward: 1500, test: () => (G.stats.sold.kit || 0) + (G.story.flags.settlers ? 1 : 0) >= 1 },
];

function newStory() { return { chapter: 1, done: [], flags: {}, journal: 0, daysIn: 0, fireAt: null, ended: false }; }
function chapterDef(n = G.story.chapter) { return CHAPTERS.find(c => c.n === n); }
function storyGoals() {
  if (G.story.ended) return EXTRAS;
  const c = chapterDef();
  return c ? c.goals : [];
}

function startChapter(n) {
  const c = chapterDef(n);
  if (!c) return;
  G.story.chapter = n; G.story.daysIn = 0;
  if (c.intro) letter(c.intro[0], c.intro[1], c.intro[2], 'story', c.choices ? { story: 'rival', choices: c.choices } : null);
  if (c.start) c.start();
  toast(`Chapter ${n}: ${c.title}`, 'good');
  if (c.choices) askForAnswer();
}
// the walkthrough is chapter 1; this begins the rest
function beginStory() { if (G.story.chapter < 2) startChapter(2); }

function checkStory() {
  if (!G.story || G.story.chapter < 2) return;
  for (const g of storyGoals()) {
    if (G.story.done.includes(g.id) || !has3(g.test)()) continue;
    G.story.done.push(g.id);
    if (g.reward) money(g.reward);
    toast(`Goal complete: ${g.text}${g.reward ? ` (+${fmt(g.reward)})` : ''}`, 'good');
    sfx('coin');
  }
  if (G.story.ended) return;
  const c = chapterDef();
  if (c && c.goals.length && c.goals.every(g => G.story.done.includes(g.id))) {
    if (c.n === 6) endStory();
    else { sfx('level'); startChapter(c.n + 1); }
  }
  // the fire chapter's blaze
  if (G.story.fireAt !== null && G.t >= G.story.fireAt) { G.story.fireAt = null; igniteForest(true); }
}

// ---------- contracts the story asks for ----------
function addStoryContract(key, item, qty, price, days, company = TOWN) {
  G.contracts.push({ id: ++G.uid, company, item, qty, price, days, expires: dayOf() + 99, negotiated: true, deadline: dayOf() + days, delivered: 0, story: key });
}
function storyContractDone(c) {
  G.story.flags[c.story] = true;
  if (c.story === 'bridge') letter(MAYOR, 'The bridge is open', 'The last plank went in this morning and the whole town walked across it. Thank you. Fernhollow will remember this.\n\nCome to the opening fair if you can ever leave that mill of yours.', 'good');
  if (c.story === 'hall') letter(MAYOR, 'The town hall is furnished', 'The council sat at your tables for the first time today. Somebody carved a little tree into the leg of the mayor\'s chair. I am choosing to believe that was you.', 'good');
  const cm = COMMISSIONS.find(k => k.key === c.story);
  if (cm) letter(cm.company, cm.thanks[0], cm.thanks[1], 'good');
}
function storyContractLate(c) { // the town is patient: it asks again rather than suing
  c.deadline = dayOf() + 8;
  letter(c.company || TOWN, 'Still hoping for those ' + ITEMS[c.item].name.toLowerCase(), `We have ${c.delivered} of the ${c.qty} ${ITEMS[c.item].name.toLowerCase()} so far. The council has agreed to wait another 8 days. Please do what you can.`, 'story');
}

// ---------- mill ranks and the big commissions that come with them ----------
// commissions are patient like the town: a late one is extended rather than cancelled
const COMMISSIONS = [
  { rank: 2, key: 'rail', company: 'Ridgeway Rail Co.', item: 'beam', qty: 30, price: 58, days: 24,
    ask: ['A station for Fernhollow', 'The new branch line will stop at Fernhollow, and the station roof needs 30 good beams. We hear your mill is the one to ask.\n\nIf you have not got a Beam Saw yet, Beam Saws are on your research list now. We can wait a while.'],
    thanks: ['The station is roofed', 'The first train pulled in under your beams this morning. The driver blew the whistle twice, which I am told is a compliment.'] },
  { rank: 3, key: 'school', company: 'Fernhollow School Board', item: 'cabinet', qty: 8, price: 330, days: 30,
    ask: ['Cabinets for the new school', 'Fernhollow has children again, and the new schoolhouse needs 8 sturdy cabinets for books and slates.\n\nA Joinery makes them from seasoned boards and beams. Research Joinery once you have Drying Kilns and Beam Saws.'],
    thanks: ['The school is open', 'Thirty-one children, eight cabinets, and not one of them has managed to break a door yet. Thank you.'] },
  { rank: 4, key: 'settlers', company: 'Coastal Settlers\' Union', item: 'kit', qty: 3, price: 980, days: 36,
    ask: ['Homes on the coast', 'Families are moving to the coast faster than we can house them. We would like 3 cabin kits from your Joinery: beams and boards, cut and numbered, ready to raise.\n\nResearch Cabin Kits to make them.'],
    thanks: ['Three new homes', 'Three families slept under their own roofs last night. One of them has named their daughter after your mill. We did try to talk them out of it.'] },
];
function rankUp(r) {
  const was = G.rank;
  G.rank = r;
  if (r <= was) return;
  const opened = RESEARCH.filter(x => (x.rank || 0) > was && (x.rank || 0) <= r).map(x => x.name);
  const bonus = r * 500;
  money(bonus);
  letter('Valley Timber Guild', `Your mill is now a ${RANKS[r].name}`, `Congratulations. Your sales have made you a ${RANKS[r].name} in the eyes of the Guild, and here is ${fmt(bonus)} towards the next step.${opened.length ? `\n\nNew research is open to you: ${opened.join(', ')}.` : ''}${r < RANKS.length - 1 ? `\n\nSell ${fmt(RANKS[r + 1].need)} in all to become a ${RANKS[r + 1].name}.` : '\n\nThere is no higher rank. The Guild has run out of titles.'}`, 'good');
  toast(`Mill rank: ${RANKS[r].name}!`, 'good');
  sfx('level');
  for (const cm of COMMISSIONS) {
    if (cm.rank > r || cm.rank <= was || G.story.flags[cm.key] || G.contracts.some(c => c.story === cm.key)) continue;
    addStoryContract(cm.key, cm.item, cm.qty, cm.price, cm.days, cm.company);
    letter(cm.company, cm.ask[0], cm.ask[1], 'story');
  }
}

// ---------- letters that ask for an answer ----------
function askForAnswer() { if (typeof onAskAnswer === 'function') onAskAnswer(); }
function answerLetter(l, choice) {
  if (!l.choices || l.chosen) return;
  l.chosen = choice;
  if (l.story === 'rival') {
    G.story.flags.rival = choice;
    if (choice === 'refuse') {
      for (const w of G.workers) w.mood.morale = Math.min(100, w.mood.morale + 12);
      letter('Grindstone Timber Co.', 'As you wish', 'We have noted your answer. Expect to see a great deal more of our prices.', 'bad');
      toast('Your crew cheered when they heard. Expect Grindstone to undercut you more often.', 'good');
    } else {
      G.rivalFlood = null;
      letter('Grindstone Timber Co.', 'A sensible choice', 'Our clerk will collect our tenth from your depot takings. You will not see our prices in your markets again.', 'info');
      toast('Truce agreed: no more price cuts, but Grindstone takes a tenth of depot sales.');
    }
  }
}

// ---------- journal pages ----------
function findJournalPage() {
  if (G.story.journal >= JOURNAL.length) return;
  const [when, text] = JOURNAL[G.story.journal];
  G.story.journal++;
  letter('Edda Rowan\'s journal', `Page ${G.story.journal} of ${JOURNAL.length}: ${when}`, text, 'journal');
  toast(`You found a page of Edda Rowan's journal (${G.story.journal} of ${JOURNAL.length}).`, 'good');
}
// scatter the four loose pages through the unexplored woods
function placeJournalSecrets() {
  const c = MAP / 2;
  for (let n = 0; n < 4; n++) {
    for (let tries = 0; tries < 500; tries++) {
      const x = ri(4, MAP - 5), y = ri(4, MAP - 5);
      if (!G.tiles[idx(x, y)] || G.occ[idx(x, y)] || G.belt[idx(x, y)] || G.reveal[idx(x, y)] || Math.hypot(x - c, y - c) < 13) continue;
      if (G.secrets.some(s => Math.hypot(s.x - x, s.y - y) < 7)) continue;
      removeTree(x, y);
      G.secrets.push({ x, y, kind: 'journal', found: false, done: false });
      break;
    }
  }
}

// ---------- fire ----------
function igniteForest(story) {
  const c = bCenter(G.hq);
  const cands = G.trees.filter(t => !t.dead && t.sp !== 'ancient' && !t.fire && treeStage(t) !== 'sapling' && G.reveal[idx(t.x, t.y)] && dist(t.x, t.y, c.x, c.y) > 8 && dist(t.x, t.y, c.x, c.y) < 26);
  if (!cands.length) return;
  const t = pick(cands);
  t.fire = 0.01;
  G.story.flags.fireStarted = true;
  const seen = G.buildings.some(b => b.type === 'lookout' && dist(b.x, b.y, t.x, t.y) <= 18);
  G.story.spotAt = G.t + (seen ? 0 : 10 * MIN_PER_SEC); // without a lookout, the crew notices the smoke about ten seconds later
  if (G.speed > 1) setSpeed(1);
  sfx('clank');
  letter('Mill Ledger', 'Fire in the forest!', `${seen ? 'The lookout rang the bell the moment it started.' : 'Smoke over the trees.'} Every free hand is heading for it. The red flame button at the top right takes you there.\n\nA well near the fire lets the crew douse it faster, and a Lookout Tower spots fires the moment they start.`, 'bad');
  toast('Fire in the forest! Your crew is heading for it.', 'bad');
  if (!story) G.story.flags.lastFire = dayOf();
}
// each burning tree lights a neighbour now and then: about one or two over its life in thick forest
const FIRE_BURN = 22, FIRE_SPREAD = 0.026, SEASON_FIRE = [0.6, 1.3, 1, 0.3];
function updateFire(dt) {
  const burning = G.trees.filter(t => t.fire > 0 || t.wet > 0);
  const spread = FIRE_SPREAD * SEASON_FIRE[seasonOf()] * dt;
  for (const t of burning) {
    if (t.wet > 0) { t.wet -= dt; if (!(t.fire > 0)) continue; }
    t.fire += dt;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const o = inMap(t.x + dx, t.y + dy) && G.tree[idx(t.x + dx, t.y + dy)];
      if (o && !o.fire && !(o.wet > 0) && !o.dead && o.sp !== 'ancient' && chance(spread)) o.fire = 0.01;
    }
    if (Math.random() < dt * 2) fxPuff(isoX(t.x + 0.5, t.y + 0.5), isoY(t.x + 0.5, t.y + 0.5) - 26, 'rgba(70,64,60,', 1, 3);
    if (t.fire > FIRE_BURN) { t.fire = 0; t.dead = true; t.charred = true; t.deadDays = 0; }
  }
}
function wellNear(x, y) { return G.buildings.some(b => b.type === 'well' && dist(b.x, b.y, x, y) < 12); }

// ---------- the end ----------
function endStory() {
  G.story.ended = true;
  money(3000);
  letter('Forestry Board', 'The Heartwood Award', `Each year the Board names one mill in the district that has done right by its forest. This year it is yours.\n\nYou built a mill that feeds a town, kept your crew, and left the woods thicker than you found them. Edda Rowan would have been proud.\n\nThe award comes with 3,000 coins and our thanks. The valley is yours to run as you see fit.`, 'good');
  if (typeof onStoryEnd === 'function') onStoryEnd();
}
