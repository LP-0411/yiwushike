import {
  state,
  subscribe,
  init,
  login,
  logout,
  switchMember,
  updateMember,
  removeMember,
  saveDish,
  deleteDish,
  toggleFavorite,
  addMenu,
  removeMenu,
  toggleVote,
  setStatus,
  setMealCook,
  mealCook,
  addShoppingItem,
  updateShopping,
  removeShopping,
  toggleShopping,
  clearBought,
  generateShopping,
  rateDish,
  seedDemoDishes,
  dishById,
  memberById,
  memberName,
  ratingsFor,
  avgRating,
  conflicts,
  canManage,
  syncLabel,
  todayISO,
  addDays,
  weekStartISO,
  weekdayLabel,
  dateLabel,
  isToday,
  MEALS,
  CATEGORIES,
  TASTE_TAGS,
  LINK_PLATFORMS,
  AVATARS,
} from './store.js';
import { CONFIG } from './config.js';

/* ================= 图标 ================= */
const ICONS = {
  today:
    '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h3M8 17h5"/></svg>',
  week:
    '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M9 9v12M15 9v12M3 14h18"/></svg>',
  dishes:
    '<svg viewBox="0 0 24 24"><path d="M4 11h16"/><path d="M12 3a8 8 0 0 0-8 8h16a8 8 0 0 0-8-8Z"/><path d="M5 15a7 7 0 0 0 14 0"/></svg>',
  cart:
    '<svg viewBox="0 0 24 24"><path d="M4 5h2l2.2 10.2a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/></svg>',
  mine:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"/></svg>',
};

/* ================= 界面状态 ================= */
const ui = {
  tab: 'today',
  weekStart: weekStartISO(todayISO()),
  search: '',
  category: '全部',
  favOnly: false,
  sort: 'default',
  loginMode: 'create',
  loginAvatar: '🧑',
  loginCountdown: 0,
  rateScore: 5,
  recMaxMin: 0,
  pickSearch: '',
  imageDraft: '',
  modal: null,
};

let lastModalSig = '';

/* ================= 基础工具 ================= */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function starsText(score) {
  if (!score) return '<span class="stars"><span class="empty">☆☆☆☆☆</span></span>';
  const full = Math.max(1, Math.min(5, Math.round(score)));
  return `<span class="stars">${'★'.repeat(full)}<span class="empty">${'☆'.repeat(5 - full)}</span></span>`;
}

function toast(message) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  while (root.children.length >= 3) root.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 240);
  }, 2300);
}

const run = (fn) =>
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      console.error(err);
      toast(err?.message || '操作失败，请重试');
    });

function openModal(modal) {
  ui.modal = { ...modal };
  lastModalSig = '';
  renderModal();
}
function closeModal() {
  ui.modal = null;
  ui.imageDraft = '';
  lastModalSig = '';
  renderModal();
}
function refreshModal() {
  if (!ui.modal) return;
  lastModalSig = '';
  renderModal();
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error('clipboard unavailable');
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

function askConfirm(text, onConfirm, okText = '确定') {
  openModal({ type: 'confirm', text, onConfirm, okText });
}

/** 压缩图片为 JPEG DataURL，控制上传体积与本地存储占用 */
function compressImage(file, maxSide = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片格式不支持'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function imagePreview(src) {
  return src
    ? `<img src="${esc(src)}" alt="菜品图片">`
    : '<span class="ph">暂无图片</span>';
}

/* ================= 主渲染 ================= */
function render() {
  const app = document.getElementById('app');
  if (!app) return;
  if (!state.ready) {
    app.innerHTML = '<div class="boot"><div class="spinner"></div><p>正在载入…</p></div>';
    renderModal();
    return;
  }
  if (!state.member) {
    app.innerHTML = loginView();
  } else {
    app.innerHTML = shellView();
  }
  renderModal();
}

function modalSignature(m) {
  if (!m) return '';
  return [m.type, m.dishId || '', m.itemId || '', m.memberId || '', m.date || '', m.meal || ''].join(
    ':'
  );
}

function renderModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  const m = ui.modal;
  if (!m) {
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
    return;
  }
  const sig = modalSignature(m);
  const active = document.activeElement;
  const editing =
    active &&
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) &&
    root.contains(active);
  if (sig === lastModalSig && editing) return;
  lastModalSig = sig;
  root.innerHTML = modalHtml(m);
  bindDishImage();
  document.body.classList.add('modal-open');
}

/** 菜品表单内的图片选择/链接预览绑定 */
function bindDishImage() {
  const fileInput = document.getElementById('dish-image-input');
  const urlInput = document.getElementById('dish-image-url');
  const box = document.getElementById('dish-image-preview');
  if (!fileInput && !urlInput) return;

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        toast('请选择图片文件');
        return;
      }
      run(async () => {
        const dataUrl = await compressImage(file);
        ui.imageDraft = dataUrl;
        if (box) box.innerHTML = imagePreview(dataUrl);
        if (urlInput) urlInput.value = '';
      });
    });
  }

  if (urlInput) {
    urlInput.addEventListener('input', () => {
      const val = urlInput.value.trim();
      if (val && !/^https?:\/\//i.test(val)) return;
      ui.imageDraft = val;
      if (box) box.innerHTML = imagePreview(val);
    });
  }
}

/* ================= 登录 ================= */
function loginView() {
  const cloud = state.mode === 'supabase';
  return `
  <div class="auth">
    <div class="auth-brand">
      <div class="logo">🍲</div>
      <h1>家宴 · 家庭点菜</h1>
      <p>一家人，商量着吃点什么</p>
    </div>
    <form class="auth-card" data-form="login">
      <div class="seg">
        <button type="button" class="${ui.loginMode === 'create' ? 'on' : ''}" data-action="login-mode" data-mode="create">创建家庭</button>
        <button type="button" class="${ui.loginMode === 'join' ? 'on' : ''}" data-action="login-mode" data-mode="join">加入家庭</button>
      </div>
      ${
        ui.loginMode === 'create'
          ? `<label class="field"><span>家庭名称</span><input name="familyName" maxlength="20" placeholder="例如：小明的家" autocomplete="off"></label>`
          : `<label class="field"><span>家庭邀请码</span><input name="inviteCode" maxlength="8" placeholder="输入 6 位邀请码" autocomplete="off" style="text-transform:uppercase;letter-spacing:2px"></label>`
      }
      <label class="field"><span>昵称</span><input name="nickname" maxlength="12" placeholder="家人怎么称呼你" autocomplete="off" required></label>
      <label class="field"><span>手机号</span><input name="phone" inputmode="numeric" maxlength="11" placeholder="11 位手机号" autocomplete="off" required></label>
      <div class="field">
        <span>验证码</span>
        <div class="code-row">
          <input name="code" inputmode="numeric" maxlength="6" placeholder="演示验证码 123456" autocomplete="one-time-code">
          <button type="button" class="btn ghost sm" id="send-code" data-action="send-code">获取验证码</button>
        </div>
      </div>
      <div class="field">
        <span>选择头像</span>
        <div class="avatar-row">
          ${AVATARS.map(
            (a) =>
              `<button type="button" class="avatar-opt ${ui.loginAvatar === a ? 'on' : ''}" data-action="login-avatar" data-avatar="${a}">${a}</button>`
          ).join('')}
        </div>
      </div>
      <button class="btn primary block" type="submit">${ui.loginMode === 'create' ? '创建家庭并进入' : '加入家庭'}</button>
      <p class="hint">${cloud ? '数据将同步到 Supabase 云端' : '当前为本地演示模式'} · 演示验证码 <b>123456</b></p>
    </form>
  </div>`;
}

/* ================= 主框架 ================= */
const TOP_TITLES = {
  today: ['今日菜单', ''],
  week: ['本周菜单', '提前安排一周三餐'],
  dishes: ['菜品库', '家里的拿手菜都在这'],
  shopping: ['采购清单', '照着清单买就行'],
  mine: ['我的', '成员与口味偏好'],
};

