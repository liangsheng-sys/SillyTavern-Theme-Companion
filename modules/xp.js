/*
 * XP Messenger 的小脚本：主题伴侣在用这套主题时载入（themes.json 里的 module），换走主题时清理
 * 只做一件事：任务栏托盘的时钟。每分钟把当前时间（「15:45」）写进 --xp-clock，样子全在主题 CSS 里
 */
export default function xp() {
    const root = document.documentElement;
    const tick = () => {
        const d = new Date();
        root.style.setProperty('--xp-clock', `'${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}'`);
    };
    tick();
    root.classList.add('xp-has-clock');
    let timer = setTimeout(function next() {
        tick();
        timer = setTimeout(next, 60000 - Date.now() % 60000);
    }, 60000 - Date.now() % 60000);
    return () => {
        clearTimeout(timer);
        root.classList.remove('xp-has-clock');
        root.style.removeProperty('--xp-clock');
    };
}
