// Roomlet（方寸小屋）· 主题伴侣附带的脚本（用这套主题时载入，换走时清理）
// 1. 顶栏最前面多一个「房间」按钮：点了以后信笺收下去，整间宿舍浮在深色方格底上（放大 2 倍），房间里的东西就是菜单：
//    鼠标移到东西上冒一圈描边和小标签，点一下打开酒馆对应的面板（衣柜 = 角色列表，插线板 = 预设……见 SPOTS）。
// 2. 没打开任何聊天时（欢迎页）自动进房间。
// 3. 房间右下角露出一张信笺：上次聊到哪，点它回到聊天。
// 4. 小物件（小熊、暖水瓶、台灯、镜子、书包、球鞋、脸盆、垃圾桶、拖鞋）可以换样子（主题设置里选，或房间左边「换小物件」面板；
//    房间里点小熊也换下一只）：在浏览器里把房间图和图集 dorm-things.png 拼起来，新图载入、解码完才写到 html 的 --dm-room 上
//    （聊天时的背景也跟着变；先解码再换，不会闪一下）。
// 房间图用主题 CSS 里的 --dm-room（主题设置里换男生 / 女生宿舍时跟着变），坐标都按原图 730×712 的 1 倍像素写（tools/dorm/whitebox/room.py 程序画的白板房间 + 物件）。
// 热区：dorm-spots-<房>.png 每个像素记着它属于第几样东西（tools/dorm/spots.py 生成，顺序和 SPOTS 一样），
//    鼠标指哪个像素就是哪样东西，描边也照它画；多边形只留给键盘（Tab 选中）和热区图没载入时用。
// 5. 昼夜：主题伴侣的昼夜开关切到夜 = 熄灯，房间图换成 dorm-room-<房>-night.png（台灯、小彩灯亮着），图集换 dorm-things-night.png。
// 6. 房间画风（主题设置「房间画风」）：程序画（默认，上面说的这些）/ 草图（最早 PixelLab 一口气画的整间房，448×336，见 SKETCH）。
//    草图版用自己的房间图、热区图、外框表和小熊 / 暖水瓶图集；昼夜不换图（草图只有开灯的夜里这一张）。
// 没装扩展就没有这些（只有聊天时压暗的房间背景，白天那张）。

const W0 = 730, H0 = 712;
let W = W0, H = H0;   // 当前画风的房间图大小（草图版换成 SKETCH.W × SKETCH.H）
// [名字, 打开什么, 点了做什么（顶栏按钮的选择器，或 'back'）, 多边形]（外框，room.py 打印出来的）
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const SPOTS = [
    ['床帘', '回到聊天', 'back', rect(81, 57, 436, 340)],
    ['衣柜', '角色列表', '#rightNavDrawerIcon', rect(553, 230, 706, 547)],
    ['柜顶的纸箱', '扩展', '#extensions-settings-button .drawer-icon', rect(572, 180, 690, 270)],
    ['窗户', '背景', '#backgrounds-button .drawer-icon', rect(441, 85, 619, 334)],
    ['暖水瓶', '高级格式', '#advanced-formatting-button .drawer-icon', rect(288, 519, 312, 571)],
    ['照片', '世界书', '#WIDrawerIcon', rect(355, 266, 381, 324)],
    ['笔记本电脑', 'API 连接', '#sys-settings-button .drawer-icon', rect(210, 317, 276, 364)],
    ['台灯', '用户设置', '#user-settings-button .drawer-icon', rect(305, 283, 331, 334)],
    ['镜子', '用户人设', '#persona-management-button .drawer-icon', rect(203, 329, 230, 371)],
    ['插线板', '预设', '#leftNavDrawerIcon', rect(238, 423, 283, 448)],
    ['小熊', '换一只', 'bear', rect(339, 162, 367, 201)],
];
// 男生宿舍：桌上没有镜子，人设换成挂在梯子上的书包；高柜门上贴的是课程表
const BOY = {
    镜子: ['书包', '用户人设', '#persona-management-button .drawer-icon', rect(405, 272, 449, 329)],
    照片: ['课程表', '世界书', '#WIDrawerIcon', rect(349, 254, 382, 320)],
};

// 能换样子的东西：图集 dorm-things.png 一行 = 一样东西在一间房里，一格 = 一个样子（含背景）；每行的格子大小 size 各不相同，
// 行的左上角在 src，第 i 个样子在 src.x + i × size.w。第 0 格 = 默认样子（和房间图那一块一样）：换样子时只把和第 0 格不一样的像素盖上去，
// 几样东西外框叠在一起也不互相抹掉。dorm-things-spots.png 同样排列的热区。at = 在房间图里的左上角
// （room.py things 生成 art/things2.json 并打印这一段，照抄）。中文名在主题设置的选项里（键名一样）
const THINGS = {
    bear: {"spot": 11, "styles": ["0", "v3", "v5", "v7", "v8", "v15"], "rooms": {"girl": {"at": [338, 159], "src": [0, 0], "size": [30, 43]}}},
    thermos: {"spot": 5, "styles": ["0", "v2", "v7", "v10", "v11", "v15"], "rooms": {"girl": {"at": [287, 518], "src": [0, 43], "size": [26, 54]}, "boy": {"at": [287, 518], "src": [0, 97], "size": [26, 54]}}},
    lamp: {"spot": 8, "styles": ["0", "v2", "v4", "v6", "v10", "v11"], "rooms": {"girl": {"at": [296, 279], "src": [0, 151], "size": [37, 61]}, "boy": {"at": [296, 279], "src": [0, 212], "size": [37, 61]}}},
    mirror: {"spot": 9, "styles": ["0", "v1", "v3", "v7", "v9", "v15"], "rooms": {"girl": {"at": [202, 327], "src": [0, 273], "size": [33, 50]}}},
    bag: {"spot": 9, "styles": ["0", "v0", "v5", "v6", "v12", "v13"], "rooms": {"boy": {"at": [403, 271], "src": [0, 323], "size": [48, 59]}}},
    sneakers: {"spot": 0, "styles": ["0", "v1", "v4", "v7", "v14"], "rooms": {"boy": {"at": [223, 532], "src": [0, 382], "size": [49, 51]}}},
    basin: {"spot": 0, "styles": ["0", "v3", "v6", "v8", "v9"], "rooms": {"girl": {"at": [501, 416], "src": [0, 433], "size": [55, 52]}, "boy": {"at": [501, 416], "src": [0, 485], "size": [55, 52]}}},
    trash: {"spot": 0, "styles": ["0", "v0", "v2", "v3", "v7", "v12"], "rooms": {"girl": {"at": [207, 511], "src": [0, 537], "size": [42, 58]}, "boy": {"at": [435, 402], "src": [0, 595], "size": [42, 58]}}},
    slippers: {"spot": 0, "styles": ["0", "v0", "v6", "v16", "v20", "v33"], "rooms": {"girl": {"at": [439, 431], "src": [0, 653], "size": [34, 26]}}},
    ball: {"spot": 0, "styles": ["0", "v2", "v9", "v10", "v17"], "rooms": {"boy": {"at": [383, 504], "src": [0, 679], "size": [48, 48]}}},
    chair: {"spot": 0, "styles": ["0", "v12", "v8", "v5", "v13", "v14"], "rooms": {"girl": {"at": [266, 357], "src": [0, 727], "size": [107, 159]}, "boy": {"at": [266, 354], "src": [0, 886], "size": [116, 162]}}},
};
const OUTLINE = [255, 244, 200];

