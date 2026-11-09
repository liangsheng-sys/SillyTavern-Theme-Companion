// 絮语 · 主题伴侣附带的脚本（用这套主题时载入，换走时清理）
// 现在只做一件事：挂上「只缩中文」的字体别名（fonts-alias.css，三百多 KB 的 @font-face，放进主题 CSS 太占地方）。
// 没装扩展时没有这份，大字里的中文按原大小显示，其他照常。
export default function xuyu() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = 'xy-fonts-alias';
    link.href = new URL('xuyu-fonts-alias.css', import.meta.url).href;
    document.head.append(link);
    return () => link.remove();
}