function shellView() {
  return `
  <div class="app-shell">
    ${topbarView()}
    <main class="view">${tabView()}</main>
    ${ui.tab === 'dishes' ? '<button class="fab" data-action="add-dish" aria-label="新增菜品">＋</button>' : ''}
    ${tabbarView()}
  </div>`;
}

function topbarView() {
  const [title] = TOP_TITLES[ui.tab] || ['家宴'];
  let sub = TOP_TITLES[ui.tab]?.[1] || '';
  if (ui.tab === 'today')
    sub = `${state.family?.name || ''} · ${dateLabel(todayISO())} ${weekdayLabel(todayISO())}`;
  if (ui.tab === 'week')
    sub = `${dateLabel(ui.weekStart)} - ${dateLabel(addDays(ui.weekStart, 6))}`;
  if (ui.tab === 'dishes') sub = `${state.dishes.length} 道菜 · ${state.members.length} 位家人`;
  if (ui.tab === 'shopping')
    sub = `${state.shopping.filter((s) => !s.checked).length} 项待购买`;
  const s = syncLabel();
  return `
  <header class="topbar">
    <div>
      <div class="topbar-title">${esc(title)}</div>
      <div class="topbar-sub">${esc(sub)}</div>
    </div>
    <div class="sync-pill ${s.cls}"><i></i>${s.text}</div>
  </header>`;
}

function tabbarView() {
  const tabs = [
    ['today', '今日', 'today'],
    ['week', '周历', 'week'],
    ['dishes', '菜品库', 'dishes'],
    ['shopping', '采购', 'cart'],
    ['mine', '我的', 'mine'],
  ];
  return `<nav class="tabbar">
    ${tabs
      .map(
        ([key, label, icon]) => `
      <button class="tab ${ui.tab === key ? 'on' : ''}" data-action="tab" data-tab="${key}">
        ${ICONS[icon]}<span>${label}</span>
      </button>`
      )
      .join('')}
  </nav>`;
}

function tabView() {
  switch (ui.tab) {
    case 'today':
      return todayView();
    case 'week':
      return weekView();
    case 'dishes':
      return libraryView();
    case 'shopping':
      return shoppingView();
    case 'mine':
      return mineView();
    default:
      return todayView();
  }
}

/* ================= 今日 ================= */
function todayView() {
  const d = todayISO();
  const confirmed = state.menuItems.filter(
    (m) => m.date === d && m.status !== 'pending'
  ).length;
  return `
  <section class="hero">
    <div class="hero-row">
      <div>
        <div class="hero-date">${dateLabel(d)} · ${weekdayLabel(d)}</div>
        <h2 class="hero-title">今天吃点什么？</h2>
      </div>
      <button class="hero-btn" data-action="random">今天吃啥</button>
    </div>
    <div class="hero-sub">${esc(state.family.name)} · 已定 ${confirmed} 道 · ${
    state.members.length
  } 位家人一起决定</div>
    <div class="hero-actions">
      <button class="btn ghost sm" data-action="generate-today">生成本日采购</button>
      <button class="btn ghost sm" data-action="goto-week">安排本周</button>
    </div>
  </section>
  ${MEALS.map((meal) => mealCard(d, meal)).join('')}
  <section class="card tip-card">
    <div class="tip-title">小提示</div>
    <div class="small muted">家人投票后，由做饭人或管理员确认；做完记得标记「已做」并打分。</div>
  </section>`;
}

function mealCard(date, meal) {
  const items = state.menuItems
    .filter((i) => i.date === date && i.meal === meal.key)
    .sort((a, b) => a.createdAt - b.createdAt);
  const cook = mealCook(date, meal.key);
  const confirmedCount = items.filter((i) => i.status !== 'pending').length;
  return `
  <section class="card meal-card">
    <header class="meal-head">
      <div class="meal-name">
        <span class="meal-dot ${meal.key}"></span>${meal.label}
        <span class="count">${items.length ? `${confirmedCount}/${items.length} 道已定` : '未点菜'}</span>
      </div>
      <div class="meal-tools">
        <button class="cook-chip ${cook ? 'on' : ''}" data-action="set-cook" data-date="${date}" data-meal="${meal.key}">
          ${cook ? `${cook.avatar} ${esc(cook.nickname)} 做` : '指定做饭人'}
        </button>
        <button class="btn primary sm" data-action="pick" data-date="${date}" data-meal="${meal.key}">＋ 点菜</button>
      </div>
    </header>
    ${
      items.length
        ? `<div class="menu-list">${items.map(menuRow).join('')}</div>`
        : '<div class="empty-line">还没有安排，点「点菜」提名一道吧</div>'
    }
  </section>`;
}

function menuRow(item) {
  const dish = dishById(item.dishId);
  if (!dish) return '';
  const me = state.member;
  const votes = item.votes || [];
  const voted = votes.includes(me.id);
  const hits = conflicts(me, dish);
  const statusText = { pending: '待选', confirmed: '已定', done: '已做' }[item.status];
  return `
  <div class="menu-row">
    <button class="row-main" data-action="dish-detail" data-id="${dish.id}">
      <span class="row-thumb">
        ${dish.imageUrl ? `<img src="${esc(dish.imageUrl)}" alt="" loading="lazy">` : `<span class="ph">${esc(dish.name.slice(0, 1))}</span>`}
      </span>
      <span class="row-text">
        <span class="dish-name">${esc(dish.name)}${hits.length ? '<i class="warn-dot" title="含你的忌口食材">!</i>' : ''}</span>
        <span class="meta">${esc(dish.category)} · ${dish.durationMin} 分钟 · ${starsText(avgRating(dish.id))}</span>
      </span>
    </button>
    <div class="row-side">
      <button class="vote ${voted ? 'on' : ''}" data-action="vote" data-id="${item.id}" title="点赞投票">♥ ${votes.length}</button>
      <span class="badge ${item.status}">${statusText}</span>
      ${canManage(item) && item.status === 'pending' ? `<button class="mini primary" data-action="confirm" data-id="${item.id}">确认</button>` : ''}
      ${canManage(item) && item.status === 'confirmed' ? `<button class="mini primary" data-action="done" data-id="${item.id}">已做</button>` : ''}
      ${canManage(item) || item.createdBy === me.id ? `<button class="mini x" data-action="remove-menu" data-id="${item.id}" aria-label="移除">×</button>` : ''}
    </div>
  </div>`;
}

/* ================= 周历 ================= */
function weekView() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(ui.weekStart, i));
  const confirmedCount = state.menuItems.filter(
    (m) => m.date >= days[0] && m.date <= days[6] && m.status !== 'pending'
  ).length;
  return `
  <div class="week-nav">
    <button class="week-arrow" data-action="week-prev" aria-label="上一周">‹</button>
    <div class="range">
      <b>${dateLabel(days[0])} - ${dateLabel(days[6])}</b>
      <span>本周已定 ${confirmedCount} 道菜</span>
    </div>
    <button class="week-arrow" data-action="week-next" aria-label="下一周">›</button>
  </div>
  <button class="week-today-btn" data-action="week-today">回到本周</button>
  ${days.map((d) => weekDayCard(d)).join('')}
  <div class="card tip-card">
    <div class="tip-title">按本周已定菜品汇总食材</div>
    <button class="btn primary sm" data-action="generate-week">生成采购清单</button>
  </div>`;
}

