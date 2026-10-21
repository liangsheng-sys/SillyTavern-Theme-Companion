/*
 * WPS文档的标尺：主题伴侣在用这套主题时载入（themes.json 里的 module）
 *   拖灰白交界 = 改左 / 右页边距（存成厘米，和 WPS 一样）
 *   拖上面的小倒三角 = 改首行缩进（存成字数，半个字一格）
 *   左下的正三角 + 小方块、右边的正三角（左 / 右缩进）跟着页边距走
 * 位置、样子全在主题 CSS 里（#wps_ruler），这里只接住拖动；不装扩展时标尺就是画上去的
 */
const CM = 96 / 2.54;       // 1 厘米 = 37.8 CSS 像素
const MIN_COL = 4 * CM;     // 版心至少留 4 厘米

const HANDLES = [
    ['wr-ml', '左边距'],
    ['wr-mr', '右边距'],
    ['wr-first', '首行缩进'],
    ['wr-left', '左边距'],
    ['wr-right', '右边距'],
];

export default function ruler({ set }) {
    const sheld = document.getElementById('sheld');
    if (!sheld) return null;
    const bar = document.createElement('div');
    bar.id = 'wps_ruler';
    for (const [cls, title] of HANDLES) {
        const i = document.createElement('i');
        i.className = cls;
        i.title = title;
        bar.append(i);
    }
    const guide = document.createElement('b');
    bar.append(guide);
    sheld.append(bar);

    const root = document.documentElement;
    let drag = null;   // { kind, rect, ml, mr, em, prop, value }

    // 滑块现在在哪（CSS 算好的位置，换算成相对标尺左端的像素）
    const at = cls => {
        const r = bar.querySelector('.' + cls).getBoundingClientRect();
        return r.left + r.width / 2 - bar.getBoundingClientRect().left;
    };

    function down(e) {
        const h = e.target.closest('#wps_ruler > i');
        if (!h || e.button !== 0) return;
        e.preventDefault();
        const kind = h.classList.contains('wr-first') ? 'indent'
            : h.classList.contains('wr-mr') || h.classList.contains('wr-right') ? 'mr' : 'ml';
        const rect = bar.getBoundingClientRect();
        const ml = at('wr-ml'), mr = rect.width - at('wr-mr');
        drag = { kind, rect, ml, mr, em: parseFloat(getComputedStyle(bar).fontSize) || 14 };
        h.setPointerCapture(e.pointerId);
        bar.classList.add('dragging');
        move(e);
    }

    function move(e) {
        if (!drag) return;
        const { kind, rect, ml, mr, em } = drag;
        const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        let px;
        if (kind === 'ml') {
            const cm = Math.round(Math.min(x, rect.width - mr - MIN_COL) / CM * 100) / 100;
            Object.assign(drag, { prop: '--wps-page-ml', key: 'ml', value: cm, css: cm + 'cm' });
            px = cm * CM;
        } else if (kind === 'mr') {
            const cm = Math.round(Math.min(rect.width - x, rect.width - ml - MIN_COL) / CM * 100) / 100;
            Object.assign(drag, { prop: '--wps-page-mr', key: 'mr', value: cm, css: cm + 'cm' });
            px = rect.width - cm * CM;
        } else {
            const max = Math.floor((rect.width - ml - mr) / em) - 1;
            const n = Math.min(Math.max(Math.round((x - ml) / em * 2) / 2, 0), max);
            Object.assign(drag, { prop: '--wps-indent', key: 'indent', value: n, css: n + 'em' });
            px = ml + n * em;
        }
        // 拖的时候先写在 <html> 行内（盖过一切），松手再存进主题设置
        root.style.setProperty(drag.prop, drag.css);
        guide.style.left = px + 'px';
    }

    function up() {
        if (!drag) return;
        const { prop, key, value } = drag;
        drag = null;
        bar.classList.remove('dragging');
        if (key !== undefined) set(key, value);
        root.style.removeProperty(prop);
    }

    bar.addEventListener('pointerdown', down);
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
    // 双击滑块：这一项恢复默认
    bar.addEventListener('dblclick', e => {
        const h = e.target.closest('#wps_ruler > i');
        if (!h) return;
        set(h.classList.contains('wr-first') ? 'indent' : h.classList.contains('wr-mr') || h.classList.contains('wr-right') ? 'mr' : 'ml', undefined);
    });

    return () => {
        bar.remove();
        root.style.removeProperty('--wps-page-ml');
        root.style.removeProperty('--wps-page-mr');
        root.style.removeProperty('--wps-indent');
    };
}
