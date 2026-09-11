// The rulebook in English. Same chapters, same ids, same tables and the same
// computed numbers as the Polish book in `src/rules.js` - the game tables come
// in as `Z`, so no number here is typed in by hand (the parity test in
// `test/jezyki.test.js` compares the numbers block by block).

import { NAZWY_EN, EN } from './en.js';

const KEYS_EN = [
  ['arrows, hjkl, yubn, numeric keypad', 'move and attack - stepping onto a monster is a blow', 'oba'],
  ['. or 5', 'wait one turn', 'oba'],
  [', or g', 'pick up what lies at your feet', 'oba'],
  ['x', 'inspect what lies at your feet - its effect, the difference against what you wear, the space it takes; costs no turn', 'oba'],
  ['> / <  (that is Shift+. / Shift+,)', 'stairs down / up - the same glyphs as on the map', 'oba'],
  ['i', 'inventory: a letter uses or puts on', 'oba'],
  ['d', 'drop an item', 'oba'],
  ['w', 'sniff a potion - costs a turn, costs no health', 'oba'],
  ['?', 'this book', 'oba'],
  ['S / L', 'save / load', 'oba'],
  ['Q', 'quit the game', 'term'],
  ['click on a known tile', 'walk there - stops at the sight of a monster, on losing health and over an item', 'web'],
  ['m', 'minimap - on and off', 'web'],
  ['Shift+N', 'new game', 'web'],
];

const POTION_EFFECT = {
  heal: (p) => `heals ${p.power} health`,
  greaterHeal: (p) => `heals ${p.power} health`,
  strength: (p) => `+${p.power} strength, permanently`,
  poison: (p) => `takes away ${p.power} health`,
};

const SCROLL_EFFECT = {
  identify: 'identifies every unknown potion and scroll you are carrying',
  magicMap: 'reveals the layout of the whole level (without monsters and items)',
  teleport: 'moves you to a random free spot on the same level',
  enchantWeapon: '+1 to the weapon you hold, permanently',
  enchantArmor: '+1 to the armor you wear, permanently',
};