function weekDayCard(date) {
  const today = isToday(date);
  return `
  <section class="week-day ${today ? 'today' : ''}">
    <div class="week-day-head">
      <span class="week-date">${dateLabel(date)}</span>
      <span class="week-label">${weekdayLabel(date)}${today ? ' · 今天' : ''}</span>
    </div>
    ${MEALS.map((meal) => {
      const items = state.menuItems.filter((i) => i.date === date && i.meal === meal.key);
      const cook = mealCook(date, meal.key);
      return `
      <div class="week-meal">
        <span class="meal-label" title="${cook ? `${esc(cook.nickname)} 做饭` : '未指定做饭人'}">${cook ? cook.avatar : meal.short}</span>
        <div class="week-chips">
          ${items
            .map((i) => {
              const dish = dishById(i.dishId);
              if (!dish) return '';
              return `<button class="dish-chip ${i.status === 'pending' ? 'pending' : i.status === 'done' ? 'done' : ''}" data-action="dish-detail" data-id="${dish.id}">${esc(dish.name)}</button>`;
            })
            .join('')}
          <button class="add-chip" data-action="pick" data-date="${date}" data-meal="${meal.key}" aria-label="添加菜品">＋</button>
        </div>
      </div>`;
    }).join('')}
  </section>`;
}

/* ================= 菜品库 ================= */
function libraryView() {
  return `
  <div class="lib-toolbar">
    <input id="dish-search" class="search" placeholder="搜索菜名…" value="${esc(ui.search)}" autocomplete="off">
    <div class="chip-row" style="margin-top:10px">
      ${['全部', ...CATEGORIES]
        .map(
          (c) =>
            `<button class="chip ${ui.category === c ? 'active' : ''}" data-action="set-category" data-cat="${c}">${c}</button>`
        )
        .join('')}
    </div>
    <div class="filter-row">
      <select class="select" data-change="sort">
        ${[
          ['default', '默认排序'],
          ['time', '按耗时'],
          ['difficulty', '按难度'],
          ['rating', '按评分'],
          ['cooked', '按做过次数'],
        ]
          .map(([value, label]) => `<option value="${value}" ${ui.sort === value ? 'selected' : ''}>${label}</option>`)
          .join('')}
      </select>
      <button class="chip ${ui.favOnly ? 'active' : ''} fav-filter" data-action="toggle-fav">♥ 我的收藏</button>
    </div>
  </div>
  <div id="dish-grid">${dishGrid()}</div>`;
}

function filteredDishes() {
  let list = [...state.dishes];
  const q = ui.search.trim().toLowerCase();
  if (q) list = list.filter((d) => d.name.toLowerCase().includes(q));
  if (ui.category !== '全部') list = list.filter((d) => d.category === ui.category);
  if (ui.favOnly)
    list = list.filter((d) => (d.favoriteBy || []).includes(state.member.id));
  const diffRank = { 简单: 0, 中等: 1, 复杂: 2 };
  switch (ui.sort) {
    case 'time':
      list.sort((a, b) => (a.durationMin || 0) - (b.durationMin || 0));
      break;
    case 'difficulty':
      list.sort((a, b) => (diffRank[a.difficulty] ?? 9) - (diffRank[b.difficulty] ?? 9));
      break;
    case 'rating':
      list.sort((a, b) => (avgRating(b.id) || 0) - (avgRating(a.id) || 0));
      break;
    case 'cooked':
      list.sort((a, b) => (b.cookedCount || 0) - (a.cookedCount || 0));
      break;
    default:
      list.sort((a, b) => b.createdAt - a.createdAt);
  }
  return list;
}

function dishGrid() {
  if (!state.dishes.length) {
    return `
    <div class="empty-state">
      <div class="big">🍳</div>
      <div>菜品库还是空的</div>
      <div class="small">先添加家里的拿手菜，或者先载入示例菜品体验一下</div>
      <button class="btn primary sm" data-action="add-dish">新增第一道菜</button>
      <button class="btn ghost sm" data-action="seed-demo">载入示例菜品</button>
    </div>`;
  }
  const list = filteredDishes();
  if (!list.length) {
    return '<div class="empty-state"><div class="big">🔍</div><div>没有找到匹配的菜品</div><div class="small">换个关键词或分类试试</div></div>';
  }
  return `<div class="dish-grid">${list.map(dishCard).join('')}</div>`;
}

function dishCard(dish) {
  const me = state.member;
  const fav = (dish.favoriteBy || []).includes(me.id);
  const hits = conflicts(me, dish);
  const avg = avgRating(dish.id);
  return `
  <article class="dish-card" data-action="dish-detail" data-id="${dish.id}">
    ${
      dish.imageUrl
        ? `<div class="dish-thumb"><img src="${esc(dish.imageUrl)}" alt="${esc(dish.name)}" loading="lazy"></div>`
        : `<div class="dish-thumb empty"><span>${esc(dish.name.slice(0, 1))}</span></div>`
    }
    <div class="dish-top">
      <h3>${esc(dish.name)}</h3>
      <button class="fav ${fav ? 'on' : ''}" data-action="fav" data-id="${dish.id}" aria-label="收藏">♥</button>
    </div>
    <div class="dish-meta">
      <span>${esc(dish.category)}</span><span>·</span>
      <span>${esc(dish.difficulty)}</span><span>·</span>
      <span>${dish.durationMin} 分钟</span>
    </div>
    ${hits.length ? `<div class="warn-line">含忌口：${hits.map(esc).join('、')}</div>` : ''}
    <div class="dish-foot">
      <span>${avg ? starsText(avg) : '<span class="small muted">暂无评分</span>'}</span>
      <span>做过 ${dish.cookedCount || 0} 次</span>
    </div>
  </article>`;
}

/* ================= 采购 ================= */
function shoppingView() {
  const total = state.shopping.length;
  const bought = state.shopping.filter((s) => s.checked);
  const todo = state.shopping.filter((s) => !s.checked);
  const percent = total ? Math.round((bought.length / total) * 100) : 0;
  return `
  <section class="shop-summary">
    <div class="shop-summary-top">
      <div>
        <h2>采购清单</h2>
        <div class="meta">已买 ${bought.length} / ${total} 项</div>
      </div>
      <button class="btn primary sm" data-action="generate-week">按本周生成</button>
    </div>
    <div class="progress"><div class="progress-bar" style="width:${percent}%"></div></div>
    <div class="shop-actions">
      <button class="btn ghost sm" data-action="generate-today">生成本日清单</button>
      <button class="btn ghost sm" data-action="add-shop">＋ 手动添加</button>
      ${bought.length ? '<button class="btn danger-ghost sm" data-action="clear-bought">清空已买</button>' : ''}
    </div>
  </section>
  ${
    total
      ? `
    ${todo.length ? `<div class="shop-group"><div class="shop-group-title"><span>待购买</span><span>${todo.length} 项</span></div>${todo.map(shopRow).join('')}</div>` : ''}
    ${bought.length ? `<div class="shop-group"><div class="shop-group-title"><span>已买</span><span>${bought.length} 项</span></div>${bought.map(shopRow).join('')}</div>` : ''}
  `
      : `
    <div class="empty-state">
      <div class="big">🧺</div>
      <div>还没有采购清单</div>
      <div class="small">把菜品确认「已定」后，点上方按钮自动汇总食材</div>
    </div>`
  }`;
}

function shopRow(item) {
  return `
  <div class="shop-item ${item.checked ? 'checked' : ''}">
    <button class="check" data-action="toggle-shop" data-id="${item.id}" aria-label="标记已买">✓</button>
    <div class="shop-main">
      <div>
        <span class="shop-name">${esc(item.ingredient)}</span>
        <span class="shop-amount">${esc(item.amount || '')}</span>
      </div>
      ${item.fromDishName ? `<div class="shop-from">来自：${esc(item.fromDishName)}</div>` : ''}
    </div>
    <div class="shop-tools">
      <button class="icon-btn" data-action="edit-shop" data-id="${item.id}" aria-label="编辑">✎</button>
      <button class="icon-btn danger" data-action="del-shop" data-id="${item.id}" aria-label="删除">×</button>
    </div>
  </div>`;
}