// 草图版（「房间画风」选草图）：archive/v0.2 的房间（art/room-<房>.png、spots-<房>.png，扩展里叫 dorm-sketch-*.png），448×336，房间视图放大 2 倍。
// 外框和热区号顺序都和上面 SPOTS 一样（热区图 spots-*.png 的值 1~11 对应 SPOTS 第 1~11 样），点了做的事也一样，只是名字照草图里画的东西。
// things：旧图集 dorm-sketch-things.png 每格 64×64；第 0 行是抹掉了原物件的底（rooms 里写第几格），row 行是各样子（cells 顺序），at = 格子在房间图里的左上角。
// alias：选项里的「0」在草图里换成哪一格（默认小熊的名字是「系着蓝领巾」，草图原来那只不是，换成图集里系蓝领巾的 v10）。
const SKETCH = {
    W: 448, H: 336, k: 2, deskX: 50, roomW: '448px', roomK: '1.5',   // roomW / roomK 和主题设置里草图那一项的 CSS 一样（聊天背景：电脑 2×1.5 = 3 倍，手机 2 倍）
    spots: [
        ['床帘', '回到聊天', 'back', [[68, 62], [193, 10], [240, 32], [245, 107], [157, 133], [72, 112]]],
        ['衣柜', '角色列表', '#rightNavDrawerIcon', [[309, 118], [330, 108], [388, 123], [391, 128], [391, 241], [363, 255], [309, 226]]],
        ['柜顶的纸箱', '扩展', '#extensions-settings-button .drawer-icon', [[315, 99], [328, 91], [341, 91], [366, 101], [388, 113], [386, 128], [360, 137], [318, 122]]],
        ['窗户', '背景', '#backgrounds-button .drawer-icon', [[262, 45], [318, 73], [318, 160], [262, 132]]],
        ['暖水瓶', '高级格式', '#advanced-formatting-button .drawer-icon', rect(284, 240, 309, 282)],
        ['照片和便签', '世界书', '#WIDrawerIcon', rect(174, 128, 210, 168)],
        ['电脑', 'API 连接', '#sys-settings-button .drawer-icon', rect(147, 154, 181, 184)],
        ['台灯', '用户设置', '#user-settings-button .drawer-icon', rect(90, 160, 110, 212)],
        ['镜子', '用户人设', '#persona-management-button .drawer-icon', rect(123, 160, 139, 190)],
        ['插线板', '预设', '#leftNavDrawerIcon', [[150, 222], [162, 215], [178, 222], [178, 229], [166, 235], [150, 228]]],
        ['小熊', '换一只', 'bear', rect(165, 60, 198, 100)],
    ],
    boy: {   // 男生草图：没有镜子，人设是挂在梯子上的书包；墙上是海报；没有小熊
        镜子: ['书包', '用户人设', '#persona-management-button .drawer-icon', rect(234, 170, 266, 210)],
        照片和便签: ['海报', '世界书', '#WIDrawerIcon', rect(176, 128, 198, 168)],
    },
    things: {
        bear: { spot: 11, at: [149, 48], rooms: { girl: 0 }, row: 1, cells: ['v3', 'v5', 'v7', 'v8', 'v10', 'v15'], alias: { 0: 'v10' } },
        thermos: { spot: 5, at: [265, 228], rooms: { girl: 1, boy: 2 }, row: 2, cells: ['v2', 'v7', 'v10', 'v11', 'v15'] },
    },
};
const sketchCell = (t, v) => t.alias?.[v] ?? v;   // 选项值 → 草图图集里的样子（'0' = 房间图里原来那只）

