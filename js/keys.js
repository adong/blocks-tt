/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: BT.NAME, // the name lives in js/title.js
  keys: [
    ['walk', 'W A S D', '↑ ↓'],
    ['look around', 'the mouse', '← →'],
    ['break · place a block', 'left click · right click'],
    ['jump · fly up · fly down', 'Space · hold Space · Shift'],
    ['fly on or off (🔥 NORMAL)', 'double-tap Space'],
    ['pick a block · all the blocks', '1 – 9 · E'],
    ['undo · fill a box · mirror · ruler', 'Z · F · G · R'],
    ['call your brother · pick what he builds', 'T · B'],
    ['quests · show me a star', 'Q · H'],
    ['camera · day or night', 'V · N'],
    ['swap turns (2 players)', 'Tab'],
    ['sound · pause', 'M · P or Esc'],
  ],
  note: 'Click the world once and the mouse looks around (Esc lets go). In 🐣 EASY you always fly and a see-through block shows where yours will go. FILL: place on one corner, then the other. Find the 5 golden stars, build a house with a door and a tower 10 blocks high for stickers!',
  touch: 'The stick on the left walks, drag anywhere to look, and the big buttons PLACE, BREAK and JUMP (double-tap JUMP to fly in 🔥 NORMAL). Your brother\'s face (top left) calls him. 🛠️ opens the tools on a phone.',
});