/* ================= 我的 ================= */
function mineView() {
  const me = state.member;
  const isAdmin = me.role === 'admin';
  const s = syncLabel();
  return `
  <section class="profile-card">
    <div class="avatar">${me.avatar || '🧑'}</div>
    <div class="profile-info">
      <h2>${esc(me.nickname)}
        <span class="role-tag ${isAdmin ? '' : 'member'}">${isAdmin ? '管理员' : me.role === 'cook' ? '做饭人' : '成员'}</span>
      </h2>
      <p>${esc(me.phone || '未填写手机号')}</p>
    </div>
    <button class="btn ghost sm" data-action="edit-me">编辑</button>
  </section>

  <section class="section-card">
    <div class="section-head"><h3>我的偏好</h3><button class="btn ghost sm" data-action="edit-me">修改</button></div>
    ${prefRow('忌口 / 过敏', me.allergies, '未设置')}
    ${prefRow('口味偏好', me.tasteTags, '未设置')}
    ${prefRow('不吃食材', me.dislikedFoods, '未设置')}
    <div class="small muted" style="margin-top:10px">点菜与「今天吃啥」推荐会自动避开忌口与不吃食材。</div>
  </section>

  <section class="section-card">
    <div class="section-head">
      <h3>${esc(state.family.name)}</h3>
      <span class="small muted">${state.members.length} 位成员</span>
    </div>
    <div class="invite-box">
      <div>
        <div class="label">家庭邀请码</div>
        <div class="invite-code">${esc(state.family.inviteCode)}</div>
      </div>
      <button class="btn ghost sm" data-action="copy-invite">复制</button>
    </div>
    <div class="member-list">${state.members.map(memberRow).join('')}</div>
    ${isAdmin ? '<div class="small muted" style="margin-top:8px">管理员可编辑成员资料与角色、移除成员。</div>' : ''}
  </section>

  <section class="section-card">
    <div class="section-head"><h3>数据与账号</h3></div>
    <div class="data-row">
      <span>存储方式</span>
      <span class="sync-status ${state.mode === 'supabase' ? 'ok' : ''}"><i></i>${state.mode === 'supabase' ? 'Supabase 云端' : '本地演示存储'}</span>
    </div>
    <div class="data-row">
      <span>同步状态</span>
      <span class="sync-status ${s.cls}"><i></i>${s.text}</span>
    </div>
    ${state.mode === 'local' ? '<div class="data-row"><span>演示：切换成员</span><button class="btn ghost sm" data-action="switch-demo">切换</button></div>' : ''}
  </section>

  <button class="btn ghost logout-btn" data-action="logout">退出登录</button>
  <p class="hint" style="padding-bottom:6px">家宴 · MVP 版本</p>`;
}

function prefRow(label, list, emptyText) {
  const arr = list || [];
  return `
  <div class="pref-row">
    <span class="pref-label">${label}</span>
    <div class="pref-chips">
      ${arr.length ? arr.map((x) => `<span class="chip">${esc(x)}</span>`).join('') : `<span class="small muted">${emptyText}</span>`}
    </div>
  </div>`;
}

function memberRow(member) {
  const me = state.member;
  const isMe = member.id === me.id;
  const isAdmin = me.role === 'admin';
  const roleText = member.role === 'admin' ? '管理员' : member.role === 'cook' ? '做饭人' : '成员';
  return `
  <div class="member-row">
    <div class="member-avatar">${member.avatar || '🧑'}</div>
    <div>
      <div class="member-name">${esc(member.nickname)}${isMe ? ' <span class="chip">我</span>' : ''}
        <span class="role-tag ${member.role === 'admin' ? '' : 'member'}">${roleText}</span>
      </div>
      <div class="member-sub">${esc((member.allergies || []).join('、') || '无忌口')}</div>
    </div>
    <div class="member-tools">
      ${isAdmin || isMe ? `<button class="icon-btn" data-action="edit-member" data-id="${member.id}" aria-label="编辑">✎</button>` : ''}
      ${isAdmin && !isMe ? `<button class="icon-btn danger" data-action="del-member" data-id="${member.id}" aria-label="移除">×</button>` : ''}
    </div>
  </div>`;
}

/* ================= 弹层内容 ================= */
function sheet(inner) {
  return `<div class="modal-overlay" data-action="close-modal"><div class="sheet" role="dialog" aria-modal="true">${inner}</div></div>`;
}

function modalHtml(m) {
  switch (m.type) {
    case 'pick':
      return pickDishModal(m);
    case 'dishForm':
      return dishFormModal(m);
    case 'dishDetail':
      return dishDetailModal(m.dishId);
    case 'cook':
      return cookModal(m);
    case 'memberForm':
      return memberFormModal(m);
    case 'shopForm':
      return shopFormModal(m);
    case 'recommend':
      return recommendModal();
    case 'schedule':
      return scheduleModal(m);
    case 'switch':
      return switchModal();
    case 'confirm':
      return confirmModal(m);
    default:
      return '';
  }
}

function pickDishModal(m) {
  const meal = MEALS.find((x) => x.key === m.meal);
  return sheet(`
    <div class="sheet-head">
      <div>
        <h2>选择菜品</h2>
        <div class="meta">${dateLabel(m.date)} ${weekdayLabel(m.date)} · ${meal ? meal.label : ''}</div>
      </div>
      <button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>
    </div>
    <input id="pick-search" class="search" placeholder="搜索菜名…" value="${esc(ui.pickSearch)}" autocomplete="off">
    <div class="pick-list" id="pick-list">${pickList()}</div>
    <button class="btn ghost block" data-action="quick-add-dish" data-date="${m.date}" data-meal="${m.meal}" style="margin-top:14px">＋ 临时新增一道菜</button>
  `);
}

function pickList() {
  const q = ui.pickSearch.trim().toLowerCase();
  const list = state.dishes.filter((d) => !q || d.name.toLowerCase().includes(q));
  if (!list.length) {
    return '<div class="empty-state"><div class="big">🥬</div><div>没有匹配的菜品</div><div class="small">可以先「临时新增一道菜」</div></div>';
  }
  return list
    .map((dish) => {
      const hits = conflicts(state.member, dish);
      return `
      <button class="pick-item" data-action="pick-dish" data-id="${dish.id}">
        <div class="grow">
          <div class="name">${esc(dish.name)}${hits.length ? '<span class="pick-warn">含忌口</span>' : ''}</div>
          <div class="sub">${esc(dish.category)} · ${dish.durationMin} 分钟 · ${esc(dish.difficulty)}</div>
        </div>
        <span class="go">＋</span>
      </button>`;
    })
    .join('');
}

