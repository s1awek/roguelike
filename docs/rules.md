# Rulebook

Wersja polska: [zasady.md](zasady.md).

This file is **generated** from `src/lang/rules-en.js` by `npm run zasady`.
Do not edit it by hand - change the source, so the same text reaches this
file, the terminal game (`?`) and the browser game (`?`).

The numbers in the tables are not copied by hand - they are computed from the
same tables the game uses while it runs.

## Goal of the game

Descend to level 8, defeat the final enemy - the Dragon of the Abyss - take the Amulet of the Abyss and carry it back up the stairs all the way to the surface.

The up staircase on level 1 is the way out of the dungeon. Without the Amulet you cannot leave by it: the game will not let you return empty-handed.

The dungeon is generated from a seed. The same game from the same seed plays out exactly the same way - the same layout, the same rolls, the same potion looks.

## Controls

| key | what it does |
|---|---|
| arrows, hjkl, yubn, numeric keypad | move and attack - stepping onto a monster is a blow |
| . or 5 | wait one turn |
| , or g | pick up what lies at your feet |
| x | inspect what lies at your feet - its effect, the difference against what you wear, the space it takes; costs no turn |
| > / < | stairs down / up |
| i | inventory: a letter uses or puts on |
| d | drop an item |
| w | sniff a potion - costs a turn, costs no health |
| ? | this book |
| S / L | save / load |
| Q | quit the game (terminal only) |
| click on a known tile | walk there - stops at the sight of a monster, on losing health and over an item (graphical version only) |
| m | minimap - on and off (graphical version only) |
| Shift+N | new game (graphical version only) |

A rejected action - walking into a wall, picking up from an empty tile, sniffing something that is not a potion - does NOT cost a turn. The world only moves when you do something.

## What you can and cannot see

You see within a radius of 8 tiles, and only what is not blocked. The field of view is symmetric: if you can see a monster, the monster can see you.

Tiles you have seen once stay in memory and are drawn dimmed. Memory covers ONLY the shape of the dungeon - you will not see monsters or items outside your field of view, even if you stood there a moment ago.

Monsters sleep until you wake them. An awakened monster follows you, and a bat moves unpredictably.

## Combat

Stepping onto a monster's tile is an attack. There is no separate attack key.

Damage works like this: you roll from 1 to your attack, the defender rolls from 0 to their defense and subtracts it. A result of zero or less is a miss. Strong armor therefore does not cut damage by a fixed amount - it RAISES THE CHANCE that a blow does not get through at all.

| value | what it is made of |
|---|---|
| your attack | strength + weapon bonus + sharpening |
| your defense | agility + armor bonus + reinforcement |
| monster attack | its strength |
| monster defense | its defense |

The same rule works both ways, so any blow can miss - even the Dragon's.

Killing an enemy gives you back some of your strength - the more, the more dangerous it was. It never raises your health above full, so you cannot make up for any amount of damage by standing in a doorway and picking off small fry. Fighting still pays better than avoiding: even a small enemy gives back something that walking around it in a wide arc does not.

| enemy | strength back per kill |
|---|---|
| rat | +2 |
| bat | +2 |
| kobold | +2 |
| goblin | +3 |
| skeleton | +4 |
| orc | +5 |
| ogre | +7 |
| troll | +10 |
| wraith | +8 |
| Dragon of the Abyss | +26 |

## Clashes with other adventurers

As long as you see no one, you move at your own pace. When another adventurer enters your field of view, your turn is resolved SIMULTANEOUSLY: both of you declare a move blind and both act in the same turn. That is why the board waits for the other side - the game has not frozen. Nobody gets a free series of blows, so jumping back is always possible.

A lost clash does NOT end the game. You drop all your belongings on the spot and wake up one level higher with what is left of your strength. The Amulet drops too, so taking it from someone is a real way to win the race.

Retreat is not free. Whoever stood face to face and jumped back takes a blow in the back from the one who stayed - at half the usual strength. When both sides step apart in the same turn, nobody takes anything.

You can back away 6 times in a row. Then you run out of breath, and your next attempt to retreat ends in a stop to breathe - you stand still for one turn and your opponent does not. The counter goes down when you stand or attack. The rule applies to both sides equally: that is why endless running is impossible and the stronger side can force the clash to a decision.

## Character growth

Defeated monsters give you experience. A level-up gives +10 to maximum health (and as much right away), +1 to strength, and every second level +1 to agility.

| level | experience needed |
|---|---|
| 2 | 10 |
| 3 | 36 |
| 4 | 76 |
| 5 | 129 |
| 6 | 196 |
| 7 | 275 |
| 8 | 365 |

Health regenerates on its own VERY slowly: 1 point every 69 turns at the first character level and every 48 at the eighth. A starving hero does not regenerate at all. Sleeping off wounds is therefore the expensive road - the main source of strength is FIGHTING, because every kill gives some of it back.

## Hunger

You start with 1200 food and lose 1 point per turn. Eating raises it to at most 2000.

| food | state | what happens |
|---|---|---|
| above 700 | full | nothing, except that the clock is ticking |
| 301-700 | peckish | nothing, except that the clock is ticking |
| 101-300 | hungry | a warning in the log: "You are getting hungry." |
| 1-100 | weak with hunger | a warning in the log: "You are very hungry!" |
| 0 | STARVING | starving: you lose 1 health every third turn and do not regenerate |

| item | food | how often |
|---|---|---|
| food ration | 800 | 63% |
| apple | 250 | 37% |

