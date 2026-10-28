/*
 * WPS文档的小脚本：主题伴侣在用这套主题时载入（themes.json 里的 module），换走主题时清理
 * 位置、样子全在主题 CSS 里，这里只接住点击和拖动；不装扩展时这些都只是画上去的
 *
 * 1. 标尺（#wps_ruler）
 *    拖灰白交界 = 改左 / 右页边距（存成厘米，和 WPS 一样）
 *    拖上面的小倒三角 = 改首行缩进（存成字数，半个字一格）
 *    左下的正三角 + 小方块、右边的正三角（左 / 右缩进）跟着页边距走；双击滑块恢复默认
 * 2. 功能区（#wps_ribbon）
 *    字体框、字号框点开是下拉列表；A+ A- 一档一档改字号；行距按钮点开选行距
 *    选的都是主题设置里的同一个选项，两边同步
 * 3. 手机工具面板顶上那排选项卡（#wps_mtabs）
 *    点「开始 插入 查看 审阅 画笔」换到对应的面板，点右边的 ✕ 收起（✕ 只在装了扩展时画出来：<html> 上有 wps-js）
 * 4. 护眼、夜间（#wps_eye、#wps_mview）
 *    电脑：状态栏右下角那只眼睛 = 护眼模式开关（和 WPS 一样）
 *    手机：「查看」面板最上面「夜间模式」「护眼模式」两个按钮；夜间模式就是主题伴侣的昼夜开关
 *    按下去的样子由 CSS 管（夜间看 html.dn-night，护眼看主题设置写的 --wps-eye-*），这里只管点
 */
export default function wps(api) {
    const off = [ruler(api), ribbon(api), mobileTabs(), eyeAndNight(api)];
    document.documentElement.classList.add('wps-js');
    return () => {
        off.forEach(f => f?.());
        document.documentElement.classList.remove('wps-js');
    };
}

const CM = 96 / 2.54;       // 1 厘米 = 37.8 CSS 像素
const MIN_COL = 4 * CM;     // 版心至少留 4 厘米

const HANDLES = [
    ['wr-ml', '左边距'],
    ['wr-mr', '右边距'],
    ['wr-first', '首行缩进'],
    ['wr-left', '左边距'],
    ['wr-right', '右边距'],
];

function ruler({ set }) {
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

const choices = o => (o?.choices || []).map(c => Array.isArray(c) ? { value: c[0], label: c[1] } : c);

function ribbon({ get, set, option }) {
    const holder = document.getElementById('top-settings-holder');
    if (!holder) return null;
    const box = document.createElement('div');
    box.id = 'wps_ribbon';
    const btn = (cls, title) => {
        const i = document.createElement('i');
        i.className = cls;
        i.title = title;
        box.append(i);
        return i;
    };
    const font = btn('wr-font', '字体');
    const size = btn('wr-size', '字号');
    const grow = btn('wr-grow', '增大字号');
    const shrink = btn('wr-shrink', '减小字号');
    const line = btn('wr-line', '行距');
    holder.append(box);

    let list = null;   // 开着的下拉列表 { el, from }
    const close = () => {
        if (!list) return;
        list.el.remove();
        list.from.classList.remove('open');
        list = null;
    };

    function drop(from, key) {
        const was = list?.from;
        close();
        if (was === from) return;   // 再点一下 = 收起
        const o = option(key);
        if (!o) return;
        const now = get(key);
        const el = document.createElement('div');
        el.id = 'wps_dropdown';
        for (const c of choices(o)) {
            const item = document.createElement('div');
            item.textContent = c.label;
            if (c.font) item.style.fontFamily = c.font;   // 字体列表里每一项用它自己的字体
            if (c.value === now) item.className = 'on';
            item.addEventListener('click', () => { close(); set(key, c.value); });
            el.append(item);
        }
        const r = from.getBoundingClientRect();
        el.style.left = r.left + 'px';
        el.style.top = r.bottom + 2 + 'px';
        el.style.minWidth = Math.max(r.width, 80) + 'px';
        document.body.append(el);
        el.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
        from.classList.add('open');
        list = { el, from };
    }

    // A+ / A-：在字号列表里往前、往后挪一档
    function step(d) {
        close();
        const all = choices(option('size')).map(c => c.value);
        const i = all.indexOf(get('size'));
        const j = Math.min(Math.max((i < 0 ? all.indexOf('14px') : i) + d, 0), all.length - 1);
        if (all[j] !== undefined) set('size', all[j]);
    }

    font.addEventListener('click', () => drop(font, 'font'));
    size.addEventListener('click', () => drop(size, 'size'));
    line.addEventListener('click', () => drop(line, 'line'));
    grow.addEventListener('click', () => step(1));
    shrink.addEventListener('click', () => step(-1));
    // 点别处、按 Esc 收起
    const outside = e => { if (list && !list.el.contains(e.target) && !list.from.contains(e.target)) close(); };
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc);

    return () => {
        close();
        box.remove();
        document.removeEventListener('pointerdown', outside, true);
        document.removeEventListener('keydown', esc);
    };
}

// 选项卡 → 面板（和 base.css 里每个面板亮哪一格对应）
const MTABS = [
    ['开始', 'ai-config-button'],
    ['插入', 'backgrounds-button'],
    ['查看', 'user-settings-button'],
    ['审阅', 'sys-settings-button'],
    ['画笔', 'extensions-settings-button'],
];

function mobileTabs() {
    const holder = document.getElementById('top-settings-holder');
    if (!holder) return null;
    const bar = document.createElement('div');
    bar.id = 'wps_mtabs';
    // 酒馆的面板按钮绑的是 .drawer-toggle 的 click：点另一个会先收起开着的那个
    const toggle = id => document.querySelector(`#${id} > .drawer-toggle`)?.click();
    MTABS.forEach(([name, id], i) => {
        const tab = document.createElement('i');
        tab.className = 'wm-tab';
        tab.style.setProperty('--i', i);
        tab.title = name;
        tab.addEventListener('click', () => {
            if (!document.querySelector(`#${id} .drawer-content.openDrawer`)) toggle(id);
        });
        bar.append(tab);
    });
    const x = document.createElement('i');
    x.className = 'wm-close';
    x.title = '收起';
    x.addEventListener('click', () => {
        const id = document.querySelector('#top-settings-holder .drawer-content.openDrawer')?.closest('.drawer')?.id;
        if (id) toggle(id);
    });
    bar.append(x);
    // 酒馆在 <html> 上听 mousedown / touchstart：点在面板外面就把面板收起。这一排不算「外面」
    const keep = e => e.stopPropagation();
    bar.addEventListener('mousedown', keep);
    bar.addEventListener('touchstart', keep, { passive: true });
    holder.append(bar);
    return () => bar.remove();
}

function eyeAndNight({ get, set, dayNight }) {
    const eye = () => set('eye', get('eye') === 'on' ? 'off' : 'on');

    const pc = document.createElement('i');
    pc.id = 'wps_eye';
    pc.title = '护眼模式';
    pc.addEventListener('click', eye);
    document.body.append(pc);

    const box = document.createElement('div');
    box.id = 'wps_mview';
    const btn = (cls, label, fn) => {
        const b = document.createElement('div');
        b.className = cls;
        b.textContent = label;
        b.addEventListener('click', fn);
        box.append(b);
    };
    if (dayNight) btn('wv-night', '夜间模式', () => dayNight('toggle'));
    btn('wv-eye', '护眼模式', eye);
    document.getElementById('user-settings-block')?.prepend(box);

    return () => { pc.remove(); box.remove(); };
}