function dishFormModal(m) {
  const dish = m.dishId ? dishById(m.dishId) : null;
  const ings =
    dish?.ingredients?.length ? dish.ingredients : [{ name: '', amount: '' }, { name: '', amount: '' }];
  const links = dish?.links || [];
  return sheet(`
    <div class="sheet-head">
      <div>
        <h2>${dish ? '编辑菜品' : '新增菜品'}</h2>
        <div class="meta">菜名必填 · 教程链接需以 http(s):// 开头</div>
      </div>
      <button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>
    </div>
    <form data-form="dish" data-id="${dish?.id || ''}" class="form-grid" style="margin-top:10px">
      <label class="field"><span>菜名 *</span><input name="name" maxlength="20" required value="${esc(dish?.name || '')}" placeholder="例如：红烧排骨" autocomplete="off"></label>
      <div class="field">
        <span>菜品图片（可选）</span>
        <div class="image-picker">
          <div class="image-preview" id="dish-image-preview">${imagePreview(ui.imageDraft)}</div>
          <div class="image-tools">
            <label class="btn ghost sm">选择图片<input type="file" id="dish-image-input" accept="image/*" hidden></label>
            <button type="button" class="btn ghost sm" data-action="clear-image">移除图片</button>
          </div>
        </div>
        <input id="dish-image-url" name="imageUrl" placeholder="或粘贴图片链接 https://…" value="${esc(/^https?:\/\//i.test(ui.imageDraft) ? ui.imageDraft : '')}" autocomplete="off" inputmode="url">
      </div>
      <div class="field-row">
        <label class="field"><span>分类</span><select name="category">${CATEGORIES.map((c) => `<option ${dish?.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field"><span>难度</span><select name="difficulty">${['简单', '中等', '复杂'].map((x) => `<option ${dish?.difficulty === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>预计耗时（分钟）</span><input name="durationMin" type="number" min="0" max="600" value="${dish?.durationMin ?? ''}" placeholder="例如：20" inputmode="numeric"></label>
      <div class="field">
        <span>口味标签</span>
        <div class="chip-checks">
          ${TASTE_TAGS.map(
            (t) =>
              `<label class="chip-check"><input type="checkbox" name="taste" value="${t}" ${(dish?.tasteTags || []).includes(t) ? 'checked' : ''}><span>${t}</span></label>`
          ).join('')}
        </div>
      </div>
      <div class="field">
        <span>主要食材</span>
        <div id="ing-rows">${ings.map((i) => ingRow(i)).join('')}</div>
        <button type="button" class="add-row" data-action="add-ing">＋ 添加食材</button>
      </div>
      <label class="field"><span>做法步骤（可选）</span><textarea name="steps" placeholder="分步骤写下来，家人照着做…">${esc(dish?.steps || '')}</textarea></label>
      <div class="field">
        <span>教程外链（可选，可多条）</span>
        <div id="link-rows">${links.map((l) => linkEditRow(l)).join('')}</div>
        <button type="button" class="add-row" data-action="add-link">＋ 添加教程链接</button>
      </div>
      <button class="btn primary block" type="submit">${dish ? '保存修改' : '保存菜品'}</button>
    </form>
  `);
}

function ingRow(ing = {}) {
  return `
  <div class="dyn-row ing-row">
    <input class="grow" name="ingName" placeholder="食材名，如 西红柿" value="${esc(ing.name || '')}" autocomplete="off">
    <input class="amount" name="ingAmount" placeholder="用量" value="${esc(ing.amount || '')}" autocomplete="off">
    <button type="button" class="del" data-action="del-row" aria-label="删除">×</button>
  </div>`;
}

function linkEditRow(link = {}) {
  return `
  <div class="link-edit">
    <div class="dyn-row">
      <select name="linkPlatform">${LINK_PLATFORMS.map((p) => `<option ${link.platform === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <input class="grow" name="linkTitle" placeholder="链接标题" value="${esc(link.title || '')}" autocomplete="off">
      <button type="button" class="del" data-action="del-row" aria-label="删除">×</button>
    </div>
    <div class="dyn-row">
      <input class="grow" name="linkUrl" placeholder="https://…" value="${esc(link.url || '')}" autocomplete="off" inputmode="url">
    </div>
  </div>`;
}

function dishDetailModal(dishId) {
  const dish = dishById(dishId);
  if (!dish) return sheet('<div class="empty-state">菜品不存在</div>');
  const me = state.member;
  const avg = avgRating(dish.id);
  const reviews = ratingsFor(dish.id);
  const hits = conflicts(me, dish);
  const fav = (dish.favoriteBy || []).includes(me.id);
  const canDelete = me.role === 'admin' || dish.createdBy === me.id;
  return sheet(`
    ${dish.imageUrl ? `<div class="detail-hero"><img src="${esc(dish.imageUrl)}" alt="${esc(dish.name)}"></div>` : ''}
    <div class="sheet-head">
      <div>
        <h2>${esc(dish.name)}</h2>
        <div class="meta">${esc(dish.category)} · ${esc(dish.difficulty)} · ${dish.durationMin} 分钟 · 做过 ${dish.cookedCount || 0} 次 · ${avg ? `${avg} 分` : '暂无评分'}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="modal-close ${fav ? 'on' : ''}" data-action="fav" data-id="${dish.id}" aria-label="收藏" style="color:${fav ? '#e0645a' : ''}">♥</button>
        <button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>
      </div>
    </div>
    ${hits.length ? `<div class="alert warn">⚠ 含你的忌口 / 不吃食材：${hits.map(esc).join('、')}</div>` : ''}
    <div class="chips" style="margin-top:10px">
      ${(dish.tasteTags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
      <span class="chip">${starsText(avg)}${avg ? ` ${avg}` : ' 暂无评分'}</span>
    </div>
    <h3 class="sub-title">主要食材</h3>
    <ul class="ing-list">
      ${(dish.ingredients || []).map((i) => `<li><span>${esc(i.name)}</span><b>${esc(i.amount || '')}</b></li>`).join('') || '<li class="muted">未填写</li>'}
    </ul>
    <h3 class="sub-title">做法步骤</h3>
    <p class="steps">${dish.steps ? esc(dish.steps).replace(/\n/g, '<br>') : '<span class="muted">暂无文字步骤</span>'}</p>
    <h3 class="sub-title">教程链接</h3>
    ${(dish.links || []).length ? dish.links.map(linkViewRow).join('') : '<p class="muted small">暂无教程链接，可在编辑里添加</p>'}
    <h3 class="sub-title">家人评价 ${avg ? `<span class="chip">平均 ${avg} 分</span>` : ''}</h3>
    ${reviews.length ? reviews.slice(0, 6).map(reviewRow).join('') : '<p class="muted small">还没有人评价</p>'}
    <div class="rate-box">
      <span>我来评分</span>
      <div class="stars-input" id="stars-input">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-action="rate-star" data-score="${n}" class="${n <= ui.rateScore ? 'on' : ''}">★</button>`).join('')}
      </div>
      <input id="rate-comment" maxlength="40" placeholder="写一句评语（可选）" autocomplete="off">
      <button class="btn ghost sm" data-action="submit-rate" data-id="${dish.id}">提交评价</button>
    </div>
    <div class="sheet-actions">
      <button class="btn primary" data-action="schedule-dish" data-id="${dish.id}">加入菜单</button>
      <button class="btn ghost" data-action="edit-dish" data-id="${dish.id}">编辑</button>
      ${canDelete ? `<button class="btn danger-ghost" data-action="delete-dish" data-id="${dish.id}">删除</button>` : ''}
    </div>
  `);
}

function linkViewRow(link) {
  return `
  <div class="link-row">
    <span class="platform-badge">${esc(link.platform || '链接')}</span>
    <div class="link-main">
      <div class="title">${esc(link.title || link.url)}</div>
      <div class="url">${esc(link.url)}</div>
    </div>
    <div class="link-actions">
      <button class="btn ghost sm" data-action="open-link" data-url="${esc(link.url)}" data-platform="${esc(link.platform || '')}">打开</button>
      <button class="btn ghost sm" data-action="copy-link" data-url="${esc(link.url)}">复制</button>
    </div>
  </div>`;
}

function reviewRow(r) {
  return `
  <div class="review">
    <div><b>${esc(memberName(r.memberId))}</b><span class="stars">${starsText(r.score)}</span></div>
    ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
  </div>`;
}

function cookModal(m) {
  const current = mealCook(m.date, m.meal);
  const meal = MEALS.find((x) => x.key === m.meal);
  return sheet(`
    <div class="sheet-head">
      <div><h2>指定做饭人</h2><div class="meta">${dateLabel(m.date)} ${weekdayLabel(m.date)} · ${meal ? meal.label : ''}</div></div>
      <button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>
    </div>
    <div class="cook-list">
      <button class="cook-option ${!current ? 'on' : ''}" data-action="choose-cook" data-date="${m.date}" data-meal="${m.meal}" data-id="">
        <div class="member-avatar">🙂</div>
        <div class="grow"><div class="member-name">暂不指定</div><div class="member-sub">之后再安排</div></div>
        <span class="check-dot"></span>
      </button>
      ${state.members
        .map(
          (member) => `
        <button class="cook-option ${current?.id === member.id ? 'on' : ''}" data-action="choose-cook" data-date="${m.date}" data-meal="${m.meal}" data-id="${member.id}">
          <div class="member-avatar">${member.avatar || '🧑'}</div>
          <div class="grow">
            <div class="member-name">${esc(member.nickname)}${member.id === state.member.id ? '（我）' : ''}</div>
            <div class="member-sub">${member.role === 'admin' ? '管理员' : member.role === 'cook' ? '做饭人' : '成员'}</div>
          </div>
          <span class="check-dot"></span>
        </button>`
        )
        .join('')}
    </div>`);
}

function memberFormModal(m) {
  const member = m.memberId ? memberById(m.memberId) : state.member;
  if (!member) return sheet('<div class="empty-state">成员不存在</div>');
  const isSelf = member.id === state.member.id;
  const isAdmin = state.member.role === 'admin';
  return sheet(`
    <div class="sheet-head">
      <div>
        <h2>${isSelf ? '编辑我的资料' : `编辑 ${esc(member.nickname)}`}</h2>
        <div class="meta">${isSelf ? '偏好用于点菜与推荐时的忌口过滤' : '管理员可调整成员资料与角色'}</div>
      </div>
      <button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>
    </div>
    <form data-form="member" data-id="${member.id}" class="form-grid" style="margin-top:10px">
      <div class="field-row">
        <label class="field"><span>昵称</span><input name="nickname" maxlength="12" required value="${esc(member.nickname)}"></label>
        <label class="field"><span>头像</span>
          <select name="avatar">${AVATARS.map((a) => `<option value="${a}" ${member.avatar === a ? 'selected' : ''}>${a}</option>`).join('')}</select>
        </label>
      </div>
      ${
        isAdmin
          ? `<label class="field"><span>角色</span>
        <select name="role">
          <option value="member" ${member.role === 'member' ? 'selected' : ''}>成员</option>
          <option value="cook" ${member.role === 'cook' ? 'selected' : ''}>做饭人</option>
          <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>管理员</option>
        </select></label>`
          : ''
      }
      <label class="field"><span>忌口 / 过敏食材（逗号分隔）</span><input name="allergies" value="${esc((member.allergies || []).join('、'))}" placeholder="如 花生、海鲜"></label>
      <div class="field">
        <span>口味偏好</span>
        <div class="chip-checks">
          ${TASTE_TAGS.map(
            (t) =>
              `<label class="chip-check"><input type="checkbox" name="taste" value="${t}" ${(member.tasteTags || []).includes(t) ? 'checked' : ''}><span>${t}</span></label>`
          ).join('')}
        </div>
      </div>
      <label class="field"><span>不吃的食材（逗号分隔）</span><input name="disliked" value="${esc((member.dislikedFoods || []).join('、'))}" placeholder="如 香菜、内脏"></label>
      <button class="btn primary block" type="submit">保存</button>
    </form>`);
}

function shopFormModal(m) {
  const item = m.itemId ? state.shopping.find((s) => s.id === m.itemId) : null;
  return sheet(`
    <div class="sheet-head">
      <div><h2>${item ? '编辑采购条目' : '手动添加食材'}</h2><div class="meta">手动条目在重新生成清单时不会被覆盖</div></div>
      <button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>
    </div>
    <form data-form="shop" data-id="${item?.id || ''}" class="form-grid" style="margin-top:10px">
      <label class="field"><span>食材名 *</span><input name="ingredient" maxlength="20" required value="${esc(item?.ingredient || '')}" placeholder="例如：生抽"></label>
      <label class="field"><span>用量</span><input name="amount" maxlength="20" value="${esc(item?.amount || '')}" placeholder="例如：1 瓶"></label>
      <button class="btn primary block" type="submit">${item ? '保存修改' : '添加到清单'}</button>
    </form>`);
}

function recommendModal() {
  const recs = recommendDishes();
  return sheet(`
    <div class="sheet-head">
      <div><h2>今天吃啥</h2><div class="meta">已避开你的忌口，并排除今天已点的菜</div></div>
      <button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>
    </div>
    <div class="filter-row" style="margin-top:8px">
      <span class="small muted">耗时上限</span>
      <select class="select" data-change="rec-max">
        ${[[0, '不限'], [15, '15 分钟内'], [30, '30 分钟内'], [45, '45 分钟内'], [60, '60 分钟内']]
          .map(([v, label]) => `<option value="${v}" ${ui.recMaxMin === v ? 'selected' : ''}>${label}</option>`)
          .join('')}
      </select>
      <button class="btn ghost sm" data-action="rec-refresh" style="margin-left:auto">换一批</button>
    </div>
    ${
      recs.length
        ? recs
            .map((dish) => {
              const avg = avgRating(dish.id);
              return `
        <div class="rec-card">
          <div class="rec-head">
            <div>
              <h3>${esc(dish.name)}</h3>
              <div class="meta">${esc(dish.category)} · ${dish.durationMin} 分钟 · ${esc(dish.difficulty)} · ${avg ? `${avg} 分` : '暂无评分'}</div>
            </div>
            <span>${avg ? starsText(avg) : ''}</span>
          </div>
          <div class="rec-actions">
            <button class="btn primary sm" data-action="rec-add" data-id="${dish.id}" data-meal="dinner">加入今天晚餐</button>
            <button class="btn ghost sm" data-action="rec-add" data-id="${dish.id}" data-meal="lunch">加入今天午餐</button>
            <button class="btn ghost sm" data-action="dish-detail" data-id="${dish.id}">看详情</button>
          </div>
        </div>`;
            })
            .join('')
        : `<div class="empty-state"><div class="big">🤔</div><div>没有符合条件的菜</div><div class="small">放宽耗时限制，或先去菜品库添加几道菜</div></div>`
    }
  `);
}

function scheduleModal(m) {
  const dish = dishById(m.dishId);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i));
  return sheet(`
    <div class="sheet-head">
      <div><h2>加入菜单</h2><div class="meta">${esc(dish?.name || '')}</div></div>
      <button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>
    </div>
    <form data-form="schedule" data-id="${m.dishId}" class="form-grid" style="margin-top:10px">
      <label class="field"><span>日期</span>
        <select name="date">${dates.map((d) => `<option value="${d}">${dateLabel(d)} ${weekdayLabel(d)}${isToday(d) ? ' · 今天' : ''}</option>`).join('')}</select>
      </label>
      <label class="field"><span>餐次</span>
        <select name="meal">${MEALS.map((x) => `<option value="${x.key}" ${x.key === 'dinner' ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
      </label>
      <button class="btn primary block" type="submit">加入菜单</button>
    </form>`);
}

function switchModal() {
  return sheet(`
    <div class="sheet-head">
      <div><h2>切换成员（演示）</h2><div class="meta">本地演示模式，用来模拟家人分别操作</div></div>
      <button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>
    </div>
    <div class="cook-list">
      ${state.members
        .map(
          (member) => `
        <button class="cook-option ${state.member.id === member.id ? 'on' : ''}" data-action="do-switch" data-id="${member.id}">
          <div class="member-avatar">${member.avatar || '🧑'}</div>
          <div class="grow">
            <div class="member-name">${esc(member.nickname)}</div>
            <div class="member-sub">${member.role === 'admin' ? '管理员' : member.role === 'cook' ? '做饭人' : '成员'} · ${esc(member.phone || '')}</div>
          </div>
          <span class="check-dot"></span>
        </button>`
        )
        .join('')}
    </div>`);
}

function confirmModal(m) {
  return sheet(`
    <div class="sheet-head">
      <div><h2>${esc(m.title || '确认操作')}</h2></div>
      <button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>
    </div>
    <p class="confirm-text">${esc(m.text || '')}</p>
    <div class="dialog-actions">
      <button class="btn ghost" data-action="close-modal">取消</button>
      <button class="btn primary" data-action="confirm-yes">${esc(m.okText || '确定')}</button>
    </div>`);
}

/* ================= 推荐逻辑 ================= */
function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function recommendDishes() {
  const me = state.member;
  const today = todayISO();
  const todayIds = new Set(state.menuItems.filter((m) => m.date === today).map((m) => m.dishId));
  let pool = state.dishes.filter((d) => !todayIds.has(d.id));
  pool = pool.filter((d) => conflicts(me, d).length === 0);
  if (ui.recMaxMin) pool = pool.filter((d) => Number(d.durationMin || 0) <= ui.recMaxMin);
  const liked = new Set(me.tasteTags || []);
  const score = (d) => (d.tasteTags || []).filter((t) => liked.has(t)).length;
  pool = shuffle(pool);
  pool.sort((a, b) => score(b) - score(a));
  return pool.slice(0, 3);
}

/* ================= 交互动作 ================= */
async function generateShoppingFor(kind) {
  const start = kind === 'today' ? todayISO() : ui.weekStart;
  const end = kind === 'today' ? todayISO() : addDays(ui.weekStart, 6);
  const count = await generateShopping(start, end);
  ui.tab = 'shopping';
  render();
  window.scrollTo({ top: 0 });
  toast(`已汇总 ${count} 种食材`);
}

function repeatTip(dishId, date) {
  const start = weekStartISO(date);
  const end = addDays(start, 6);
  const count = state.menuItems.filter(
    (m) => m.dishId === dishId && m.date >= start && m.date <= end
  ).length;
  return count > 1 ? `已加入，本周第 ${count} 次安排这道菜` : '已加入菜单';
}

async function addDishToMeal(date, meal, dishId) {
  await addMenu({ date, meal, dishId });
  const tip = repeatTip(dishId, date);
  closeModal();
  toast(tip);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;

  if (action === 'close-modal') {
    if (el.classList.contains('modal-overlay') && e.target !== el) return;
    closeModal();
    return;
  }

  switch (action) {
    case 'tab':
      ui.tab = el.dataset.tab;
      render();
      window.scrollTo({ top: 0 });
      break;

    /* 登录 */
    case 'login-mode':
      ui.loginMode = el.dataset.mode;
      render();
      break;
    case 'login-avatar': {
      ui.loginAvatar = el.dataset.avatar;
      el.parentElement.querySelectorAll('.avatar-opt').forEach((b) => b.classList.remove('on'));
      el.classList.add('on');
      break;
    }
    case 'send-code':
      startCountdown(el);
      break;

    /* 菜单 */
    case 'pick':
      ui.pickSearch = '';
      openModal({ type: 'pick', date: el.dataset.date, meal: el.dataset.meal });
      break;
    case 'pick-dish':
      run(() => addDishToMeal(ui.modal.date, ui.modal.meal, id));
      break;
    case 'quick-add-dish': {
      const date = el.dataset.date;
      const meal = el.dataset.meal;
      ui.imageDraft = '';
      openModal({ type: 'dishForm', pendingSchedule: { date, meal } });
      break;
    }
    case 'vote':
      run(() => toggleVote(id));
      break;
    case 'confirm':
      run(async () => {
        await setStatus(id, 'confirmed');
        toast('这道菜已确认');
      });
      break;
    case 'done':
      run(async () => {
        await setStatus(id, 'done');
        toast('已标记为已做，记得给这道菜评分');
      });
      break;
    case 'remove-menu': {
      const item = state.menuItems.find((i) => i.id === id);
      const dish = item ? dishById(item.dishId) : null;
      askConfirm(`把「${dish?.name || '这道菜'}」移出这一餐？`, () => removeMenu(id), '移出');
      break;
    }
    case 'set-cook':
      openModal({ type: 'cook', date: el.dataset.date, meal: el.dataset.meal });
      break;
    case 'choose-cook':
      run(async () => {
        await setMealCook(el.dataset.date, el.dataset.meal, el.dataset.id || null);
        closeModal();
        toast('做饭人已更新');
      });
      break;
    case 'random':
      ui.recMaxMin = 0;
      openModal({ type: 'recommend' });
      break;
    case 'rec-refresh':
      refreshModal();
      break;
    case 'rec-add':
      run(() => addDishToMeal(todayISO(), el.dataset.meal, id));
      break;
    case 'goto-week':
      ui.tab = 'week';
      render();
      window.scrollTo({ top: 0 });
      break;
    case 'week-prev':
      ui.weekStart = addDays(ui.weekStart, -7);
      render();
      break;
    case 'week-next':
      ui.weekStart = addDays(ui.weekStart, 7);
      render();
      break;
    case 'week-today':
      ui.weekStart = weekStartISO(todayISO());
      render();
      break;

    /* 菜品库 */
    case 'dish-detail':
      ui.rateScore = 5;
      openModal({ type: 'dishDetail', dishId: id });
      break;
    case 'fav':
      run(() => toggleFavorite(id));
      break;
    case 'add-dish':
      ui.imageDraft = '';
      openModal({ type: 'dishForm' });
      break;
    case 'edit-dish':
      ui.imageDraft = dishById(id)?.imageUrl || '';
      openModal({ type: 'dishForm', dishId: id });
      break;
    case 'clear-image': {
      ui.imageDraft = '';
      const box = document.getElementById('dish-image-preview');
      if (box) box.innerHTML = imagePreview('');
      const urlInput = document.getElementById('dish-image-url');
      if (urlInput) urlInput.value = '';
      const fileInput = document.getElementById('dish-image-input');
      if (fileInput) fileInput.value = '';
      break;
    }
    case 'delete-dish': {
      const dish = dishById(id);
      askConfirm(
        `删除「${dish?.name || '这道菜'}」后，相关菜单安排与评分也会一并删除，确定吗？`,
        () => deleteDish(id),
        '删除'
      );
      break;
    }
    case 'seed-demo':
      run(() => {
        const n = seedDemoDishes();
        toast(n ? `已载入 ${n} 道示例菜品` : '示例菜品已存在');
      });
      break;
    case 'toggle-fav':
      ui.favOnly = !ui.favOnly;
      render();
      break;
    case 'set-category':
      ui.category = el.dataset.cat;
      render();
      break;
    case 'add-ing': {
      const rows = document.getElementById('ing-rows');
      if (rows) rows.insertAdjacentHTML('beforeend', ingRow());
      break;
    }
    case 'add-link': {
      const rows = document.getElementById('link-rows');
      if (rows) rows.insertAdjacentHTML('beforeend', linkEditRow());
      break;
    }
    case 'del-row': {
      const row = el.closest('.ing-row') || el.closest('.link-edit');
      row?.remove();
      break;
    }
    case 'rate-star': {
      const score = Number(el.dataset.score);
      ui.rateScore = score;
      const wrap = el.closest('.stars-input');
      if (wrap) {
        wrap.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('on', Number(b.dataset.score) <= score);
        });
      }
      break;
    }
    case 'submit-rate':
      run(async () => {
        const comment = document.getElementById('rate-comment')?.value || '';
        await rateDish(id, ui.rateScore, comment);
        ui.rateScore = 5;
        toast('评价已保存');
        refreshModal();
      });
      break;
    case 'schedule-dish':
      openModal({ type: 'schedule', dishId: id });
      break;
    case 'open-link':
      openLink(el.dataset.url, el.dataset.platform);
      break;
    case 'copy-link':
      run(async () => {
        const ok = await copyText(el.dataset.url);
        toast(ok ? '链接已复制，可粘贴到浏览器或对应 App' : '复制失败，请长按链接复制');
      });
      break;

    /* 采购 */
    case 'toggle-shop':
      run(() => toggleShopping(id));
      break;
    case 'add-shop':
      openModal({ type: 'shopForm' });
      break;
    case 'edit-shop':
      openModal({ type: 'shopForm', itemId: id });
      break;
    case 'del-shop':
      run(async () => {
        const item = state.shopping.find((s) => s.id === id);
        askConfirm(`删除采购条目「${item?.ingredient || ''}」？`, () => removeShopping(id), '删除');
      });
      break;
    case 'clear-bought':
      askConfirm('清空所有已买条目？未买的条目会保留。', () => clearBought(), '清空');
      break;
    case 'generate-today':
      run(() => generateShoppingFor('today'));
      break;
    case 'generate-week':
      run(() => generateShoppingFor('week'));
      break;

    /* 我的 */
    case 'edit-me':
      openModal({ type: 'memberForm', memberId: state.member.id });
      break;
    case 'edit-member':
      openModal({ type: 'memberForm', memberId: id });
      break;
    case 'del-member': {
      const member = memberById(id);
      askConfirm(`把「${member?.nickname || '该成员'}」移出家庭？`, () => removeMember(id), '移出');
      break;
    }
    case 'copy-invite':
      run(async () => {
        const ok = await copyText(state.family.inviteCode);
        toast(ok ? '邀请码已复制，发给家人即可加入' : '复制失败');
      });
      break;
    case 'switch-demo':
      openModal({ type: 'switch' });
      break;
    case 'do-switch':
      switchMember(id);
      closeModal();
      toast(`已切换为 ${memberName(id)}`);
      break;
    case 'logout':
      askConfirm('退出后可以用邀请码重新加入家庭，确定退出吗？', () => logout(), '退出');
      break;

    /* 确认弹层 */
    case 'confirm-yes': {
      const fn = ui.modal?.onConfirm;
      closeModal();
      run(fn);
      break;
    }
    default:
      break;
  }
});

/* ================= 表单提交 ================= */
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  if (kind === 'login') submitLogin(form);
  else if (kind === 'dish') submitDish(form);
  else if (kind === 'member') submitMember(form);
  else if (kind === 'shop') submitShop(form);
  else if (kind === 'schedule') submitSchedule(form);
});