export function ksiegaAngielska(gdzie, Z) {
  const nm = (kind, x) => NAZWY_EN[`${kind}:${x.type}`] ?? x.name;
  const boss = nm('monster', Z.BOSS);

  const keyRows = KEYS_EN
    .filter(([, , g]) => g === 'oba' || g === gdzie || gdzie === 'doc')
    .map(([k, opis, g]) => [k, gdzie === 'doc' && g !== 'oba'
      ? `${opis} (${g === 'web' ? 'graphical version only' : 'terminal only'})`
      : opis]);

  const mild = Z.scentGroup('mild').map(p => `the ${nm('potion', p)}`).join(' or ');
  const sharp = Z.scentGroup('sharp').map(p => `the ${nm('potion', p)}`).join(' or ');
  const scent = (key) => EN[`zapach.${key}.short`];

  return [
    {
      id: 'cel',
      title: 'Goal of the game',
      blocks: [
        { t: 'p', text: `Descend to level ${Z.MAX_DEPTH}, defeat the final enemy - the ${boss} - take the Amulet of the Abyss and carry it back up the stairs all the way to the surface.` },
        { t: 'p', text: 'The up staircase on level 1 is the way out of the dungeon. Without the Amulet you cannot leave by it: the game will not let you return empty-handed.' },
        { t: 'p', text: 'With the Amulet in hand the dungeon stirs. The level where you took it, and every level you enter on the way back to the surface, gets new inhabitants - as many as it had at the start, but nastier, as if it lay two levels deeper. Some of them are awake from the first moment. They appear outside your field of view and only once per level; the map, the items on the floor and the stairs stay exactly as you remember them.' },
        { t: 'p', text: 'The dungeon is generated from a seed. The same game from the same seed plays out exactly the same way - the same layout, the same rolls, the same potion looks.' },
      ],
    },
    {
      id: 'sterowanie',
      title: 'Controls',
      blocks: [
        { t: 'table', head: ['key', 'what it does'], rows: keyRows },
        { t: 'p', text: 'A rejected action - walking into a wall, picking up from an empty tile, sniffing something that is not a potion - does NOT cost a turn. The world only moves when you do something.' },
      ],
    },
    {
      id: 'widok',
      title: 'What you can and cannot see',
      blocks: [
        { t: 'p', text: `You see within a radius of ${Z.FOV_RADIUS} tiles, and only what is not blocked. The field of view is symmetric: if you can see a monster, the monster can see you.` },
        { t: 'p', text: 'Tiles you have seen once stay in memory and are drawn dimmed. Memory covers ONLY the shape of the dungeon - you will not see monsters or items outside your field of view, even if you stood there a moment ago.' },
        { t: 'p', text: 'Monsters sleep until you wake them. An awakened monster follows you, and a bat moves unpredictably.' },
      ],
    },
    {
      id: 'walka',
      title: 'Combat',
      blocks: [
        { t: 'p', text: 'Stepping onto a monster\'s tile is an attack. There is no separate attack key.' },
        { t: 'p', text: 'Damage works like this: you roll from 1 to your attack, the defender rolls from 0 to their defense and subtracts it. A result of zero or less is a miss. Strong armor therefore does not cut damage by a fixed amount - it RAISES THE CHANCE that a blow does not get through at all.' },
        { t: 'table', head: ['value', 'what it is made of'], rows: [
          ['your attack', 'strength + weapon bonus + sharpening'],
          ['your defense', 'agility + armor bonus + reinforcement'],
          ['monster attack', 'its strength'],
          ['monster defense', 'its defense'],
        ] },
        { t: 'p', text: 'The same rule works both ways, so any blow can miss - even the Dragon\'s.' },
        { t: 'p', text: 'Killing an enemy gives you back some of your strength - the more, the more dangerous it was. It never raises your health above full, so you cannot make up for any amount of damage by standing in a doorway and picking off small fry. Fighting still pays better than avoiding: even a small enemy gives back something that walking around it in a wide arc does not.' },
        { t: 'table', head: ['enemy', 'strength back per kill'], rows:
          Z.KINDS.map(k => [nm('monster', k), `+${Z.zwrotZaZabicie(k.hp)}`]).concat([[boss, `+${Z.zwrotZaZabicie(Z.BOSS.hp)}`]]) },
      ],
    },
    {
      id: 'starcia',
      title: 'Clashes with other adventurers',
      blocks: [
        { t: 'p', text: 'As long as you see no one, you move at your own pace. When another adventurer enters your field of view, your turn is resolved SIMULTANEOUSLY: both of you declare a move blind and both act in the same turn. That is why the board waits for the other side - the game has not frozen. Nobody gets a free series of blows, so jumping back is always possible.' },
        { t: 'p', text: 'A lost clash does NOT end the game. You drop all your belongings on the spot and wake up one level higher with what is left of your strength. The Amulet drops too, so taking it from someone is a real way to win the race.' },
        { t: 'p', text: 'Retreat is not free. Whoever stood face to face and jumped back takes a blow in the back from the one who stayed - at half the usual strength. When both sides step apart in the same turn, nobody takes anything.' },
        { t: 'p', text: `You can back away ${Z.PROG_ZMECZENIA} times in a row. Then you run out of breath, and your next attempt to retreat ends in a stop to breathe - you stand still for one turn and your opponent does not. The counter goes down when you stand or attack. The rule applies to both sides equally: that is why endless running is impossible and the stronger side can force the clash to a decision.` },
      ],
    },
    {
      id: 'rozwoj',
      title: 'Character growth',
      blocks: [
        { t: 'p', text: 'Defeated monsters give you experience. A level-up gives +10 to maximum health (and as much right away), +1 to strength, and every second level +1 to agility.' },
        { t: 'table', head: ['level', 'experience needed'], rows:
          [2, 3, 4, 5, 6, 7, 8].map(n => [String(n), String(Z.xpForLevel(n))]) },
        { t: 'p', text: `Health regenerates on its own VERY slowly: 1 point every ${Math.max(8, 24 - 1) * Z.REGEN_MNOZNIK} turns at the first character level and every ${Math.max(8, 24 - 8) * Z.REGEN_MNOZNIK} at the eighth. A starving hero does not regenerate at all. Sleeping off wounds is therefore the expensive road - the main source of strength is FIGHTING, because every kill gives some of it back.` },
      ],
    },
    {
      id: 'glod',
      title: 'Hunger',
      blocks: [
        { t: 'p', text: `You start with ${Z.HUNGER_START} food and lose 1 point per turn. Eating raises it to at most ${Z.HUNGER_MAX}.` },
        { t: 'table', head: ['food', 'state', 'what happens'], rows:
          [...Z.STOPNIE_GLODU].reverse().map((st, i, tab) => {
            const dolna = i + 1 < tab.length ? tab[i + 1].do + 1 : null;
            const zakres = st.do === Infinity ? `above ${tab[1].do}`
              : dolna === null ? String(st.do)
              : dolna === st.do ? String(st.do) : `${dolna}-${st.do}`;
            const co = st.do === 0
              ? 'starving: you lose 1 health every third turn and do not regenerate'
              : st.komunikat ? `a warning in the log: "${EN[`stan.glod.${st.klucz}.komunikat`]}"`
              : 'nothing, except that the clock is ticking';
            return [zakres, EN[`stan.glod.${st.klucz}`], co];
          }) },
        { t: 'table', head: ['item', 'food', 'how often'], rows:
          Z.FOODS.map(f => [nm('food', f), String(f.nutrition), Z.SHARE.food.get(f.type)]) },
        { t: 'p', text: 'Hunger is the clock of the whole expedition: it punishes dawdling and too much wandering around levels you have already explored.' },
      ],
    },
    {
      id: 'mikstury',
      title: 'Potions: how to know what you drink',
      blocks: [
        { t: 'p', text: 'The kinds of potions are always the same and always work the same way. What changes is the LOOK: at the start of every game, colors are randomly assigned to kinds. "Black potion" means something different in every game, but within one game it always means the same thing.' },
        { t: 'table', head: ['potion', 'what it does', 'how often', 'scent'], rows:
          Z.POTIONS.map(p => [nm('potion', p), POTION_EFFECT[p.type](p), Z.SHARE.potion.get(p.type), scent(Z.POTION_SCENT[p.type])]) },
        { t: 'p', text: `Sniffing (key w) costs one turn and no health. The scent splits potions into two pairs and NEVER points to a single one: "${scent('mild')}" is ${mild}, "${scent('sharp')}" is ${sharp}. So it answers the question "will this hurt me", not "what exactly is it".` },
        { t: 'p', text: 'The scent stays next to the potion\'s name in your pack, so you do not have to remember it. If the other kind of the pair is already identified, sniffing settles it for sure - the game does that elimination for you.' },
        { t: 'note', text: 'Four ways to know more, from the cheapest: (1) sniff - it costs one turn; (2) count how often you see a given color - the potion of healing is the most common; (3) eliminate - there are four kinds, so once you know three, the fourth color is settled; (4) drink at full health with no monster in sight - poison takes a fixed number of points, so such a test cannot kill you, but it wastes a potion of healing.' },
        { t: 'p', text: 'Identification works on the KIND, not on the single item: once you learn what a pearly potion is, all pearly potions - in your pack, on the floor, found later - carry their true name.' },
      ],
    },
    {
      id: 'zwoje',
      title: 'Scrolls',
      blocks: [
        { t: 'p', text: 'Scrolls work the same way as potions: the kind is fixed, the label on the scroll is rolled for the whole game. Scrolls cannot be sniffed - the only cheap road to knowing them is a scroll of identify.' },
        { t: 'table', head: ['scroll', 'what it does', 'how often'], rows:
          Z.SCROLLS.map(s => [nm('scroll', s), SCROLL_EFFECT[s.type], Z.SHARE.scroll.get(s.type)]) },
        { t: 'p', text: 'A scroll of identify identifies everything unknown you carry AT THAT MOMENT - so it pays to collect mysteries and read it when your pack is full of them.' },
      ],
    },
    {
      id: 'wyposazenie',
      title: 'Weapons and armor',
      blocks: [
        { t: 'p', text: 'Weapons and armor are known at a glance - there is no mystery here. Deeper levels give better gear; shallow ones do not give it at all.' },
        { t: 'table', head: ['weapon', 'attack bonus', 'space in the pack', 'from level'], rows:
          Z.WEAPONS.map(w => [nm('weapon', w), `+${w.bonus}`, `${w.size[0]}x${w.size[1]}`, String(w.minDepth)]) },
        { t: 'table', head: ['armor', 'defense bonus', 'space in the pack', 'from level'], rows:
          Z.ARMORS.map(a => [nm('armor', a), `+${a.bonus}`, `${a.size[0]}x${a.size[1]}`, String(a.minDepth)]) },

        { t: 'p', text: 'The pack itself shows the effect of every item and what changes when you put it on: "defense +2, worse by 1" means this armor is weaker than the chain mail you are wearing. You do not have to copy these numbers from the table or remember them - they stand next to the item. Potions and scrolls show their effect only once identified.' },
      ],
    },
    {
      id: 'plecak',
      title: 'The pack',
      blocks: [
        { t: 'p', text: `The pack has ${Z.PLECAK_START.w}x${Z.PLECAK_START.h} slots, and items take up different numbers of them: a potion or a scroll one slot, a long sword four, plate armor nine. Space is counted by area, not by the number of items.` },
        { t: 'p', text: gdzie === 'term'
          ? 'In the terminal nothing is arranged by hand - you only see how many slots are taken and how many are left, and items find their own place.'
          : 'Items can be dragged with the mouse, and turned a quarter turn by holding the space bar. The highlight while dragging shows whether the item will fit there.' },
        { t: 'p', text: `Items you cannot tell apart stack: up to ${Z.LIMIT_STOSU.potion} potions or scrolls in one slot, up to ${Z.LIMIT_STOSU.food} portions of food. Two potions with a DIFFERENT look never land in a shared slot - otherwise the merge alone would give away that they are the same.` },
        { t: 'table', head: ['pack', 'slots', 'from level'], rows:
          Z.PACKS.map(p => [nm('pack', p), `${p.w}x${p.h}`, String(p.minDepth)]) },
        { t: 'p', text: 'Picking up an item that does not fit is refused and does NOT cost a turn - nothing is lost. You can always drop things (key d), even from a full pack.' },
      ],
    },
    {
      id: 'potwory',
      title: 'Monsters',
      blocks: [
        { t: 'table', head: ['monster', 'glyph', 'health', 'strength', 'defense', 'experience', 'levels'], rows:
          Z.KINDS.map(k => [nm('monster', k), k.glyph, String(k.hp), String(k.str), String(k.def), String(k.xp), `${k.minD}-${k.maxD}`]) },
        { t: 'table', head: ['final enemy', 'glyph', 'health', 'strength', 'defense', 'experience', 'level'], rows:
          [[boss, Z.BOSS.glyph, String(Z.BOSS.hp), String(Z.BOSS.str), String(Z.BOSS.def), String(Z.BOSS.xp), String(Z.MAX_DEPTH)]] },
        { t: 'p', text: 'The troll regenerates during a fight, the bat moves erratically and is hard to hit by anticipation, and the wraith hits harder than its looks suggest.' },
      ],
    },
    {
      id: 'zapis',
      title: 'Saving',
      blocks: [
        { t: 'p', text: 'A save covers everything, including the state of the random number generator - a resumed game is indistinguishable from the one before saving, not merely similar.' },
        { t: 'p', text: gdzie === 'web'
          ? 'The game saves itself after every turn, so refreshing the page or closing the tab does not cost you the game. The S key makes a separate, deliberate checkpoint that L goes back to - the autosave does not overwrite it.'
          : gdzie === 'term'
            ? 'The S key saves the state to a file, L loads it. Saves are interchangeable with the graphical version - it is the same format.'
            : 'In the terminal S saves to a file and L loads it. In the browser the game also saves itself after every turn, and S makes a separate checkpoint. Saves are interchangeable between the versions - it is the same format.' },
      ],
    },
  ];
}
