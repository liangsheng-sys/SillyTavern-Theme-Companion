// Roomlet（方寸小屋）· 主题伴侣附带的脚本（用这套主题时载入，换走时清理）
// 房间菜单和小本子的代码在扩展的 widgets/（room.js、notebook.js），和主题伴侣「小部件」共用同一份；这里只是把它们按 Roomlet 主题的方式接起来：
// 1. 房间（room.js）：不是客串（颜色、字体从主题 CSS 的变量来）；欢迎页自动进房间；聊天背景 #bg1 跟着换房间图；信笺抬头 = 主题的校名 --dm-school。
//    开关灯 = 主题伴侣的昼夜开关（夜 = 熄灯）。
// 2. 小本子（notebook.js）：主题设置「酒馆顶栏」选「收起」时才有（每秒看一眼选项）；目录最后加一项「开灯 / 关灯」。
// 没装扩展就没有这些（只有聊天时压暗的房间背景，白天那张）。
// 源码在 themes/dorm/dorm.js，build 复制到扩展 modules/dorm.js；widgets/ 在扩展里和 modules/ 平级。
// 载入 widgets 时带上自己的 ?v=版本，主题更新后不吃旧缓存
const q = new URL(import.meta.url).search;
const [{ default: mountRoom, pixIcon, HUD_ICONS }, { default: mountNotebook }] = await Promise.all([
    import(new URL(`../widgets/room.js${q}`, import.meta.url).href),
    import(new URL(`../widgets/notebook.js${q}`, import.meta.url).href),
]);

// 目录里「开灯 / 关灯」那一项的图标（和房间右上角的灯泡一样）；别的项的像素图标在主题 base.css 里
const CSS = `
#dm-menu { --dm-i-bulb: ${pixIcon(HUD_ICONS.bulb)}; --dm-i-bulb0: ${pixIcon(HUD_ICONS.bulb0)}; }
#dm-menu .dm-mi .dm-mi-bulb::before { content: ""; display: block; background: currentColor; -webkit-mask: var(--dm-i-bulb) center / 28px 28px no-repeat; mask: var(--dm-i-bulb) center / 28px 28px no-repeat; }
#dm-menu .dm-mi .dm-mi-bulb.off::before { -webkit-mask-image: var(--dm-i-bulb0); mask-image: var(--dm-i-bulb0); }
`;

export default function dorm(api = {}) {
    const root = document.documentElement;
    const style = document.createElement('style');
    style.id = 'dm-dorm-style';
    style.textContent = CSS;
    document.head.append(style);
    const room = mountRoom({
        ...api,
        guest: false,
        assets: new URL('.', import.meta.url).href,
        autoEnter: () => true,
        peekTitle: () => getComputedStyle(root).getPropertyValue('--dm-school').trim().replace(/^["']|["']$/g, '') || '学生用笺',
    });
    const night = () => root.classList.contains('dn-night');
    const nb = mountNotebook({
        // 文字说「点了会怎样」，图标画「现在的样子」（和房间右上角那个一样）
        extraItems: () => api.dayNight ? [{ name: night() ? '开灯' : '关灯', classes: ['dm-mi-bulb', ...(night() ? ['off'] : [])], open: false, go: () => api.dayNight('toggle') }] : [],
    });
    const applyBar = () => nb.setOn(api.get?.('hidebar') === 'on');
    applyBar();
    const poll = setInterval(() => { if (!document.hidden) applyBar(); }, 1000);
    return () => {
        clearInterval(poll);
        nb.cleanup();
        room.cleanup();
        style.remove();
    };
}