async function submitLogin(form) {
  const fd = new FormData(form);
  const code = String(fd.get('code') || '').trim();
  if (code !== CONFIG.DEMO_CODE) {
    toast('验证码不正确（演示验证码 123456）');
    return;
  }
  try {
    await login({
      mode: ui.loginMode,
      familyName: fd.get('familyName'),
      inviteCode: fd.get('inviteCode'),
      nickname: fd.get('nickname'),
      phone: fd.get('phone'),
      avatar: ui.loginAvatar,
    });
    toast('欢迎回家');
  } catch (err) {
    console.error(err);
    toast(err?.message || '登录失败，请重试');
  }
}

function submitDish(form) {
  run(async () => {
    const ings = [...form.querySelectorAll('.ing-row')]
      .map((row) => ({
        name: row.querySelector('[name="ingName"]').value.trim(),
        amount: row.querySelector('[name="ingAmount"]').value.trim(),
      }))
      .filter((i) => i.name);
    const links = [...form.querySelectorAll('.link-edit')]
      .map((row) => ({
        platform: row.querySelector('[name="linkPlatform"]').value,
        title: row.querySelector('[name="linkTitle"]').value.trim(),
        url: row.querySelector('[name="linkUrl"]').value.trim(),
      }))
      .filter((l) => l.url);
    const tasteTags = [...form.querySelectorAll('input[name="taste"]:checked')].map(
      (i) => i.value
    );
    const urlValue = (form.querySelector('[name="imageUrl"]')?.value || '').trim();
    const imageUrl = /^https?:\/\//i.test(urlValue) ? urlValue : ui.imageDraft;
    const payload = {
      name: form.querySelector('[name="name"]').value.trim(),
      category: form.querySelector('[name="category"]').value,
      difficulty: form.querySelector('[name="difficulty"]').value,
      durationMin: form.querySelector('[name="durationMin"]').value,
      tasteTags,
      ingredients: ings,
      steps: form.querySelector('[name="steps"]').value,
      links,
      imageUrl,
    };
    if (!payload.name) throw new Error('菜名必填');
    const editingId = form.dataset.id || null;
    const pending = ui.modal?.pendingSchedule || null;
    const dish = await saveDish(payload, editingId);
    if (pending) {
      await addMenu({ date: pending.date, meal: pending.meal, dishId: dish.id });
    }
    closeModal();
    if (pending) toast(repeatTip(dish.id, pending.date));
    else toast(editingId ? '菜品已更新' : '菜品已添加');
  });
}