Hunger is the clock of the whole expedition: it punishes dawdling and too much wandering around levels you have already explored.

## Potions: how to know what you drink

The kinds of potions are always the same and always work the same way. What changes is the LOOK: at the start of every game, colors are randomly assigned to kinds. "Black potion" means something different in every game, but within one game it always means the same thing.

| potion | what it does | how often | scent |
|---|---|---|---|
| potion of healing | heals 12 health | 44% | mild |
| potion of full healing | heals 30 health | 22% | mild |
| potion of strength | +1 strength, permanently | 17% | sharp |
| potion of poison | takes away 8 health | 17% | sharp |

Sniffing (key w) costs one turn and no health. The scent splits potions into two pairs and NEVER points to a single one: "mild" is the potion of healing or the potion of full healing, "sharp" is the potion of strength or the potion of poison. So it answers the question "will this hurt me", not "what exactly is it".

The scent stays next to the potion's name in your pack, so you do not have to remember it. If the other kind of the pair is already identified, sniffing settles it for sure - the game does that elimination for you.

> Four ways to know more, from the cheapest: (1) sniff - it costs one turn; (2) count how often you see a given color - the potion of healing is the most common; (3) eliminate - there are four kinds, so once you know three, the fourth color is settled; (4) drink at full health with no monster in sight - poison takes a fixed number of points, so such a test cannot kill you, but it wastes a potion of healing.

Identification works on the KIND, not on the single item: once you learn what a pearly potion is, all pearly potions - in your pack, on the floor, found later - carry their true name.

## Scrolls

Scrolls work the same way as potions: the kind is fixed, the label on the scroll is rolled for the whole game. Scrolls cannot be sniffed - the only cheap road to knowing them is a scroll of identify.

| scroll | what it does | how often |
|---|---|---|
| scroll of identify | identifies every unknown potion and scroll you are carrying | 21% |
| scroll of magic mapping | reveals the layout of the whole level (without monsters and items) | 21% |
| scroll of teleportation | moves you to a random free spot on the same level | 25% |
| scroll of enchant weapon | +1 to the weapon you hold, permanently | 17% |
| scroll of enchant armor | +1 to the armor you wear, permanently | 16% |

A scroll of identify identifies everything unknown you carry AT THAT MOMENT - so it pays to collect mysteries and read it when your pack is full of them.

## Weapons and armor

Weapons and armor are known at a glance - there is no mystery here. Deeper levels give better gear; shallow ones do not give it at all.

| weapon | attack bonus | space in the pack | from level |
|---|---|---|---|
| dagger | +1 | 1x2 | 1 |
| short sword | +2 | 1x3 | 1 |
| mace | +3 | 2x2 | 2 |
| long sword | +4 | 1x4 | 4 |
| battle axe | +6 | 2x3 | 5 |

| armor | defense bonus | space in the pack | from level |
|---|---|---|---|
| leather armor | +1 | 2x2 | 1 |
| studded leather armor | +2 | 2x2 | 1 |
| chain mail | +3 | 2x3 | 3 |
| plate armor | +5 | 3x3 | 5 |

The pack itself shows the effect of every item and what changes when you put it on: "defense +2, worse by 1" means this armor is weaker than the chain mail you are wearing. You do not have to copy these numbers from the table or remember them - they stand next to the item. Potions and scrolls show their effect only once identified.

## The pack

The pack has 5x4 slots, and items take up different numbers of them: a potion or a scroll one slot, a long sword four, plate armor nine. Space is counted by area, not by the number of items.

Items can be dragged with the mouse, and turned a quarter turn by holding the space bar. The highlight while dragging shows whether the item will fit there.

Items you cannot tell apart stack: up to 4 potions or scrolls in one slot, up to 2 portions of food. Two potions with a DIFFERENT look never land in a shared slot - otherwise the merge alone would give away that they are the same.

| pack | slots | from level |
|---|---|---|
| travel pack | 6x4 | 3 |
| great pack | 6x5 | 5 |

Picking up an item that does not fit is refused and does NOT cost a turn - nothing is lost. You can always drop things (key d), even from a full pack.

## Monsters

| monster | glyph | health | strength | defense | experience | levels |
|---|---|---|---|---|---|---|
| rat | r | 5 | 3 | 0 | 2 | 1-3 |
| bat | b | 6 | 3 | 1 | 3 | 1-4 |
| kobold | k | 9 | 4 | 1 | 5 | 1-5 |
| goblin | g | 13 | 5 | 2 | 8 | 2-6 |
| skeleton | s | 18 | 6 | 3 | 13 | 3-7 |
| orc | o | 24 | 8 | 4 | 20 | 4-8 |
| ogre | O | 36 | 13 | 6 | 32 | 5-8 |
| troll | T | 48 | 15 | 7 | 55 | 6-8 |
| wraith | W | 40 | 17 | 8 | 70 | 7-8 |

| final enemy | glyph | health | strength | defense | experience | level |
|---|---|---|---|---|---|---|
| Dragon of the Abyss | D | 130 | 19 | 10 | 400 | 8 |

The troll regenerates during a fight, the bat moves erratically and is hard to hit by anticipation, and the wraith hits harder than its looks suggest.

## Saving

A save covers everything, including the state of the random number generator - a resumed game is indistinguishable from the one before saving, not merely similar.

In the terminal S saves to a file and L loads it. In the browser the game also saves itself after every turn, and S makes a separate checkpoint. Saves are interchangeable between the versions - it is the same format.
