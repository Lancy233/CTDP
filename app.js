// 双时间链 - 单页应用脚本
(() => {
  const ui = {
    mainList: document.getElementById('timeline-main'),
    subList: document.getElementById('timeline-sub'),
    mainCount: document.getElementById('count-main'),
    subCount: document.getElementById('count-sub'),
    content: document.getElementById('node-content'),
    time: document.getElementById('node-time'),
    duration: document.getElementById('node-duration'),
    addNode: document.getElementById('add-node'),
    alsoMain: document.getElementById('also-main'),
    toast: document.getElementById('toast'),
    connSvg: document.getElementById('connections'),
    timelines: document.querySelector('.timelines'),
    destroyMain: document.getElementById('destroy-main'),
    destroySub: document.getElementById('destroy-sub'),
    detailsBox: document.getElementById('details-box'),
  };

  const store = {
    main: [],
    sub: [],
  };

  const LS_KEYS = {
    main: 'timeline_main',
    sub: 'timeline_sub',
  };

  const showToast = (msg) => {
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    setTimeout(() => ui.toast.classList.remove('show'), 1800);
  };

  const fmt = (date) => {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    const h = `${date.getHours()}`.padStart(2, '0');
    const min = `${date.getMinutes()}`.padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}`;
  };

  const parseLocalDateTime = (val) => {
    // 输入格式：YYYY-MM-DDTHH:mm（本地时区）
    // 直接 new Date(val) 会按本地时区解析
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  const load = () => {
    try {
      store.main = JSON.parse(localStorage.getItem(LS_KEYS.main) || '[]');
      store.sub = JSON.parse(localStorage.getItem(LS_KEYS.sub) || '[]');
    } catch (_) {
      store.main = []; store.sub = [];
    }
    // 首次使用提供示例数据，便于预览效果
    if (!store.main.length && !store.sub.length) {
      const now = new Date();
      store.main = [
        { id: genId(), content: '项目立项', dt: new Date(now.getTime() - 3*24*3600*1000).toISOString(), duration: 120 },
        { id: genId(), content: '需求评审', dt: new Date(now.getTime() - 2*24*3600*1000).toISOString(), duration: 60 },
      ];
      store.sub = [
        { id: genId(), content: '技术调研', dt: new Date(now.getTime() - 2.5*24*3600*1000).toISOString(), duration: 90 },
      ];
    }
  };

  const save = () => {
    localStorage.setItem(LS_KEYS.main, JSON.stringify(store.main));
    localStorage.setItem(LS_KEYS.sub, JSON.stringify(store.sub));
  };

  const renderList = (el, list, lane) => {
    el.innerHTML = '';
    if (!list.length) {
      el.classList.add('empty');
      return;
    }
    el.classList.remove('empty');
    list.forEach((n, i) => {
      const li = document.createElement('li');
      li.className = 'node';
      li.dataset.id = n.id;
      li.dataset.lane = lane;
      if (n.pairId) li.dataset.pairId = n.pairId;

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      li.appendChild(num);
      li.addEventListener('click', () => showDetails(n, lane));
      el.appendChild(li);
    });
  };

  const render = () => {
    renderList(ui.mainList, store.main, 'main');
    renderList(ui.subList, store.sub, 'sub');
    ui.mainCount.textContent = store.main.length;
    ui.subCount.textContent = store.sub.length;
    bindTimelineWheel();
    renderConnections();
    centerLatest(ui.mainList);
    centerLatest(ui.subList);
  };

  function centerOf(el, container) {
    const r = el.getBoundingClientRect();
    const rc = container.getBoundingClientRect();
    return { x: r.left - rc.left + r.width / 2, y: r.top - rc.top + r.height / 2 };
  }

  function renderConnections() {
    const svg = ui.connSvg;
    const container = ui.timelines;
    if (!svg || !container) return;
    const rect = container.getBoundingClientRect();
    svg.setAttribute('width', rect.width);
    svg.setAttribute('height', rect.height);
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const mainEls = new Map();
    ui.mainList.querySelectorAll('.node').forEach(el => { mainEls.set(el.dataset.id, el); });
    const subEls = new Map();
    ui.subList.querySelectorAll('.node').forEach(el => { subEls.set(el.dataset.id, el); });

    for (const s of store.sub) {
      if (!s.pairId) continue;
      const subEl = subEls.get(s.id);
      const mainEl = mainEls.get(s.pairId);
      if (!subEl || !mainEl) continue;
      const p1 = centerOf(subEl, container);
      const p2 = centerOf(mainEl, container);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(p2.x));
      line.setAttribute('y1', String(p2.y));
      line.setAttribute('x2', String(p1.x));
      line.setAttribute('y2', String(p1.y));
      line.setAttribute('class', 'conn-line');
      line.setAttribute('id', `conn-${s.id}-${s.pairId}`);
      svg.appendChild(line);

      const onEnter = () => { line.classList.add('active'); };
      const onLeave = () => { line.classList.remove('active'); };
      subEl.addEventListener('mouseenter', onEnter);
      subEl.addEventListener('mouseleave', onLeave);
      mainEl.addEventListener('mouseenter', onEnter);
      mainEl.addEventListener('mouseleave', onLeave);
    }
  }

  // 滚轮横向滑动与滚动监听：滚动时重绘连接，确保始终贴合节点
  let redrawPending = false;
  const scheduleRedraw = () => {
    if (redrawPending) return;
    redrawPending = true;
    requestAnimationFrame(() => { renderConnections(); redrawPending = false; });
  };

  function bindTimelineWheel() {
    const bind = (el) => {
      if (!el || el.dataset.wheelBound === '1') return;
      el.addEventListener('wheel', (e) => {
        if (e.deltaY === 0) return; // 仅处理垂直滚轮
        e.preventDefault();
        el.scrollLeft += e.deltaY; // 将垂直滚轮转换为水平滚动
        scheduleRedraw();
      }, { passive: false });
      // 监听任何来源的水平滚动（触控板、键盘等）
      el.addEventListener('scroll', scheduleRedraw, { passive: true });
      el.dataset.wheelBound = '1';
    };
    bind(ui.mainList);
    bind(ui.subList);
  }

  // 调整主链节点水平位置，使其与副链对应节点严格垂直对齐
  // 节点详情展示
  const escapeHtml = (str) => String(str).replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));
  function showDetails(n, lane) {
    if (!ui.detailsBox) return;
    const d = new Date(n.dt);
    const dur = n.duration ? Number(n.duration) : 0;
    let pairText = '';
    if (n.pairId) {
      const pair = lane === 'main' ? store.sub.find(s => s.id === n.pairId) : store.main.find(m => m.id === n.pairId);
      if (pair) pairText = `<span class="label">对应：</span><span class="pair-content">${escapeHtml(pair.content)}</span>`;
    }
    ui.detailsBox.innerHTML = `
      <div class="header">
        <span class="lane-tag ${lane}">${lane === 'main' ? '主链' : '副链'}</span>
        <div class="title">${escapeHtml(n.content)}</div>
      </div>
      <div class="chips">
        <span class="chip time">${fmt(d)}</span>
        ${dur > 0 ? `<span class="chip dur">${dur} 分钟</span>` : ''}
      </div>
      ${pairText ? `<div class="pair">${pairText}</div>` : ''}
    `;
    ui.detailsBox.classList.add('flash');
    setTimeout(() => ui.detailsBox && ui.detailsBox.classList.remove('flash'), 280);
  }

  // 将某条时间线的最后一个节点居中可见
  function centerLatest(listEl) {
    if (!listEl) return;
    const nodes = listEl.querySelectorAll('.node');
    if (!nodes.length) return;
    const last = nodes[nodes.length - 1];
    const cRect = listEl.getBoundingClientRect();
    const r = last.getBoundingClientRect();
    const current = listEl.scrollLeft;
    const offset = (r.left - cRect.left) + current;
    const target = offset - (cRect.width / 2) + (r.width / 2);
    listEl.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }

  const clearForm = () => {
    ui.content.value = '';
    setDefaultDateTime();
    ui.duration.value = '30';
    if (ui.alsoMain) ui.alsoMain.checked = false;
  };

  const pad = (n) => `${n}`.padStart(2, '0');
  const setDefaultDateTime = () => {
    const now = new Date();
    const v = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    ui.time.value = v;
    if (!ui.duration.value) ui.duration.value = '30';
  };

  const addNode = () => {
    const content = ui.content.value.trim();
    const timeVal = ui.time.value;
    const d = parseLocalDateTime(timeVal);
    const duration = ui.duration.value ? Number(ui.duration.value) : 0;
    if (!content) {
      showToast('请填写节点内容');
      ui.content.focus();
      return;
    }
    if (!d) {
      showToast('请选择节点时间');
      ui.time.focus();
      return;
    }
    const node = { id: genId(), content, dt: d.toISOString(), duration };
    // 默认添加到副链
    store.sub.push(node);
    // 是否加入主链（复选框）
    const alsoMain = !!(ui.alsoMain && ui.alsoMain.checked);
    if (alsoMain) {
      const nodeMain = { ...node, id: genId() };
      node.pairId = nodeMain.id;
      nodeMain.pairId = node.id;
      store.main.push(nodeMain);
    }
    save();
    render();
    clearForm();
    showToast(alsoMain ? '已添加到副链，并加入主链' : '已添加到副链');
  };

  // 事件绑定
  ui.addNode.addEventListener('click', addNode);

  // 毁链操作（密码 0218）
  const confirmPassword = () => {
    const input = typeof window !== 'undefined' ? window.prompt('请输入密码以确认操作：') : '';
    return input === '0218';
  };
  const destroyChain = (type) => {
    if (!confirmPassword()) { showToast('密码错误或已取消'); return; }
    if (type === 'main') {
      store.main = [];
      // 清理副链中的关联引用
      store.sub = store.sub.map(s => ({ ...s, pairId: undefined }));
    } else if (type === 'sub') {
      store.sub = [];
      // 主链的 pairId 不影响渲染（仅从副链绘线），可保留或清理
    }
    save();
    render();
    showToast(type === 'main' ? '主链已毁掉' : '副链已毁掉');
  };
  ui.destroyMain && ui.destroyMain.addEventListener('click', () => destroyChain('main'));
  ui.destroySub && ui.destroySub.addEventListener('click', () => destroyChain('sub'));

  // 初始化
  load();
  // 默认值：时间为当前，花费为 30 分钟
  setDefaultDateTime();
  render();

  // 监听窗口尺寸变化，重绘连接线
  window.addEventListener('resize', renderConnections);
})();