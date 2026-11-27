// Roomlet 小部件「客串」时的皮：房间菜单、小本子套在别的主题（或不套主题）里时，自己带配色、字体、图标，不靠 Roomlet 主题 CSS 的变量。
// 配色照 Roomlet 的默认颜色写死成变量（只写在小部件自己的元素上，带 .dmw 类），不论外面是亮的还是暗的主题，纸上都是深蓝墨水（对比度 ≥ 4.5:1）。
// 在 Roomlet 主题里（不是客串）不用这个文件：那时这些变量由主题 CSS 从酒馆颜色推出来，用户在 UI 主题里改色也跟着变。
import ICONS from './dorm-icons.js';

export const FONT_CSS = 'https://testingcf.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css';
export const GUEST_VOID = '#24264a';   // 房间背后深色方格的默认底色（Roomlet 的「聊天背景色」）

// sel：要套皮的元素（如 '#dm-room.dmw'）
export function skinCss(sel) {
    return `
${sel} {
  --dm-ink: #2c3a6e; --dm-ink2: #505888; --dm-red: #a8352c; --dm-paper: #fbf9f1; --dm-line: #2c3a6e; --dm-note: #f6e7a6;
  --dm-void: ${GUEST_VOID};
  --dm-void2: color-mix(in srgb, var(--dm-void), white 5%);
  --dm-hud: color-mix(in srgb, var(--dm-void), #e6e4ff 70%);   /* Roomlet 主题里是 62%；这里提亮一点，房间底下那行小字在每种底色的方格上都 ≥ 4.5:1 */
  --dm-hud-hi: color-mix(in srgb, var(--dm-void), #fff 92%);
  --dm-paper-edge: color-mix(in srgb, var(--dm-paper), var(--dm-ink) 14%);
  --dm-paper-low: color-mix(in srgb, var(--dm-paper), var(--dm-ink) 6%);
  --dm-rule: color-mix(in srgb, var(--dm-paper), var(--dm-red) 30%);
  --dm-glue-color: color-mix(in srgb, var(--dm-red), black 35%);
  --dm-tiles: conic-gradient(var(--dm-void) 25%, var(--dm-void2) 0 50%, var(--dm-void) 0 75%, var(--dm-void2) 0) 0 0 / 64px 64px;
  --dm-font: "LXGW WenKai", "霞鹜文楷", "KaiTi", "Microsoft YaHei", sans-serif;
  ${Object.entries(ICONS).map(([k, v]) => `--ico-${k}: ${v};`).join(' ')}
  font-family: var(--dm-font); font-size: 15px; line-height: normal; letter-spacing: normal; text-shadow: none; text-transform: none; font-weight: 400;
}
/* 酒馆默认主题给每个元素加文字阴影（发虚），别的主题也可能给 span、i 加：小部件里一律不要 */
${sel} * { text-shadow: none; }
/* 别的主题常给 button 加底色、圆角、最小宽高、字间距：这里只清掉小部件自己从来不写的几项，不和下面的样式打架 */
${sel} button, button${sel} { min-width: 0; min-height: 0; max-width: none; border-radius: 0; text-shadow: none; text-transform: none; appearance: none; -webkit-appearance: none; }
`;
}

// 字体：整页只加一次 <link>，最后一个用的小部件卸下时拿掉
let fontUsers = 0;
export function useFont() {
    if (fontUsers++ === 0 && !document.getElementById('dmw-font')) {
        const l = document.createElement('link');
        l.id = 'dmw-font'; l.rel = 'stylesheet'; l.href = FONT_CSS;
        document.head.append(l);
    }
    let done = false;
    return () => { if (done) return; done = true; if (--fontUsers === 0) document.getElementById('dmw-font')?.remove(); };
}
