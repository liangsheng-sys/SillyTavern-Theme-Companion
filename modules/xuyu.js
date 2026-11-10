// 絮语 · 主题伴侣附带的脚本（用这套主题时载入，换走时清理）
// 1. 挂上「只缩中文」的字体别名（fonts-alias.css，三百多 KB 的 @font-face，放进主题 CSS 太占地方）。
// 2. 把欢迎页的照片地址写进 --xy-photo（照片跟扩展一起装在本地，主题 CSS 自己找不到扩展的地址）。
// 没装扩展时这两样都没有：大字里的中文按原大小显示，欢迎页是一张深绿卡片，其他照常。
export default function xuyu() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = 'xy-fonts-alias';
    link.href = new URL('xuyu-fonts-alias.css', import.meta.url).href;
    document.head.append(link);

    const root = document.documentElement;
    root.style.setProperty('--xy-photo', `url("${new URL('xuyu-photo-118.webp', import.meta.url).href}")`);

    return () => {
        link.remove();
        root.style.removeProperty('--xy-photo');
    };
}
