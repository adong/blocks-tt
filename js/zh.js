/* TT Blocks: 中文. Kid-friendly simplified Chinese for every word on the page and on the canvas.
   People's names (Teddy, Tommy), the game's name, the key labels and world seeds (the words you type for an island)
   stay as they are. The brief's words: 方块 blocks, 建造 build, 挖 dig, 放置 place, 飞行 fly, 世界 world, 存档 save. */
(function () {
  'use strict';
  Kit.lang.keep(['TEDDY', 'TOMMY', 'Teddy', 'Tommy', 'TEDDY & TOMMY', BT.TITLE, BT.NAME, 'Claude Code', 'Esc', 'Tab', 'Shift', 'Space', 'Enter', 'W A S D']);
  const blocks = {};
  for (const b of BT.blocks.list) blocks[b.name] = b.zh;
  Kit.lang.add(blocks);
  Kit.lang.add({
    // the title
    'Build anything you like on your own little island!': '在你自己的小岛上，想建造什么就建造什么！',
    'Build, fly and find the stars': '建造、飞行、找星星', 'Build big and explore': '建造大房子，去探险',
    '▶ PLAY': '▶ 开始', '👥 2 PLAYERS': '👥 双人', '🐣 EASY': '🐣 简单', '🔥 NORMAL': '🔥 普通',
    '1 Tommy · 2 Teddy · 3 two players · E easy or normal': '1 Tommy · 2 Teddy · 3 双人 · E 简单或普通', 'Made with': '制作：',
    // my worlds
    'MY WORLDS': '世界存档', '◀ BACK': '◀ 返回', '➕ NEW WORLD': '➕ 新世界', 'Type any words for a new island, or roll the dice.': '随便打几个字就有一座新小岛，或者掷骰子。',
    '🏝️ MAKE IT!': '🏝️ 做出来！', 'SURE?': '确定？', 'SEED': '种子', 'Seed': '种子', 'A random seed': '随机种子', 'Delete': '删除',
    'TEDDY & TOMMY · 2 PLAYERS': 'TEDDY & TOMMY · 双人',
    // the HUD
    '🐣 FLYING': '🐣 飞行中', '🔥 FLYING': '🔥 飞行中', '🔥 WALKING': '🔥 走路中',
    'Call your brother': '叫兄弟来帮忙', 'Call your brother (T)': '叫兄弟来帮忙 (T)', 'Pick what he builds (B)': '选他建造什么 (B)', 'Pick what he builds': '选他建造什么',
    'High five (T)': '击掌 (T)', 'Quests (Q)': '任务 (Q)', 'Quests': '任务', 'Swap turns (Tab)': '换人 (Tab)', 'Swap turns': '换人', 'Tools': '工具',
    'Camera (V)': '镜头 (V)', 'Camera': '镜头', 'Day or night (N)': '白天或晚上 (N)', 'Day or night': '白天或晚上',
    'Sound (M)': '声音 (M)', 'Sound on or off': '声音 开 / 关', 'Pause (P)': '暂停 (P)', 'Pause': '暂停',
    'Undo (Z)': '撤销 (Z)', 'Fill a box (F)': '填满一个方框 (F)', 'Mirror building (G)': '镜像建造 (G)', 'Ruler (R)': '尺子 (R)', 'All the blocks (E)': '全部方块 (E)', 'All the blocks': '全部方块',
    'UNDO': '撤销', 'FILL': '填满', 'MIRROR': '镜像', 'RULER': '尺子',
    '🖱️ CLICK TO LOOK AROUND': '🖱️ 点一下就能用鼠标看四周',
    'DOWN': '向下', 'JUMP': '跳', 'BREAK': '挖', 'PLACE': '放置', 'Down': '向下', 'Jump': '跳', 'Break': '挖', 'Place': '放置',
    // the tools
    '📦 FILL: now the other corner!': '📦 填满：现在点另一个角！',
    '📦 FILL: PLACE on one corner, then the other (BREAK empties a box)': '📦 填满：先在一个角放置，再点另一个角（挖可以清空一个方框）',
    '📏 RULER: point at a block and tap PLACE or BREAK, then another': '📏 尺子：对准一个方块按放置或挖，再对准另一个',
    '🦋 MIRROR: what you build on one side appears on the other': '🦋 镜像：你在一边建造，另一边也会出现',
    'BLOCKS: ACROSS × UP × DEEP': '方块：宽 × 高 × 深',
    // the block picker
    'PICK A BLOCK': '选一个方块', 'Tap a block to put it in the yellow slot · 1 – 9 pick a slot · E or Esc close': '点一个方块放进黄色格子 · 1 – 9 选格子 · E 或 Esc 关闭', '✔ DONE': '✔ 完成',
    // quests
    'FIND 5 GOLDEN STARS': '找到 5 颗金星星', 'BUILD A HOUSE WITH A DOOR': '盖一座有门的房子', 'MAKE A TOWER 10 BLOCKS HIGH': '搭一座 10 格高的塔',
    'They\'re hidden all over the island: in the cave, up high, by the water…': '它们藏在小岛的各个地方：山洞里、高高的地方、水边……',
    'Walls all round, a roof on top, and a doorway 2 blocks high.': '四面有墙，上面有屋顶，还有一个 2 格高的门。',
    'Put 10 blocks one on top of the other.': '把 10 个方块一个一个叠起来。',
    '⭐ SHOW ME A STAR': '⭐ 告诉我星星在哪', '✔ OK': '✔ 好的', 'NEW STICKER!': '新贴纸！',
    // the brother's menu
    'A HOUSE': '一座房子', 'A TOWER': '一座塔', 'A BRIDGE': '一座桥', 'A TREE': '一棵树', 'SURPRISE ME': '给我惊喜',
    // pause and the end
    '▶ RESUME': '▶ 继续', '💾 SAVE': '💾 存档', '🏝️ MY WORLDS': '🏝️ 世界存档', '🏠 TITLE': '🏠 首页', 'Press ? to see all the keys': '按 ? 看所有按键',
    'ALL THE QUESTS DONE!': '所有任务都完成啦！', '🏝️ PLAY AGAIN': '🏝️ 再玩一次', '🧱 KEEP BUILDING': '🧱 继续建造',
    // toasts
    'BUILD ANYTHING YOU LIKE!': '想建造什么就建造什么！', 'That save was broken, so here\'s the island as new': '这个存档坏了，小岛重新开始', 'That world can\'t be found': '找不到这个世界',
    '📦 NOTHING TO FILL THERE': '📦 那里没有可以填的', '🐣 EASY: you can always fly!': '🐣 简单模式：你一直都能飞！', '✈️ FLYING!': '✈️ 飞行！', '🚶 WALKING': '🚶 走路',
    '🦋 MIRROR ON': '🦋 镜像 开', '🦋 MIRROR OFF': '🦋 镜像 关', '↩️ UNDO': '↩️ 撤销', 'NOTHING TO UNDO': '没有可以撤销的', '☀️ GOOD MORNING!': '☀️ 早上好！', '🌙 GOOD NIGHT!': '🌙 晚安！',
    'YOU FOUND ALL THE STARS!': '你找到了所有星星！', '⭐ LOOK FOR THE GOLDEN LIGHT!': '⭐ 找那道金色的光！', '⭐ ALL 5 GOLDEN STARS!': '⭐ 5 颗金星星全找到啦！',
    '💾 SAVED!': '💾 存档好了！', '💾 SAVED FOR NOW (this browser can\'t keep it)': '💾 暂时存好了（这个浏览器没法一直保存）', 'HIGH FIVE! 🙌': '击掌！🙌',
    // the ? panel
    'walk': '走路', 'look around': '看四周', 'break · place a block': '挖 · 放置方块', 'jump · fly up · fly down': '跳 · 向上飞 · 向下飞',
    'fly on or off (🔥 NORMAL)': '飞行 开或关（🔥 普通）', 'pick a block · all the blocks': '选方块 · 全部方块', 'undo · fill a box · mirror · ruler': '撤销 · 填满方框 · 镜像 · 尺子',
    'call your brother · pick what he builds': '叫兄弟来帮忙 · 选他建造什么', 'quests · show me a star': '任务 · 告诉我星星在哪', 'camera · day or night': '镜头 · 白天或晚上',
    'swap turns (2 players)': '换人（双人）', 'sound · pause': '声音 · 暂停',
    'the mouse': '鼠标', 'left click · right click': '点左键 · 点右键', 'Space · hold Space · Shift': 'Space · 按住 Space · Shift', 'double-tap Space': '连按两下 Space',
    'Click the world once and the mouse looks around (Esc lets go). In 🐣 EASY you always fly and a see-through block shows where yours will go. FILL: place on one corner, then the other. Find the 5 golden stars, build a house with a door and a tower 10 blocks high for stickers!':
      '点一下世界，就能用鼠标看四周（Esc 松开）。🐣 简单模式一直能飞，还有一个透明方块告诉你会放在哪里。填满：先在一个角放置，再点另一个角。找到 5 颗金星星、盖一座有门的房子、搭一座 10 格高的塔，就能得到贴纸！',
    'The stick on the left walks, drag anywhere to look, and the big buttons PLACE, BREAK and JUMP (double-tap JUMP to fly in 🔥 NORMAL). Your brother\'s face (top left) calls him. 🛠️ opens the tools on a phone.':
      '左边的摇杆走路，在任何地方拖动看四周，大按钮是放置、挖和跳（🔥 普通模式连按两下跳就能飞）。点左上角兄弟的脸叫他来帮忙。手机上点 🛠️ 打开工具。',
  });
  const PIECE = { 'A HOUSE': '一座房子', 'A TOWER': '一座塔', 'A BRIDGE': '一座桥', 'A TREE': '一棵树' };
  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', JUICE: '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  Kit.lang.rule(/^(\S+) (ICE CREAM|WATER|JUICE|COOKIE|WATERMELON|BANANA) FROM (\S+)!$/, (m, e, t, who) => `${e} ${who} 送来的${TREAT[t]}！`);
  Kit.lang.rule(/^(\S+) SAYS: I BUILT YOU (A HOUSE|A TOWER|A BRIDGE|A TREE)!$/, (m, who, p) => `${who} 说：我给你建造了${PIECE[p]}！`);
  Kit.lang.rule(/^WHAT SHALL (\S+) BUILD\?$/, '$1 要建造什么？');
  Kit.lang.rule(/^Call (\S+) \(T\)$/, '叫 $1 来帮忙 (T)');
  Kit.lang.rule(/^(\S+)'S QUESTS$/, '$1 的任务');
  Kit.lang.rule(/^(\S+)'S TURN TO BUILD$/, '轮到 $1 建造');
  Kit.lang.rule(/^(\S+)'S TURN!$/, '轮到 $1 啦！');
  Kit.lang.rule(/^WELCOME BACK, (\S+)!$/, '欢迎回来，$1！');
  Kit.lang.rule(/^🎉 (\S+) DID IT!$/, '🎉 $1 做到啦！');
  Kit.lang.rule(/^⭐ GOLDEN STAR! (\d+) \/ (\d+)$/, '⭐ 金星星！$1 / $2');
  Kit.lang.rule(/^📦 FILLED (\d+) BLOCKS!$/, '📦 填了 $1 个方块！');
  Kit.lang.rule(/^📦 EMPTIED (\d+) BLOCKS!$/, '📦 清空了 $1 个方块！');
  Kit.lang.rule(/^🏅 STICKERS: (\d+)$/, '🏅 贴纸：$1');
  Kit.lang.rule(/^📏 (\d+ × \d+ × \d+) BLOCKS$/, '📏 $1 个方块');
})();