const CSS = `
html.dm-room #sheld { transform: translateY(calc(100% + 60px)); }
#sheld { transition: transform .45s cubic-bezier(.3,.7,.3,1); }
html.dm-room body::before, html.dm-room body::after { display: none; }
#dm-room { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; z-index: 2900; background: var(--dm-tiles), var(--dm-void); display: none; overflow: hidden; }
html.dm-room #dm-room { display: block; animation: dm-in .35s ease both; }
html.dm-clear #dm-room { background: none; }
@keyframes dm-in { from { opacity: 0; } to { opacity: 1; } }
#dm-room .dm-scroll { position: absolute; inset: 0; overflow: auto hidden; scrollbar-width: none; display: grid; place-items: center; }
#dm-room .dm-scroll::-webkit-scrollbar { display: none; }
#dm-room .dm-box { position: relative; width: calc(var(--dm-w) * var(--dm-k)); height: calc(var(--dm-h) * var(--dm-k)); background: var(--dm-room) 0 0 / 100% 100% no-repeat; image-rendering: pixelated; flex: none; margin-top: 24px; }
html.dm-room #dm-room .dm-box { animation: dm-zoom .45s cubic-bezier(.3,.7,.3,1) both; }
@keyframes dm-zoom { from { transform: scale(1.5); } to { transform: none; } }
#dm-room svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
#dm-room polygon { fill: transparent; stroke: transparent; stroke-width: 2; stroke-linejoin: miter; shape-rendering: crispEdges; cursor: pointer; pointer-events: all; }
#dm-room:not(.dm-map) polygon:is(:hover, :focus-visible, .on) { stroke: #fff4c8; }
#dm-room polygon:focus-visible { outline: none; }
#dm-room.dm-map polygon { pointer-events: none; }
#dm-room.dm-map .dm-box { cursor: default; }
#dm-room.dm-map .dm-box.dm-over { cursor: pointer; }
#dm-room .dm-line { position: absolute; image-rendering: pixelated; pointer-events: none; display: none; }
#dm-room .dm-line.on { display: block; }
#dm-room.dm-no-outline polygon { stroke: transparent !important; }
#dm-room.dm-no-outline .dm-line { display: none !important; }
#dm-room .dm-tag { position: absolute; z-index: 2; transform: translate(-50%, calc(-100% - 12px)); background: var(--dm-paper); color: var(--dm-ink); border: 2px solid var(--dm-line); padding: 2px 12px 3px; font-size: 16px; white-space: nowrap; pointer-events: none; box-shadow: 3px 3px 0 rgb(0 0 0 / .25); }
#dm-room .dm-tag small { color: var(--dm-ink2); margin-left: 6px; font-size: 13px; }
#dm-room .dm-tag[hidden] { display: none; }
#dm-room .dm-cap { position: absolute; left: 6%; bottom: -34px; color: var(--dm-hud); font-size: 17px; letter-spacing: .08em; white-space: nowrap; }
#dm-room .dm-peek { position: absolute; left: 56px; bottom: 56px; width: 260px; z-index: 3; cursor: pointer; text-align: left; font: inherit; color: var(--dm-ink);
  background: repeating-linear-gradient(transparent 0 27px, var(--dm-rule) 27px 28px) 0 6px, var(--dm-paper);
  border: 2px solid var(--dm-line); border-top: 10px solid var(--dm-glue-color); padding: 8px 16px 12px; transform: rotate(-4deg); box-shadow: 5px 5px 0 rgb(0 0 0 / .3); transition: transform .2s; }
#dm-room .dm-peek:hover, #dm-room .dm-peek:focus-visible { transform: rotate(-2deg) translateY(-4px); outline: none; }
#dm-room .dm-peek b { display: block; color: var(--dm-red); font-size: 14px; letter-spacing: .3em; text-align: center; line-height: 28px; }
#dm-room .dm-peek span { display: block; line-height: 28px; font-size: 15px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
#dm-room .dm-peek small { color: var(--dm-ink2); font-size: 13px; }
#dm-room .dm-peek[hidden] { display: none; }
#dm-room-btn .drawer-icon.openIcon { color: var(--dm-hud-hi); filter: drop-shadow(0 3px 0 var(--dm-red)); }
#dm-room { --dm-k: 1; --dm-w: ${W0}px; --dm-h: ${H0}px; }   /* 草图版 dorm.js 在元素上改成 448 × 336、2 倍 */
@media screen and (max-width: 1000px) {
  #dm-room .dm-scroll { display: block; padding-top: 70px; place-items: normal; }   /* 别让 place-items: center 在块布局里也居中（新版 Chrome 会）：房间比屏幕宽时左边会滑不到 */
  #dm-room .dm-box { margin: 0; }
  #dm-room .dm-peek { left: auto; right: -20px; bottom: 18px; width: 230px; }
  #dm-room .dm-cap { bottom: -30px; left: 20px; font-size: 15px; }
  #dm-room .dm-hint { position: absolute; top: 58px; left: 0; right: 0; text-align: center; color: var(--dm-hud); font-size: 14px; pointer-events: none; }
}
@media screen and (min-width: 1001px) { #dm-room .dm-hint { display: none; } }
@media (prefers-reduced-motion: reduce) { #sheld, html.dm-room #dm-room, html.dm-room #dm-room .dm-box { transition: none; animation: none; } }

/* ---- 收起酒馆顶栏：左上角一本小本子，点开是目录（装了主题伴侣、设置里选「收起」才有）---- */
html.dm-nobar { --topBarBlockSize: 0px; }
html.dm-nobar #top-bar { display: none !important; }
html.dm-nobar #top-settings-holder { height: 0; pointer-events: none; }
html.dm-nobar #top-settings-holder > .drawer > :is(.drawer-toggle, .drawer-icon) { display: none !important; }
html.dm-nobar #top-settings-holder .drawer-content { pointer-events: auto; }
html.dm-nobar :is(.drawer-content, #left-nav-panel, #right-nav-panel) { padding-top: 58px !important; }
#dm-menu-btn { display: none; position: fixed; z-index: 3100; top: 8px; left: 8px; width: 46px; height: 46px; padding: 0; place-items: center; cursor: pointer; color: var(--dm-ink);
  background: var(--dm-paper); border: 2px solid var(--dm-line); border-top: 8px solid var(--dm-glue-color); box-shadow: 3px 3px 0 rgb(0 0 0 / .3); font: inherit; }
html.dm-nobar #dm-menu-btn { display: grid; }
#dm-menu-btn::before { content: ""; width: 32px; height: 32px; margin-top: -4px; background: currentColor; -webkit-mask: var(--ico-menu) center / 32px 32px no-repeat; mask: var(--ico-menu) center / 32px 32px no-repeat; }
#dm-menu-btn.on::before { -webkit-mask-image: var(--ico-cross); mask-image: var(--ico-cross); color: var(--dm-red); }
#dm-menu-btn:hover, #dm-menu-btn:focus-visible { background: var(--dm-paper-low); outline: none; }
#dm-menu-btn:focus-visible { box-shadow: 0 0 0 3px var(--dm-red); }
#dm-menu { position: fixed; z-index: 3100; left: 10px; top: 62px; width: min(320px, calc(100vw - 20px)); max-height: calc(100dvh - 76px); overflow-y: auto; box-sizing: border-box;
  padding: 6px 18px 18px 40px; color: var(--dm-ink); font-family: var(--dm-font);
  background: radial-gradient(circle at 7px 14px, var(--dm-void) 0 4px, var(--dm-line) 4.5px 6.5px, transparent 7px) 9px 0 / 14px 30px repeat-y local, var(--dm-paper);
  border: 2px solid var(--dm-line); border-top: 22px solid var(--dm-glue-color);
  box-shadow: 0 4px 0 var(--dm-paper-edge), 0 6px 0 var(--dm-line), 8px 12px 0 rgb(0 0 0 / .3); transform-origin: 20px 0; }
#dm-menu[hidden] { display: none; }
#dm-menu:not([hidden]) { animation: dm-drop .2s steps(5) both; }
@keyframes dm-drop { from { opacity: 0; transform: translateY(-10px) scaleY(.92); } to { opacity: 1; transform: none; } }
#dm-menu h4 { margin: 4px 0 2px; text-align: center; color: var(--dm-red); font-size: 13px; letter-spacing: .5em; text-indent: .5em; line-height: 22px; font-weight: 400; }
#dm-menu .dm-mi { display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box; margin: 0; padding: 5px 6px 3px; cursor: pointer; text-align: left;
  background: transparent; color: var(--dm-ink); font: inherit; font-size: 18px; line-height: 30px; border: 0; border-bottom: 2px solid color-mix(in srgb, var(--dm-line), transparent 55%); }
#dm-menu .dm-mi:hover, #dm-menu .dm-mi:focus-visible { outline: none; background: color-mix(in srgb, var(--dm-note), var(--dm-paper) 30%); border-bottom-color: var(--dm-red); }
#dm-menu .dm-mi .drawer-icon { flex: none; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; font-size: 22px; color: var(--dm-ink2); opacity: 1; }
#dm-menu .dm-mi .drawer-icon::before { width: 28px !important; height: 28px !important; -webkit-mask-size: 28px 28px !important; mask-size: 28px 28px !important; }
#dm-menu .dm-mi:hover .drawer-icon, #dm-menu .dm-mi:focus-visible .drawer-icon { color: var(--dm-red); }
#dm-menu .dm-mi.here .dm-mi-t::after { content: "·在这里"; color: var(--dm-red); font-size: 13px; margin-left: 6px; }
@media screen and (max-width: 1000px) {
  #dm-menu-btn { top: 6px; left: 6px; width: 42px; height: 42px; }
  #dm-menu { top: 54px; left: 6px; width: min(310px, calc(100vw - 12px)); }
  #dm-menu .dm-mi { font-size: 17px; }
}

/* ---- 房间里的「拍照模式」：左边竖排标签，点开一块调色板（换底色、换小物件）---- */
#dm-room .dm-pal { --w: 252px; position: absolute; z-index: 5; left: 0; top: 50%; display: flex; align-items: flex-start; transform: translate(calc(-1 * var(--w)), -50%); transition: transform .25s cubic-bezier(.3,.7,.3,1); }
#dm-room .dm-pal.open { transform: translate(0, -50%); }
#dm-room .dm-pal[hidden] { display: none; }
#dm-room .dm-pal-panel { width: var(--w); box-sizing: border-box; max-height: calc(100dvh - 130px); overflow-y: auto; color: var(--dm-ink); font-family: var(--dm-font);
  background: var(--dm-paper); border: 2px solid var(--dm-line); border-left: 0; border-top: 18px solid var(--dm-glue-color); box-shadow: 6px 8px 0 rgb(0 0 0 / .3); padding: 8px 14px 12px; }
#dm-room .dm-pal-panel h5 { margin: 6px 0 6px; font-size: 14px; font-weight: 400; color: var(--dm-ink2); letter-spacing: .2em; }
#dm-room .dm-pal-grid { display: grid; grid-template-columns: repeat(3, 68px); gap: 8px; margin-bottom: 8px; }
#dm-room .dm-sw { position: relative; box-sizing: border-box; width: 68px; height: 68px; padding: 0; cursor: pointer; border: 2px solid var(--dm-line); background-color: var(--dm-paper-low); image-rendering: pixelated; box-shadow: 2px 2px 0 rgb(0 0 0 / .2); }
#dm-room .dm-sw.thing { height: 96px; }
#dm-room .dm-sw.thing { display: grid; place-items: center; overflow: hidden; }
#dm-room .dm-sw-img { display: block; image-rendering: pixelated; pointer-events: none; }
#dm-room .dm-sw.ground { background-image: conic-gradient(var(--a) 25%, var(--b) 0 50%, var(--a) 0 75%, var(--b) 0); background-size: 24px 24px; }
#dm-room .dm-sw.ground::after { content: ""; position: absolute; inset: 14px; background: color-mix(in srgb, var(--a), #e6e4ff 62%); -webkit-mask: var(--ico-room) center / contain no-repeat; mask: var(--ico-room) center / contain no-repeat; image-rendering: pixelated; }
#dm-room .dm-sw.ground.clear { background-image: conic-gradient(color-mix(in srgb, var(--dm-paper), var(--dm-ink) 16%) 25%, var(--dm-paper) 0 50%, color-mix(in srgb, var(--dm-paper), var(--dm-ink) 16%) 0 75%, var(--dm-paper) 0); background-size: 16px 16px; }
#dm-room .dm-sw.ground.clear::after { background: var(--dm-ink2); }
#dm-room .dm-sw:hover { transform: translateY(-2px); }
#dm-room .dm-sw:focus-visible { outline: 3px solid var(--dm-ink); outline-offset: 1px; }
#dm-room .dm-sw.sel { outline: 3px solid var(--dm-red); outline-offset: 1px; }
#dm-room .dm-sw.sel::before { content: ""; position: absolute; right: -2px; top: -2px; width: 14px; height: 14px; background: var(--dm-red); z-index: 1; }
#dm-room .dm-pal-name { margin-top: 2px; padding-top: 6px; border-top: 2px solid var(--dm-rule); font-size: 15px; line-height: 22px; min-height: 22px; }
#dm-room .dm-pal-tabs { display: flex; flex-direction: column; gap: 6px; align-self: center; transform: translateY(12dvh); }
#dm-room .dm-tab { width: 46px; height: 50px; padding: 0; display: grid; place-items: center; cursor: pointer; color: var(--dm-ink); background: var(--dm-paper-low); border: 2px solid var(--dm-line); border-left: 0; box-shadow: 3px 3px 0 rgb(0 0 0 / .25); }
#dm-room .dm-tab::before { content: ""; width: 28px; height: 28px; background: currentColor; -webkit-mask: var(--i) center / 28px 28px no-repeat; mask: var(--i) center / 28px 28px no-repeat; }
#dm-room .dm-tab[data-tab="ground"] { --i: var(--ico-tiles); }
#dm-room .dm-tab[data-tab="things"] { --i: var(--ico-bear); }
#dm-room .dm-tab:hover, #dm-room .dm-tab:focus-visible { outline: none; background: var(--dm-paper); }
#dm-room .dm-tab.on { background: var(--dm-note); width: 52px; }

@media (prefers-reduced-motion: reduce) { #dm-room .dm-pal, #dm-menu { transition: none; animation: none !important; } }
`;