function submitMember(form) {
  run(async () => {
    const fd = new FormData(form);
    const split = (text) =>
      String(text || '')
        .split(/[,，、\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const patch = {
      nickname: String(fd.get('nickname') || '').trim(),
      avatar: fd.get('avatar') || '🧑',
      allergies: split(fd.get('allergies')),
      tasteTags: [...form.querySelectorAll('input[name="taste"]:checked')].map((i) => i.value),
      dislikedFoods: split(fd.get('disliked')),
    };
    if (fd.get('role')) patch.role = fd.get('role');
    await updateMember(form.dataset.id, patch);
    closeModal();
    toast('资料已保存');
  });
}

function submitShop(form) {
  run(async () => {
    const fd = new FormData(form);
    const ingredient = String(fd.get('ingredient') || '').trim();
    const amount = String(fd.get('amount') || '').trim();
    if (!ingredient) throw new Error('食材名必填');
    const itemId = form.dataset.id;
    if (itemId) await updateShopping(itemId, { ingredient, amount });
    else await addShoppingItem({ ingredient, amount });
    closeModal();
    toast(itemId ? '条目已更新' : '已添加到清单');
  });
}

function submitSchedule(form) {
  run(async () => {
    const fd = new FormData(form);
    const date = fd.get('date');
    const meal = fd.get('meal');
    await addDishToMeal(date, meal, form.dataset.id);
  });
}

/* ================= 其它事件 ================= */
document.addEventListener('input', (e) => {
  if (e.target.id === 'dish-search') {
    ui.search = e.target.value;
    const grid = document.getElementById('dish-grid');
    if (grid) grid.innerHTML = dishGrid();
  } else if (e.target.id === 'pick-search') {
    ui.pickSearch = e.target.value;
    const list = document.getElementById('pick-list');
    if (list) list.innerHTML = pickList();
  }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  if (el.dataset.change === 'sort') {
    ui.sort = el.value;
    render();
  } else if (el.dataset.change === 'rec-max') {
    ui.recMaxMin = Number(el.value);
    refreshModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.modal) closeModal();
});

/* ================= 辅助流程 ================= */
function startCountdown(button) {
  if (ui.loginCountdown > 0) return;
  toast('验证码已发送（演示验证码 123456）');
  ui.loginCountdown = 60;
  button.disabled = true;
  const tick = () => {
    const btn = document.getElementById('send-code');
    if (!btn) return;
    if (ui.loginCountdown <= 0) {
      btn.disabled = false;
      btn.textContent = '重新获取';
      return;
    }
    btn.textContent = `${ui.loginCountdown}s 后重试`;
    ui.loginCountdown -= 1;
  };
  tick();
  const timer = setInterval(() => {
    if (ui.loginCountdown <= 0 || !document.getElementById('send-code')) {
      clearInterval(timer);
      tick();
      return;
    }
    tick();
  }, 1000);
}

function openLink(url, platform) {
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    run(async () => {
      const ok = await copyText(url);
      toast(ok ? '已复制链接，请到浏览器中打开' : '打开失败，请长按链接复制');
    });
    return;
  }
  if (platform === '抖音' || platform === '小红书') {
    toast('已尝试打开链接，也可复制到对应 App 打开');
  }
}

/* ================= 启动 ================= */
subscribe(render);
render();
init();