export default function dorm(api = {}) {
    const root = document.documentElement;
    const ctx = () => window.SillyTavern?.getContext?.();
    const style = document.createElement('style');
    style.id = 'dm-room-style';
    style.textContent = CSS;
    document.head.append(style);

    // ---- 房间
    const room = document.createElement('div');
    room.id = 'dm-room';
    const svgNS = 'http://www.w3.org/2000/svg';
    room.innerHTML = `<div class="dm-scroll"><div class="dm-box"><svg viewBox="0 0 ${W} ${H}" aria-label="宿舍"></svg><div class="dm-tag" hidden><span></span><small></small></div><div class="dm-cap"></div></div></div>
<div class="dm-hint">← 左右滑动看看 · 点房间里的东西 →</div>
<button class="dm-peek" type="button" hidden><b></b><small></small><span></span></button>
<div class="dm-pal"><div class="dm-pal-panel"><div class="dm-pal-body"></div><div class="dm-pal-name"></div></div><div class="dm-pal-tabs"><button class="dm-tab" type="button" data-tab="ground" title="房间底色" aria-label="房间底色"></button><button class="dm-tab" type="button" data-tab="things" title="换小物件" aria-label="换小物件"></button></div></div>`;
    document.body.append(room);
    const svg = room.querySelector('svg'), tag = room.querySelector('.dm-tag'), box = room.querySelector('.dm-box');
    const peek = room.querySelector('.dm-peek'), cap = room.querySelector('.dm-cap'), scroller = room.querySelector('.dm-scroll');

    // 标签：放在东西的正上方（bb 是 1 倍像素的 [左, 上, 右]）
    const showTag = (bb, name, what) => {
        tag.firstChild.textContent = name; tag.lastChild.textContent = what;   // 改文字不增删节点（长聊天里每次增删节点都要重算样式）
        tag.style.left = `${((bb[0] + bb[2]) / 2 / W) * 100}%`;
        tag.style.top = `${(bb[1] / H) * 100}%`;
        tag.hidden = false;
        // 别出屏幕：靠边的东西，标签往里挪
        tag.style.marginLeft = '0px';
        const r = tag.getBoundingClientRect();
        if (r.right > innerWidth - 8) tag.style.marginLeft = `${innerWidth - 8 - r.right}px`;
        else if (r.left < 8) tag.style.marginLeft = `${8 - r.left}px`;
    };

    // ---- 热区图、能换样子的东西
    const base = new URL('.', import.meta.url).href;
    const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const pixels = img => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, c.width, c.height);
    };
    const assets = {};
    const asset = name => (assets[name] ||= loadImg(`${base}dorm-${name}.png`));
    const roomVarEls = () => [document.getElementById('bg1'), room];
    let map = null, lines = [], bboxes = [], roomURL = null, shown = null, state = '', builtFor = null;
    const pixCache = new WeakMap(), pixelsOf = img => pixCache.get(img) || (pixCache.set(img, pixels(img)), pixCache.get(img));
    let spots = [];   // 下标 = 热区号：{ el, name, what, act, poly }

    function drawLines() {
        lines.forEach(l => l?.remove()); lines = []; bboxes = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const id = map[y * W + x]; if (!id) continue;
            const b = bboxes[id] ||= [x, y, x, y];
            if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
        }
        bboxes.forEach((b, id) => {
            if (!b) return;
            const ox = b[0] - 1, oy = b[1] - 1, cw = b[2] - b[0] + 3, ch = b[3] - b[1] + 3;
            const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.className = 'dm-line';
            const g = c.getContext('2d'), d = g.createImageData(cw, ch);
            const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && map[y * W + x] === id;
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
                const X = ox + x, Y = oy + y;
                if (at(X, Y) || !(at(X + 1, Y) || at(X - 1, Y) || at(X, Y + 1) || at(X, Y - 1))) continue;
                d.data.set([...OUTLINE, 255], (y * cw + x) * 4);
            }
            g.putImageData(d, 0, 0);
            Object.assign(c.style, { left: `${ox / W * 100}%`, top: `${oy / H * 100}%`, width: `${cw / W * 100}%`, height: `${ch / H * 100}%` });
            box.append(c); lines[id] = c;
        });
    }

    // ---- 调色板（房间里的拍照模式）：左边两个标签，点开一块板，色块 / 小图一点就换，写回主题设置
    const pal = room.querySelector('.dm-pal'), palBody = pal.querySelector('.dm-pal-body'), palName = pal.querySelector('.dm-pal-name');
    let palTab = 'ground', palSel = [], palLast = '';   // palLast = 最近点的是哪一样（底下那行字只说它）
    const choicesOf = key => (api.option?.(key)?.choices || []).map(c => Array.isArray(c) ? { value: c[0], label: c[1] } : c);
    const optVal = key => String(api.get?.(key) ?? api.option?.(key)?.default ?? '');
    const grid = () => { const g = document.createElement('div'); g.className = 'dm-pal-grid'; return g; };
    function swatch(key, c, cls) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `dm-sw ${cls}`; b.title = c.label; b.setAttribute('aria-label', c.label);
        b.addEventListener('click', () => { palLast = key; api.set?.(key, c.value); applyGround(); refresh(); syncPal(); });
        palSel.push({ b, key, value: String(c.value), label: c.label });
        return b;
    }
    async function buildPal() {
        palSel = []; palBody.replaceChildren();
        if (palTab === 'ground') {
            const g = grid();
            for (const c of choicesOf('ground')) {
                const m = /--dm-void:\s*([^;]+);\s*--dm-void2:\s*([^;]+);/.exec(c.css || '');
                const b = swatch('ground', c, 'ground');
                // 没写颜色的那个是默认：跟着「聊天背景色」走
                b.style.setProperty('--a', m ? m[1].trim() : 'var(--SmartThemeChatTintColor)');
                b.style.setProperty('--b', m ? m[2].trim() : 'color-mix(in srgb, var(--SmartThemeChatTintColor), white 5%)');
                if (c.value === 'clear') b.classList.add('clear');   // 透明：棋盘格（没有底色可画）
                g.append(b);
            }
            palBody.append(g);
        } else {
            const which = optVal('room') === 'boy' ? 'boy' : 'girl', sk = optVal('style') === 'sketch';
            const n = !sk && root.classList.contains('dn-night') ? '-night' : '';   // 草图只有一张，不分昼夜
            const atlas = sk ? 'sketch-things' : `things${n}`;
            let img = null;
            try { img = await asset(atlas); } catch { /* 图集没载入：只剩文字名 */ }
            if (palTab !== 'things') return;
            for (const [k, t] of Object.entries(sk ? SKETCH.things : THINGS)) {
                const r = t.rooms[which]; if (r === undefined || !api.option?.(k)) continue;
                const h = document.createElement('h5'); h.textContent = api.option?.(k)?.label || k; h.dataset.k = k;
                const g = grid();
                const byV = Object.fromEntries(choicesOf(k).map(c => [String(c.value), c]));
                // 每个样子在哪张图的哪一格：[值, 图名, 图宽, 图高, 格左, 格上]
                let cw, ch, K, cells;
                if (sk) {   // 草图：64 格，东西在格子中间约 32×46，放大 2 倍只露中间那块；「0」= 房间图里原来那只
                    cw = ch = 64; K = 2;
                    cells = choicesOf(k).map(c => String(c.value)).filter(v => v === '0' || t.cells.includes(sketchCell(t, v))).map(v => {
                        const c = sketchCell(t, v);
                        return c === '0' ? [v, `sketch-room-${which}`, SKETCH.W, SKETCH.H, t.at[0], t.at[1]]
                            : [v, atlas, img?.width, img?.height, t.cells.indexOf(c) * 64, t.row * 64];
                    });
                } else {
                    [cw, ch] = r.size; K = cw * 2 <= 72 && ch * 2 <= 100 ? 2 : 1;   // 小东西放大 2 倍，大的 1 倍（只用整数倍）
                    cells = t.styles.map((v, col) => [v, atlas, img?.width, img?.height, r.src[0] + col * cw, r.src[1]]);
                }
                const sw = Math.min(cw * K, 64), sh = Math.min(ch * K, 92);                 // 只露这一格（裁掉旁边的格子），居中
                for (const [v, name, iw, ih, x, y] of cells) {
                    const b = swatch(k, byV[v] || { value: v, label: v }, 'thing');
                    if (img) {
                        const s = document.createElement('span'); s.className = 'dm-sw-img';
                        Object.assign(s.style, { width: `${sw}px`, height: `${sh}px`, backgroundImage: `url("${base}dorm-${name}.png")`,
                            backgroundSize: `${iw * K}px ${ih * K}px`, backgroundRepeat: 'no-repeat',
                            backgroundPosition: `${-x * K - Math.floor((cw * K - sw) / 2)}px ${-y * K - Math.floor((ch * K - sh) / 2)}px` });
                        b.append(s);
                    }
                    g.append(b);
                }
                palBody.append(h, g);
            }
        }
        syncPal();
    }
    function syncPal() {
        let name = '';
        for (const s of palSel) {
            const on = optVal(s.key) === s.value;
            s.b.classList.toggle('sel', on);
            if (on && (palTab === 'ground' || !name || s.key === palLast)) name = palTab === 'things' ? `${api.option?.(s.key)?.label || ''}：${s.label}` : s.label;
        }
        palName.textContent = name;
        pal.querySelectorAll('.dm-tab').forEach(t => t.classList.toggle('on', pal.classList.contains('open') && t.dataset.tab === palTab));
    }
    pal.querySelectorAll('.dm-tab').forEach(t => t.addEventListener('click', () => {
        const same = pal.classList.contains('open') && palTab === t.dataset.tab;
        palTab = t.dataset.tab;
        if (same) pal.classList.remove('open');
        else { pal.classList.add('open'); buildPal(); }
        syncPal();
    }));
    pal.hidden = !(api.option?.('ground') || Object.keys(THINGS).some(k => api.option?.(k)));   // 主题设置里没有这些选项就整块藏起来

    // 画风的大小：房间视图的格子（--dm-w/--dm-h/--dm-k）、svg 坐标、外框。和新房间图在同一刻换上，不会有一帧旧图套新尺寸
    let geomSk = false;
    const aimDesk = () => { if (scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = box.offsetWidth * ((geomSk ? SKETCH.deskX : 40) / W); };   // 手机：房间比屏幕宽，对准书桌（1 倍像素的横坐标）
    function setGeom(sk, which) {
        geomSk = sk;
        W = sk ? SKETCH.W : W0; H = sk ? SKETCH.H : H0;
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        for (const [p, v] of [['--dm-w', `${W}px`], ['--dm-h', `${H}px`], ['--dm-k', SKETCH.k]]) sk ? room.style.setProperty(p, v) : room.style.removeProperty(p);
        buildSpots(which, sk);
        if (root.classList.contains('dm-room')) aimDesk();   // 在房间里换了画风：重新对准书桌
    }

    async function refresh() {
        const which = api.get?.('room') === 'boy' ? 'boy' : 'girl';
        const sk = api.get?.('style') === 'sketch';
        const TH = sk ? SKETCH.things : THINGS;
        const pick = Object.fromEntries(Object.keys(TH).map(k => [k, String(api.get?.(k) ?? '0')]));
        // 伴侣的昼夜开关：夜 = 熄灯，换夜里那套图。草图只有一张（本来就是开着台灯的夜里），不分昼夜
        const n = !sk && root.classList.contains('dn-night') ? '-night' : '';
        const key = (sk ? 'sketch/' : '') + which + n + JSON.stringify(pick);
        if (key === state) return;
        state = key;
        if (sk === geomSk) buildSpots(which, sk);   // 换了画风的话等新图到了再一起换
        if (pal.classList.contains('open') && palTab === 'things') buildPal();
        const W1 = sk ? SKETCH.W : W0, H1 = sk ? SKETCH.H : H0;
        try {
            let url, m;
            if (sk) [url, m] = await sketchRoom(which, pick, key);
            else {
            const [spotsImg, thingsImg, thingsSpotsImg] = await Promise.all([asset(`spots-${which}`), asset(`things${n}`), asset('things-spots')]);
            if (state !== key) return;
            const W = W1, H = H1;
            const sp = pixelsOf(spotsImg).data;
            m = new Uint8Array(W * H);
            for (let i = 0; i < W * H; i++) m[i] = sp[i * 4];
            const active = Object.entries(THINGS).filter(([k, t]) => pick[k] !== '0' && t.rooms[which] !== undefined && t.styles.includes(pick[k]));
            if (active.length) {
                const roomImg = await asset(`room-${which}${n}`);
                const c = document.createElement('canvas'); c.width = W; c.height = H;
                const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(roomImg, 0, 0);
                const rp = g.getImageData(0, 0, W, H), tc = pixelsOf(thingsImg), tp = pixelsOf(thingsSpotsImg).data, d = tc.data, tw = tc.width;
                for (const [k, t] of active) {
                    const { at: [ox, oy], src: [sx, sy], size: [w, h] } = t.rooms[which], col = t.styles.indexOf(pick[k]);
                    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                        const a = ((sy + y) * tw + sx + x) * 4, b = a + col * w * 4, i = (oy + y) * W + ox + x;   // a = 默认那格，b = 选中的样子
                        if (d[a] !== d[b] || d[a + 1] !== d[b + 1] || d[a + 2] !== d[b + 2] || d[a + 3] !== d[b + 3]) rp.data.set(d.subarray(b, b + 4), i * 4);
                        if (tp[a] !== tp[b]) m[i] = tp[b];   // 热区也只换变了的地方
                    }
                }
                g.putImageData(rp, 0, 0);
                const blob = await new Promise(ok => c.toBlob(ok));
                if (state !== key) return;
                url = URL.createObjectURL(blob);
            } else url = `${base}dorm-room-${which}${n}.png`;   // 扩展里的原图（主题 CSS 里嵌的是压成 256 色的小图）
            }
            if (!url) return;   // 半路又换了设置
            // 不闪：新图先载入、解码完再换到 --dm-room 上（直接换成还没载入的图，房间会空一帧）；旧的 blob 过几秒再收回
            const im = new Image(); im.src = url;
            try { await im.decode(); } catch { /* 解码失败也照样换上，至少不卡住 */ }
            if (state !== key) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return; }
            const old = roomURL;
            roomURL = url.startsWith('blob:') ? url : null; shown = im;   // 留着解码好的图，别被回收
            light(0);
            if (sk !== geomSk || W !== W1) setGeom(sk, which);
            // 写在用到它的两个元素上（聊天背景 #bg1 和房间 #dm-room），不写在 html 上：改 html 上的自定义属性会让整页（长聊天几千个元素）样式重算一遍
            // 图的原大（--dm-room-w / -k）一起写：主题设置的 CSS 先一步换了画风时，这里还是旧图配旧尺寸，到这一刻新图新尺寸一起换
            for (const el of roomVarEls()) {
                el?.style.setProperty('--dm-room', `url("${url}")`);
                el?.style.setProperty('--dm-room-w', sk ? SKETCH.roomW : `${W0}px`);
                el?.style.setProperty('--dm-room-k', sk ? SKETCH.roomK : '1');
            }
            if (old) setTimeout(() => URL.revokeObjectURL(old), 3000);
            map = m; drawLines(); room.classList.add('dm-map');
        } catch (e) {
            console.warn('[Roomlet] 热区图没载入，改用多边形', e);
            if (state === key && sk !== geomSk) setGeom(sk, which);
            map = null; lines.forEach(l => l?.remove()); lines = []; room.classList.remove('dm-map');
        }
    }

    // 草图版的房间：房间图 + 旧图集里换了样子的小熊 / 暖水瓶（先铺那格抹掉原物件的底，再盖新样子，热区跟着新样子的轮廓）
    async function sketchRoom(which, pick, key) {
        const [spotsImg, thingsImg] = await Promise.all([asset(`sketch-spots-${which}`), asset('sketch-things')]);
        if (state !== key) return [];
        const { W, H } = SKETCH;
        const sp = pixelsOf(spotsImg).data, m = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) m[i] = sp[i * 4];
        const active = Object.entries(SKETCH.things).filter(([k, t]) => t.rooms[which] !== undefined && t.cells.includes(sketchCell(t, pick[k])));
        if (!active.length) return [`${base}dorm-sketch-room-${which}.png`, m];
        const roomImg = await asset(`sketch-room-${which}`);
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d'); g.drawImage(roomImg, 0, 0);
        const tp = pixelsOf(thingsImg), tw = tp.width;
        for (const [k, t] of active) {
            const [ox, oy] = t.at, col = t.cells.indexOf(sketchCell(t, pick[k]));
            g.drawImage(thingsImg, t.rooms[which] * 64, 0, 64, 64, ox, oy, 64, 64);   // 抹掉原来那只
            g.drawImage(thingsImg, col * 64, t.row * 64, 64, 64, ox, oy, 64, 64);     // 新的样子
            for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
                const i = (oy + y) * W + ox + x;
                if (m[i] === t.spot) m[i] = 0;
                if (tp.data[((t.row * 64 + y) * tw + col * 64 + x) * 4 + 3] > 127) m[i] = t.spot;
            }
        }
        const blob = await new Promise(ok => c.toBlob(ok));
        if (state !== key) return [];
        return [URL.createObjectURL(blob), m];
    }

    let cur = 0;
    const bbOf = id => bboxes[id] || (p => [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0]))])(spots[id].poly);
    function light(id) {   // 亮出第 id 样东西（描边 + 标签）；0 = 都不亮
        if (id === cur) return;
        lines[cur]?.classList.remove('on');
        cur = id;
        box.classList.toggle('dm-over', !!id);
        if (!id || !spots[id]) { tag.hidden = true; return; }
        lines[id]?.classList.add('on');
        showTag(bbOf(id), spots[id].name, spots[id].what);
    }
    function activate(id) {
        const s = spots[id]; if (!s) return;
        // 手机（没有鼠标悬停）选了「先亮再开」：第一下只亮出名字
        const touch = !matchMedia('(hover: hover)').matches;
        if (touch && api.get?.('tap') === 'twice' && !s.el.classList.contains('on')) {
            svg.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
            s.el.classList.add('on'); cur = 0; light(id);
            return;
        }
        s.el.classList.remove('on');
        if (s.act === 'back') return leave();
        if (s.act === 'bear') {   // 小熊：换下一只
            const st = THINGS.bear.styles, now = String(api.get?.('bear') ?? '0');
            api.set?.('bear', st[(st.indexOf(now) + 1) % st.length]);
            refresh();
            return;
        }
        const el = document.querySelector(s.act);
        (el?.closest('.drawer-toggle') || el)?.click();
    }
    const idAt = e => {
        const r = box.getBoundingClientRect();
        const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
        return map && x >= 0 && y >= 0 && x < W && y < H ? map[y * W + x] : 0;
    };
    box.addEventListener('pointermove', e => { if (map && e.pointerType === 'mouse') light(idAt(e)); });
    box.addEventListener('pointerleave', () => { if (map && !svg.querySelector('.on')) light(0); });
    box.addEventListener('click', e => {
        if (!map) return;
        const id = idAt(e);
        if (id) activate(id);
        else { svg.querySelectorAll('.on').forEach(x => x.classList.remove('on')); light(0); }
    });

    // 自查截图用：第 id 样东西身上靠中间的一个像素，在屏幕上的坐标
    room.dmPoint = id => {
        if (!map) return null;
        const pts = []; for (let i = 0; i < W * H; i++) if (map[i] === id) pts.push(i);
        if (!pts.length) return null;
        const i = pts[pts.length >> 1], r = box.getBoundingClientRect();
        return { x: r.left + ((i % W) + 0.5) / W * r.width, y: r.top + (Math.floor(i / W) + 0.5) / H * r.height };
    };

    function buildSpots(which, sk = false) {
        if (builtFor === (sk ? 'sketch/' : '') + which) return;
        builtFor = (sk ? 'sketch/' : '') + which;
        svg.replaceChildren(); spots = [];
        const list = sk ? SKETCH.spots : SPOTS, boy = sk ? SKETCH.boy : BOY, TH = sk ? SKETCH.things : THINGS;
        list.forEach((spot, i) => {
            const id = i + 1;
            const [name, what, act, poly] = which === 'boy' && boy[spot[0]] ? boy[spot[0]] : spot;
            if (act === 'bear' && TH.bear.rooms[which] === undefined) return;
            const p = document.createElementNS(svgNS, 'polygon');
            p.setAttribute('points', poly.map(q => q.join(',')).join(' '));
            p.setAttribute('tabindex', '0');
            p.setAttribute('role', 'button');
            p.setAttribute('aria-label', `${name}：${what}`);
            spots[id] = { el: p, name, what, act, poly };
            // 热区图没载入时：多边形自己管鼠标
            p.addEventListener('pointerenter', () => { if (!map) showTag(bbOf(id), name, what); });
            p.addEventListener('pointerleave', () => { if (!map && !p.classList.contains('on')) tag.hidden = true; });
            p.addEventListener('click', () => { if (!map) activate(id); });
            p.addEventListener('focus', () => { cur = 0; light(id); });
            p.addEventListener('blur', () => light(0));
            p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(id); } });
            svg.append(p);
        });
    }

    // ---- 「房间」按钮：顶栏最前面
    const btn = document.createElement('div');
    btn.id = 'dm-room-btn';
    btn.className = 'drawer';
    btn.innerHTML = '<div class="drawer-toggle"><div class="drawer-icon fa-solid fa-cube fa-fw closedIcon interactable" title="房间" tabindex="0" role="button"></div></div>';
    const holder = document.getElementById('top-settings-holder');
    holder?.prepend(btn);
    const icon = btn.querySelector('.drawer-icon');
    const onBtn = e => { e.stopPropagation(); root.classList.contains('dm-room') ? leave() : enter(); };
    icon.addEventListener('click', onBtn);

    // ---- 收起顶栏后的目录：左上角一个小本子按钮，点开列出原顶栏的每个按钮（扫描 #top-settings-holder 里的 .drawer，别的扩展加的也在）
    const NAMES = { leftNavDrawerIcon: '预设', 'sys-settings-button': 'API 连接', 'advanced-formatting-button': '高级格式', WIDrawerIcon: '世界书', 'user-settings-button': '用户设置', 'backgrounds-button': '背景', 'extensions-settings-button': '扩展', 'persona-management-button': '用户人设', rightNavDrawerIcon: '角色列表' };
    const mbtn = document.createElement('button');
    mbtn.id = 'dm-menu-btn'; mbtn.type = 'button'; mbtn.title = '目录'; mbtn.setAttribute('aria-label', '目录'); mbtn.setAttribute('aria-haspopup', 'true'); mbtn.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.id = 'dm-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
    document.body.append(mbtn, menu);
    const openDrawers = () => [...document.querySelectorAll('#top-settings-holder .drawer-icon.openIcon')].filter(i => i.closest('.drawer')?.id !== 'dm-room-btn' && !i.closest('.drawer')?.querySelector('.drawer-content.pinnedOpen'));   // 钉住的面板（挂锁）是用户要它一直开着的，不算
    const menuOpen = () => !menu.hidden;
    function syncMenuBtn() { mbtn.classList.toggle('on', menuOpen() || openDrawers().length > 0); }
    function closeMenu() { menu.hidden = true; mbtn.setAttribute('aria-expanded', 'false'); syncMenuBtn(); }
    function closeDrawers() { openDrawers().forEach(i => (i.closest('.drawer-toggle') || i).click()); }
    function buildMenu() {
        menu.replaceChildren();
        const h = document.createElement('h4'); h.textContent = '目 录'; menu.append(h);
        const drawers = [...document.querySelectorAll('#top-settings-holder > .drawer')].filter(d => d.id !== 'dm-room-btn' && d.querySelector('.drawer-icon'));
        const items = drawers.map(d => {
            const ic = d.querySelector('.drawer-icon');
            const id = ic.id || d.id;
            const name = NAMES[id] || ic.getAttribute('title') || ic.getAttribute('aria-label') || id || '按钮';
            return { name, classes: [...ic.classList].filter(c => !/^(closedIcon|openIcon|interactable|drawer-icon)$/.test(c)), open: ic.classList.contains('openIcon'), go: () => (ic.closest('.drawer-toggle') || ic).click() };
        });
        items.push({ name: '房间', classes: ['fa-solid', 'fa-cube', 'fa-fw'], open: root.classList.contains('dm-room'), go: () => (root.classList.contains('dm-room') ? leave() : enter()) });
        for (const it of items) {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'dm-mi' + (it.open ? ' here' : ''); b.setAttribute('role', 'menuitem');
            const i = document.createElement('span'); i.className = ['drawer-icon', ...it.classes].join(' ');
            const t = document.createElement('span'); t.className = 'dm-mi-t'; t.textContent = it.name;
            b.append(i, t);
            b.addEventListener('click', () => { closeMenu(); it.go(); });
            menu.append(b);
        }
    }
    function openMenu() {
        buildMenu();
        menu.hidden = false; mbtn.setAttribute('aria-expanded', 'true'); syncMenuBtn();
    }
    mbtn.addEventListener('click', () => {
        if (menuOpen()) closeMenu();
        else if (openDrawers().length) closeDrawers();   // 有面板开着：这个键就是「关上」
        else openMenu();
    });
    const onDown = e => { if (menuOpen() && !menu.contains(e.target) && !mbtn.contains(e.target)) closeMenu(); };
    document.addEventListener('pointerdown', onDown, true);
    const holder0 = document.getElementById('top-settings-holder');
    const mo = new MutationObserver(() => { if (root.classList.contains('dm-nobar')) syncMenuBtn(); });   // 面板开合：按钮的样子（本子 / 叉）跟着变（只有收起顶栏时才看得见，没收起就不干活：顶栏里的面板内容多，class 变动频繁）
    if (holder0) mo.observe(holder0, { subtree: true, attributes: true, attributeFilter: ['class'] });

    const hasChat = () => {
        const c = ctx();
        return !!(c && (c.groupId || (c.characterId !== undefined && c.characterId !== null)));
    };
    function fillPeek() {
        const c = ctx();
        const last = hasChat() ? [...(c.chat || [])].reverse().find(m => !m.is_system && m.mes) : null;
        if (!last) { peek.hidden = true; return; }
        const text = String(last.mes).replace(/```[\s\S]*?```/g, '').split('\n').filter(l => !l.trim().startsWith('|')).join(' ').replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
        peek.querySelector('b').textContent = getComputedStyle(root).getPropertyValue('--dm-school').replace(/^["']|["']$/g, '') || '学生用笺';
        peek.querySelector('small').textContent = `${last.name} · 上次聊到`;
        peek.querySelector('span').textContent = text.slice(0, 40);
        peek.hidden = false;
    }
    function enter() {
        refresh();
        room.classList.toggle('dm-no-outline', api.get?.('outline') === 'name');
        svg.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
        light(0);
        fillPeek();
        const c = ctx();
        cap.textContent = c?.name2 && hasChat() ? `302 · ${c.name2}` : '302';
        root.classList.add('dm-room');
        icon.classList.replace('closedIcon', 'openIcon');
        // 手机：房间比屏幕宽，先对准书桌
        setTimeout(aimDesk, 500);
    }
    function leave() {
        if (!hasChat()) {   // 没有聊天可回：打开角色列表
            const el = document.getElementById('rightNavDrawerIcon');
            el?.closest('.drawer-toggle')?.click();
            return;
        }
        root.classList.remove('dm-room');
        icon.classList.replace('openIcon', 'closedIcon');
        light(0);
    }
    peek.addEventListener('click', leave);

    // 换聊天：没有聊天（欢迎页）就进房间，打开了聊天就回到信笺
    const onChat = () => { if (hasChat()) leave(); else enter(); };
    const c0 = ctx();
    const es = c0?.eventSource, ev = c0?.eventTypes || c0?.event_types;
    if (es && ev?.CHAT_CHANGED) es.on(ev.CHAT_CHANGED, onChat);
    if (!hasChat()) enter();

    // 主题设置改了（换宿舍、换小熊……）：伴侣不会重新载入脚本，每秒看一眼
    refresh();
    const applyGround = () => root.classList.toggle('dm-clear', api.get?.('ground') === 'clear');   // 底色「透明」：不画方格，露出酒馆的聊天背景（CSS 见 base.css）
    const applyBar = () => {
        applyGround();
        const on = api.get?.('hidebar') === 'on';
        root.classList.toggle('dm-nobar', on);
        if (on) syncMenuBtn();
        if (!on && menuOpen()) closeMenu();
    };
    applyBar();
    const poll = setInterval(() => { if (!document.hidden) { refresh(); applyBar(); syncPal(); } }, 1000);   // 页面在后台（切走标签页）就不看
    let wasNight = root.classList.contains('dn-night');
    const dn = new MutationObserver(() => { const n = root.classList.contains('dn-night'); if (n !== wasNight) { wasNight = n; refresh(); } });   // 切昼夜（html 上的 dn-day / dn-night）马上换房间图；html 上别的 class（dm-room 等）变了不用管
    dn.observe(root, { attributes: true, attributeFilter: ['class'] });

    const onKey = e => {
        if (e.key !== 'Escape') return;
        if (menuOpen()) { closeMenu(); mbtn.focus(); return; }
        if (root.classList.contains('dm-nobar') && openDrawers().length) { closeDrawers(); return; }   // 顶栏收起时没有别的办法关面板
        if (pal.classList.contains('open')) { pal.classList.remove('open'); syncPal(); return; }
        if (root.classList.contains('dm-room') && hasChat() && !document.querySelector('.openDrawer')) leave();
    };
    document.addEventListener('keydown', onKey);

    return () => {
        if (es && ev?.CHAT_CHANGED) es.removeListener?.(ev.CHAT_CHANGED, onChat);
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('pointerdown', onDown, true);
        mo.disconnect();
        root.classList.remove('dm-nobar', 'dm-clear');
        mbtn.remove();
        menu.remove();
        clearInterval(poll);
        dn.disconnect();
        for (const el of roomVarEls()) for (const p of ['--dm-room', '--dm-room-w', '--dm-room-k']) el?.style.removeProperty(p);
        if (roomURL) URL.revokeObjectURL(roomURL);
        root.classList.remove('dm-room');
        room.remove();
        btn.remove();
        style.remove();
    };
}
