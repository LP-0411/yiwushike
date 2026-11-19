import { CONFIG, supabaseEnabled } from './config.js';

/* ================= 常量 ================= */
export const CATEGORIES = ['荤菜', '素菜', '汤', '主食', '早餐', '快手菜'];
export const TASTE_TAGS = ['清淡', '偏辣', '酸甜', '鲜咸', '香辣', '重口'];
export const MEALS = [
  { key: 'breakfast', label: '早餐', short: '早' },
  { key: 'lunch', label: '午餐', short: '午' },
  { key: 'dinner', label: '晚餐', short: '晚' },
];
export const LINK_PLATFORMS = ['抖音', '小红书', '下厨房', '其他'];
export const AVATARS = ['👩', '👨', '🧑', '👵', '👴', '👧', '👦', '🧑‍🍳'];

const LS_STATE = 'familyDishApp:state:v1';
const LS_SESSION = 'familyDishApp:session:v1';
const listeners = new Set();

/* ================= 状态 ================= */
export const state = {
  ready: false,
  mode: supabaseEnabled() ? 'supabase' : 'local', // local | supabase
  syncStatus: 'local', // local | syncing | synced | error | offline
  family: null,
  member: null,
  members: [],
  dishes: [],
  menuItems: [],
  shopping: [],
  ratings: [],
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) fn();
}

/* ================= 工具函数 ================= */
export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function genInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[(Math.random() * chars.length) | 0];
  return out;
}

export function todayISO() {
  return fmtISO(new Date());
}
export function fmtISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return fmtISO(d);
}
export function weekStartISO(iso) {
  const d = parseISO(iso);
  const offset = (d.getDay() + 6) % 7; // 周一为一周开始
  d.setDate(d.getDate() - offset);
  return fmtISO(d);
}
export function weekdayLabel(iso) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseISO(iso).getDay()];
}
export function dateLabel(iso) {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
export function isToday(iso) {
  return iso === todayISO();
}

/* ================= 查询辅助 ================= */
export function dishById(id) {
  return state.dishes.find((d) => d.id === id) || null;
}
export function memberById(id) {
  return state.members.find((m) => m.id === id) || null;
}
export function memberName(id) {
  return memberById(id)?.nickname || '某位家人';
}
export function ratingsFor(dishId) {
  return state.ratings
    .filter((r) => r.dishId === dishId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
export function avgRating(dishId) {
  const list = state.ratings.filter((r) => r.dishId === dishId);
  if (!list.length) return null;
  const avg = list.reduce((sum, r) => sum + Number(r.score || 0), 0) / list.length;
  return Math.round(avg * 10) / 10;
}
export function canManage(item) {
  const me = state.member;
  if (!me || !item) return false;
  return me.role === 'admin' || item.cookMemberId === me.id;
}
export function mealCook(date, meal) {
  const item = state.menuItems.find(
    (i) => i.date === date && i.meal === meal && i.cookMemberId
  );
  return item ? memberById(item.cookMemberId) : null;
}
/** 当前成员与菜品的忌口冲突，返回命中的食材/标签 */
export function conflicts(member, dish) {
  if (!member || !dish) return [];
  const bad = [...(member.allergies || []), ...(member.dislikedFoods || [])]
    .map((x) => String(x).trim())
    .filter(Boolean);
  if (!bad.length) return [];
  const haystack = [dish.name, ...(dish.ingredients || []).map((i) => i.name)]
    .filter(Boolean)
    .map((s) => String(s));
  const hits = new Set();
  for (const word of bad) {
    for (const text of haystack) {
      if (text.includes(word) || word.includes(text)) hits.add(word);
    }
  }
  return [...hits];
}
export function syncLabel() {
  switch (state.syncStatus) {
    case 'synced':
      return { text: '云端已同步', cls: 'ok' };
    case 'syncing':
      return { text: '同步中…', cls: 'syncing' };
    case 'error':
      return { text: '同步失败', cls: 'error' };
    case 'offline':
      return { text: '本地模式', cls: 'error' };
    default:
      return { text: '本地演示', cls: '' };
  }
}

/* ================= 持久化（本地） ================= */
function persistLocal() {
  try {
    localStorage.setItem(
      LS_STATE,
      JSON.stringify({
        family: state.family,
        members: state.members,
        dishes: state.dishes,
        menuItems: state.menuItems,
        shopping: state.shopping,
        ratings: state.ratings,
      })
    );
    localStorage.setItem(
      LS_SESSION,
      JSON.stringify({
        familyId: state.family?.id || null,
        memberId: state.member?.id || null,
      })
    );
  } catch (e) {
    console.warn('[local] 写入失败', e);
  }
}
function readSession() {
  try {
    return JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
  } catch {
    return null;
  }
}
function restoreLocal() {
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (raw) {
      const data = JSON.parse(raw);
      state.family = data.family || null;
      state.members = data.members || [];
      state.dishes = data.dishes || [];
      state.menuItems = data.menuItems || [];
      state.shopping = data.shopping || [];
      state.ratings = data.ratings || [];
    }
    const session = readSession();
    if (session?.memberId) {
      state.member = state.members.find((m) => m.id === session.memberId) || null;
    }
  } catch (e) {
    console.warn('[local] 读取失败', e);
  }
}

/* ================= Supabase ================= */
let sb = null;
let reloadTimer = null;

async function initSupabaseClient() {
  if (!supabaseEnabled()) return false;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = mod.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      const { error } = await sb.auth.signInAnonymously();
      if (error) throw error;
    }
    state.mode = 'supabase';
    return true;
  } catch (err) {
    console.warn('[supabase] 初始化失败，回退本地模式', err);
    state.mode = 'local';
    state.syncStatus = 'offline';
    return false;
  }
}

async function restoreSupabase() {
  const { data } = await sb.auth.getUser();
  const user = data?.user;
  if (!user) return;
  const { data: rows, error } = await sb
    .from('members')
    .select('*')
    .eq('user_id', user.id)
    .limit(1);
  if (error) throw error;
  if (rows && rows.length) {
    await loadFamily(rows[0].family_id, rows[0].id);
    watchRealtime();
  }
}

async function loadFamily(familyId, memberId) {
  state.syncStatus = 'syncing';
  emit();
  const results = await Promise.all([
    sb.from('families').select('*').eq('id', familyId).single(),
    sb.from('members').select('*').eq('family_id', familyId),
    sb.from('dishes').select('*').eq('family_id', familyId),
    sb.from('menu_items').select('*').eq('family_id', familyId),
    sb.from('shopping_items').select('*').eq('family_id', familyId),
    sb.from('ratings').select('*').eq('family_id', familyId),
  ]);
  const failed = results.find((r) => r.error);
  if (failed) {
    console.warn('[supabase] 拉取数据失败', failed.error);
    state.syncStatus = 'error';
    emit();
    return;
  }
  const [famRes, memRes, dishRes, menuRes, shopRes, rateRes] = results;
  state.family = mapFamily(famRes.data);
  state.members = (memRes.data || []).map(mapMember);
  state.dishes = (dishRes.data || []).map(mapDish);
  state.menuItems = (menuRes.data || []).map(mapMenu);
  state.shopping = (shopRes.data || []).map(mapShop);
  state.ratings = (rateRes.data || []).map(mapRating);
  state.member = state.members.find((m) => m.id === memberId) || null;
  state.syncStatus = 'synced';
  persistLocal();
  emit();
}

function watchRealtime() {
  if (!sb || !state.family) return;
  const familyId = state.family.id;
  clearTimeout(reloadTimer);
  try {
    const channel = sb.channel('family-data');
    ['members', 'dishes', 'menu_items', 'shopping_items', 'ratings'].forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `family_id=eq.${familyId}` },
        scheduleReload
      );
    });
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'families', filter: `id=eq.${familyId}` },
      scheduleReload
    );
    channel.subscribe();
  } catch (e) {
    console.warn('[supabase] realtime 订阅失败', e);
  }
}

function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    if (state.family && state.member) loadFamily(state.family.id, state.member.id);
  }, 600);
}

/* 行映射 */
const mapFamily = (r) => ({
  id: r.id,
  name: r.name,
  inviteCode: r.invite_code,
  createdAt: new Date(r.created_at || Date.now()).getTime(),
});
const mapMember = (r) => ({
  id: r.id,
  familyId: r.family_id,
  userId: r.user_id,
  nickname: r.nickname,
  avatar: r.avatar || '🧑',
  phone: r.phone || '',
  role: r.role || 'member',
  allergies: r.allergies || [],
  tasteTags: r.taste_tags || [],
  dislikedFoods: r.disliked_foods || [],
  createdAt: new Date(r.created_at || Date.now()).getTime(),
});
const mapDish = (r) => ({
  id: r.id,
  familyId: r.family_id,
  name: r.name,
  category: r.category,
  ingredients: r.ingredients || [],
  steps: r.steps || '',
  difficulty: r.difficulty,
  durationMin: r.duration_min || 0,
  tasteTags: r.taste_tags || [],
  links: r.links || [],
  imageUrl: r.image_url || '',
  favoriteBy: r.favorite_by || [],
  cookedCount: r.cooked_count || 0,
  createdBy: r.created_by,
  createdAt: new Date(r.created_at || Date.now()).getTime(),
});
const mapMenu = (r) => ({
  id: r.id,
  familyId: r.family_id,
  date: r.date,
  meal: r.meal,
  dishId: r.dish_id,
  status: r.status,
  cookMemberId: r.cook_member_id,
  votes: r.votes || [],
  createdBy: r.created_by,
  createdAt: new Date(r.created_at || Date.now()).getTime(),
});
const mapShop = (r) => ({
  id: r.id,
  familyId: r.family_id,
  ingredient: r.ingredient,
  amount: r.amount || '',
  fromDishId: r.from_dish_id,
  fromDishName: r.from_dish_name || '',
  checked: !!r.checked,
  manual: !!r.manual,
  updatedAt: new Date(r.updated_at || Date.now()).getTime(),
});
const mapRating = (r) => ({
  id: r.id,
  familyId: r.family_id,
  dishId: r.dish_id,
  memberId: r.member_id,
  score: r.score,
  comment: r.comment || '',
  createdAt: new Date(r.created_at || Date.now()).getTime(),
});

const toFamilyRow = (f) => ({ id: f.id, name: f.name, invite_code: f.inviteCode });
const toMemberRow = (m) => ({
  id: m.id,
  family_id: m.familyId,
  user_id: m.userId || null,
  nickname: m.nickname,
  avatar: m.avatar,
  phone: m.phone || '',
  role: m.role,
  allergies: m.allergies || [],
  taste_tags: m.tasteTags || [],
  disliked_foods: m.dislikedFoods || [],
});
const toDishRow = (d) => ({
  id: d.id,
  family_id: d.familyId,
  name: d.name,
  category: d.category,
  ingredients: d.ingredients || [],
  steps: d.steps || '',
  difficulty: d.difficulty,
  duration_min: d.durationMin || 0,
  taste_tags: d.tasteTags || [],
  links: d.links || [],
  image_url: d.imageUrl || '',
  favorite_by: d.favoriteBy || [],
  cooked_count: d.cookedCount || 0,
  created_by: d.createdBy || null,
  created_at: new Date(d.createdAt || Date.now()).toISOString(),
});
const toMenuRow = (i) => ({
  id: i.id,
  family_id: i.familyId,
  date: i.date,
  meal: i.meal,
  dish_id: i.dishId,
  status: i.status,
  cook_member_id: i.cookMemberId || null,
  votes: i.votes || [],
  created_by: i.createdBy || null,
});
const toShopRow = (s) => ({
  id: s.id,
  family_id: s.familyId,
  ingredient: s.ingredient,
  amount: s.amount || '',
  from_dish_id: s.fromDishId || null,
  from_dish_name: s.fromDishName || '',
  checked: !!s.checked,
  manual: !!s.manual,
  updated_at: new Date(s.updatedAt || Date.now()).toISOString(),
});
const toRatingRow = (r) => ({
  id: r.id,
  family_id: r.familyId,
  dish_id: r.dishId,
  member_id: r.memberId,
  score: r.score,
  comment: r.comment || '',
  created_at: new Date(r.createdAt || Date.now()).toISOString(),
});

async function sbWrite(table, kind, payload) {
  if (state.mode !== 'supabase' || !sb) return true;
  state.syncStatus = 'syncing';
  emit();
  try {
    let query;
    if (kind === 'insert') query = sb.from(table).insert(payload);
    else if (kind === 'upsert') query = sb.from(table).upsert(payload);
    else if (kind === 'update') query = sb.from(table).update(payload.values).eq('id', payload.id);
    else if (kind === 'delete') query = sb.from(table).delete().eq('id', payload);
    else if (kind === 'deleteAutoShopping')
      query = sb.from(table).delete().eq('family_id', payload).eq('manual', false);
    else if (kind === 'deleteChecked')
      query = sb.from(table).delete().eq('family_id', payload).eq('checked', true);
    if (!query) throw new Error(`未知写入类型 ${kind}`);
    const { error } = await query;
    if (error) throw error;
    state.syncStatus = 'synced';
    return true;
  } catch (err) {
    console.error('[supabase] 写入失败', table, err);
    state.syncStatus = 'error';
    return false;
  } finally {
    emit();
  }
}

/* ================= 初始化 ================= */
export async function init() {
  try {
    const useCloud = await initSupabaseClient();
    if (useCloud) {
      await restoreSupabase();
    } else {
      restoreLocal();
    }
  } catch (err) {
    console.error('[app] 初始化失败', err);
    state.syncStatus = 'error';
    restoreLocal();
  }
  state.ready = true;
  emit();
}

/* ================= 登录 / 成员 ================= */
export async function login({ mode, familyName, inviteCode, nickname, phone, avatar }) {
  nickname = String(nickname || '').trim();
  phone = String(phone || '').trim();
  if (!/^1\d{10}$/.test(phone)) throw new Error('请输入 11 位手机号');
  if (!nickname) throw new Error('请填写昵称');
  avatar = avatar || '🧑';
  if (state.mode === 'supabase') {
    return loginSupabase({ mode, familyName, inviteCode, nickname, phone, avatar });
  }
  if (mode === 'create') {
    const family = {
      id: uid(),
      name: String(familyName || '').trim() || `${nickname}的家`,
      inviteCode: genInviteCode(),
      createdAt: Date.now(),
    };
    const member = makeMember({
      familyId: family.id,
      nickname,
      phone,
      avatar,
      role: 'admin',
    });
    state.family = family;
    state.members = [member];
    state.member = member;
    state.dishes = [];
    state.menuItems = [];
    state.shopping = [];
    state.ratings = [];
    seedDemoDishes();
    persistLocal();
    emit();
    return;
  }
  // 本地模式下加入家庭
  const code = String(inviteCode || '').trim().toUpperCase();
  if (!state.family) throw new Error('本机还没有家庭，请先创建一个家庭');
  if (state.family.inviteCode !== code) throw new Error('邀请码不正确');
  const existing = state.members.find((m) => m.phone === phone);
  state.member =
    existing ||
    makeMember({
      familyId: state.family.id,
      nickname,
      phone,
      avatar,
      role: 'member',
    });
  if (!existing) state.members.push(state.member);
  persistLocal();
  emit();
}

async function loginSupabase({ mode, familyName, inviteCode, nickname, phone, avatar }) {
  if (!sb) throw new Error('云端未连接，请检查配置');
  const { data } = await sb.auth.getUser();
  const user = data?.user;
  if (!user) throw new Error('登录状态失效，请刷新页面重试');
  let familyId;
  let memberId;

  if (mode === 'create') {
    const family = {
      id: uid(),
      name: String(familyName || '').trim() || `${nickname}的家`,
      invite_code: genInviteCode(),
    };
    const { error: fErr } = await sb.from('families').insert(family);
    if (fErr) throw new Error(fErr.message);
    familyId = family.id;
    memberId = uid();
    const { error: mErr } = await sb.from('members').insert({
      id: memberId,
      family_id: familyId,
      user_id: user.id,
      nickname,
      avatar,
      phone,
      role: 'admin',
      allergies: [],
      taste_tags: [],
      disliked_foods: [],
    });
    if (mErr) throw new Error(mErr.message);
  } else {
    const code = String(inviteCode || '').trim().toUpperCase();
    const { data: fams, error } = await sb
      .from('families')
      .select('*')
      .eq('invite_code', code)
      .limit(1);
    if (error) throw new Error(error.message);
    if (!fams || !fams.length) throw new Error('邀请码不存在，请核对后重试');
    familyId = fams[0].id;
    memberId = uid();
    const { error: mErr } = await sb.from('members').insert({
      id: memberId,
      family_id: familyId,
      user_id: user.id,
      nickname,
      avatar,
      phone,
      role: 'member',
      allergies: [],
      taste_tags: [],
      disliked_foods: [],
    });
    if (mErr) throw new Error(mErr.message);
  }
  await loadFamily(familyId, memberId);
  watchRealtime();
}

function makeMember({ familyId, nickname, phone, avatar, role }) {
  return {
    id: uid(),
    familyId,
    userId: null,
    nickname,
    phone,
    avatar,
    role,
    allergies: [],
    tasteTags: [],
    dislikedFoods: [],
    createdAt: Date.now(),
  };
}

export async function logout() {
  if (state.mode === 'supabase' && sb) {
    try {
      await sb.auth.signOut();
    } catch (e) {
      console.warn(e);
    }
  }
  state.member = null;
  state.family = null;
  state.members = [];
  state.dishes = [];
  state.menuItems = [];
  state.shopping = [];
  state.ratings = [];
  localStorage.removeItem(LS_SESSION);
  emit();
}

export function switchMember(memberId) {
  if (state.mode !== 'local') return;
  const m = memberById(memberId);
  if (!m) return;
  state.member = m;
  persistLocal();
  emit();
}

export async function updateMember(memberId, patch) {
  const me = state.member;
  const target = memberById(memberId);
  if (!me || !target) throw new Error('成员不存在');
  if (me.id !== memberId && me.role !== 'admin') throw new Error('无权限编辑该成员');
  const clean = { ...patch };
  if (clean.role && me.role !== 'admin') delete clean.role;
  if (clean.nickname !== undefined && !String(clean.nickname).trim())
    throw new Error('昵称不能为空');
  Object.assign(target, clean);
  persistLocal();
  emit();
  if (state.mode === 'supabase') {
    const ok = await sbWrite('members', 'update', { id: target.id, values: toMemberRow(target) });
    if (!ok) throw new Error('云端保存失败，请检查网络后重试');
  }
}

export async function removeMember(memberId) {
  const me = state.member;
  if (!me || me.role !== 'admin') throw new Error('仅管理员可移除成员');
  if (memberId === me.id) throw new Error('不能移除自己');
  state.members = state.members.filter((m) => m.id !== memberId);
  state.ratings = state.ratings.filter((r) => r.memberId !== memberId);
  state.menuItems.forEach((i) => {
    i.votes = (i.votes || []).filter((v) => v !== memberId);
    if (i.cookMemberId === memberId) i.cookMemberId = null;
  });
  persistLocal();
  emit();
  if (state.mode === 'supabase') await sbWrite('members', 'delete', memberId);
}

/* ================= 菜品 ================= */
export async function saveDish(input, editingId) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('菜名必填');
  const links = (input.links || []).filter((l) => l.url);
  for (const l of links) {
    if (!/^https?:\/\/.+/i.test(l.url)) throw new Error('教程链接需以 http:// 或 https:// 开头');
  }
  let imageUrl = String(input.imageUrl || '').trim();
  if (imageUrl && !/^(https?:\/\/|data:image\/)/i.test(imageUrl)) {
    throw new Error('图片链接需以 http(s):// 开头，或直接上传图片');
  }
  const dishId = editingId || uid();
  if (imageUrl.startsWith('data:image/') && state.mode === 'supabase') {
    imageUrl = await uploadDishImage(imageUrl, dishId);
  }
  const base = {
    name,
    category: input.category || '荤菜',
    ingredients: input.ingredients || [],
    steps: input.steps || '',
    difficulty: input.difficulty || '简单',
    durationMin: Number(input.durationMin) || 0,
    tasteTags: input.tasteTags || [],
    links,
    imageUrl,
  };
  let dish;
  if (editingId) {
    dish = dishById(editingId);
    if (!dish) throw new Error('菜品不存在');
    Object.assign(dish, base);
    persistLocal();
    emit();
    if (state.mode === 'supabase') {
      const ok = await sbWrite('dishes', 'update', { id: dish.id, values: toDishRow(dish) });
      if (!ok) throw new Error('云端保存失败，请检查网络后重试');
    }
  } else {
    dish = {
      id: dishId,
      familyId: state.family.id,
      ...base,
      favoriteBy: [],
      cookedCount: 0,
      createdBy: state.member.id,
      createdAt: Date.now(),
    };
    state.dishes.push(dish);
    persistLocal();
    emit();
    if (state.mode === 'supabase') {
      const ok = await sbWrite('dishes', 'insert', toDishRow(dish));
      if (!ok) throw new Error('云端保存失败，请检查网络后重试');
    }
  }
  return dish;
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl).split(',');
  const mimeMatch = parts[0].match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(parts[1] || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadDishImage(dataUrl, dishId) {
  if (!sb) throw new Error('云端未连接，无法上传图片');
  try {
    const blob = dataUrlToBlob(dataUrl);
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `${state.family.id}/${dishId}-${Date.now()}.${ext}`;
    const { error } = await sb.storage
      .from('dish-images')
      .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data } = sb.storage.from('dish-images').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('[supabase] 图片上传失败', err);
    const msg = String(err?.message || '');
    if (/bucket/i.test(msg)) {
      throw new Error('图片存储桶不存在：请先执行 supabase/migrations/002_dish_images.sql');
    }
    throw new Error(`图片上传失败：${msg || '未知错误'}`);
  }
}

export async function deleteDish(dishId) {
  const dish = dishById(dishId);
  const me = state.member;
  if (!dish || !me) return;
  if (!(me.role === 'admin' || dish.createdBy === me.id))
    throw new Error('仅管理员或创建人可删除');
  state.dishes = state.dishes.filter((d) => d.id !== dishId);
  state.menuItems = state.menuItems.filter((m) => m.dishId !== dishId);
  state.ratings = state.ratings.filter((r) => r.dishId !== dishId);
  persistLocal();
  emit();
  if (state.mode === 'supabase') await sbWrite('dishes', 'delete', dishId);
}

export async function toggleFavorite(dishId) {
  const dish = dishById(dishId);
  const me = state.member;
  if (!dish || !me) return;
  dish.favoriteBy = dish.favoriteBy || [];
  const idx = dish.favoriteBy.indexOf(me.id);
  if (idx >= 0) dish.favoriteBy.splice(idx, 1);
  else dish.favoriteBy.push(me.id);
  persistLocal();
  emit();
  if (state.mode === 'supabase')
    await sbWrite('dishes', 'update', {
      id: dish.id,
      values: { favorite_by: dish.favoriteBy },
    });
}

/* ================= 菜单 / 点菜 ================= */
export async function addMenu({ date, meal, dishId }) {
  if (!state.family) return null;
  const dish = dishById(dishId);
  if (!dish) throw new Error('菜品不存在');
  const dup = state.menuItems.find(
    (m) => m.date === date && m.meal === meal && m.dishId === dishId
  );
  if (dup) throw new Error('这一餐已经点过这道菜了');
  const siblings = state.menuItems.filter((i) => i.date === date && i.meal === meal);
  const cookMemberId = siblings.find((i) => i.cookMemberId)?.cookMemberId || null;
  const item = {
    id: uid(),
    familyId: state.family.id,
    date,
    meal,
    dishId,
    status: 'pending',
    cookMemberId,
    votes: [],
    createdBy: state.member.id,
    createdAt: Date.now(),
  };
  state.menuItems.push(item);
  persistLocal();
  emit();
  if (state.mode === 'supabase') await sbWrite('menu_items', 'insert', toMenuRow(item));
  return item;
}

export async function removeMenu(itemId) {
  const item = state.menuItems.find((i) => i.id === itemId);
  const me = state.member;
  if (!item || !me) return;
  if (!(canManage(item) || item.createdBy === me.id))
    throw new Error('只有做饭人、管理员或提名者可移除');
  state.menuItems = state.menuItems.filter((i) => i.id !== itemId);
  persistLocal();
  emit();
  if (state.mode === 'supabase') await sbWrite('menu_items', 'delete', itemId);
}

export async function toggleVote(itemId) {
  const item = state.menuItems.find((i) => i.id === itemId);
  const me = state.member;
  if (!item || !me) return;
  item.votes = item.votes || [];
  const idx = item.votes.indexOf(me.id);
  if (idx >= 0) item.votes.splice(idx, 1);
  else item.votes.push(me.id);
  persistLocal();
  emit();
  if (state.mode === 'supabase')
    await sbWrite('menu_items', 'update', {
      id: item.id,
      values: { votes: item.votes },
    });
}

export async function setStatus(itemId, status) {
  const item = state.menuItems.find((i) => i.id === itemId);
  if (!item) return;
  if (!canManage(item)) throw new Error('需要做饭人或管理员操作');
  if (item.status === status) return;
  item.status = status;
  let dish = null;
  if (status === 'done') {
    dish = dishById(item.dishId);
    if (dish) {
      dish.cookedCount = (dish.cookedCount || 0) + 1;
      if (dish.lastCookedAt !== undefined) dish.lastCookedAt = Date.now();
    }
  }
  persistLocal();
  emit();
  if (state.mode === 'supabase') {
    await sbWrite('menu_items', 'update', { id: item.id, values: { status } });
    if (dish)
      await sbWrite('dishes', 'update', {
        id: dish.id,
        values: { cooked_count: dish.cookedCount },
      });
  }
}

export async function setMealCook(date, meal, cookMemberId) {
  const me = state.member;
  if (!me) return;
  const items = state.menuItems.filter((i) => i.date === date && i.meal === meal);
  if (!items.length) throw new Error('这一餐还没有菜，先点菜再指定做饭人');
  if (!(me.role === 'admin' || items.some((i) => i.cookMemberId === me.id)))
    throw new Error('仅管理员或当前做饭人可更改');
  items.forEach((i) => {
    i.cookMemberId = cookMemberId || null;
  });
  persistLocal();
  emit();
  if (state.mode === 'supabase') {
    await Promise.all(
      items.map((i) =>
        sbWrite('menu_items', 'update', {
          id: i.id,
          values: { cook_member_id: cookMemberId || null },
        })
      )
    );
  }
}

/* ================= 采购清单 ================= */
function mergeAmounts(list) {
  const unitMap = new Map();
  const others = new Set();
  for (const raw of list) {
    const s = String(raw || '').trim();
    if (!s) continue;
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (m) {
      const unit = (m[2] || '').trim() || '份';
      unitMap.set(unit, (unitMap.get(unit) || 0) + parseFloat(m[1]));
    } else {
      others.add(s);
    }
  }
  const parts = [...unitMap.entries()].map(([unit, num]) => {
    const n = Number.isInteger(num) ? String(num) : num.toFixed(1);
    return unit === '份' ? `${n} 份` : `${n} ${unit}`;
  });
  return [...parts, ...others].join(' · ') || '适量';
}

export async function generateShopping(startISO, endISO) {
  const scopeItems = state.menuItems.filter(
    (m) => m.date >= startISO && m.date <= endISO && m.status !== 'pending'
  );
  if (!scopeItems.length) throw new Error('该范围内还没有已定菜品，先点菜并确认吧');

  const agg = new Map();
  for (const mi of scopeItems) {
    const dish = dishById(mi.dishId);
    if (!dish) continue;
    for (const ing of dish.ingredients || []) {
      const key = String(ing.name || '').trim();
      if (!key) continue;
      const cur = agg.get(key) || { name: key, amounts: [], dishes: new Set() };
      if (ing.amount) cur.amounts.push(ing.amount);
      cur.dishes.add(dish.name);
      agg.set(key, cur);
    }
  }
  if (!agg.size) throw new Error('已定菜品还没有填写食材，先去菜品库补充食材吧');

  const prevChecked = new Map(state.shopping.map((s) => [s.ingredient, s.checked]));
  const manual = state.shopping.filter((s) => s.manual);
  const auto = [...agg.values()].map((v) => ({
    id: uid(),
    familyId: state.family.id,
    ingredient: v.name,
    amount: mergeAmounts(v.amounts),
    fromDishId: null,
    fromDishName: [...v.dishes].join('、'),
    checked: !!prevChecked.get(v.name),
    manual: false,
    updatedAt: Date.now(),
  }));

  state.shopping = [...auto, ...manual];
  persistLocal();
  emit();

  if (state.mode === 'supabase') {
    await sbWrite('shopping_items', 'deleteAutoShopping', state.family.id);
    if (auto.length) await sbWrite('shopping_items', 'insert', auto.map(toShopRow));
  }
  return auto.length;
}

export async function toggleShopping(itemId) {
  const item = state.shopping.find((s) => s.id === itemId);
  if (!item) return;
  item.checked = !item.checked;
  item.updatedAt = Date.now();
  persistLocal();
  emit();
  if (state.mode === 'supabase')
    await sbWrite('shopping_items', 'update', {
      id: item.id,
      values: { checked: item.checked, updated_at: new Date().toISOString() },
    });
}

export async function addShoppingItem({ ingredient, amount }) {
  const name = String(ingredient || '').trim();
  if (!name) throw new Error('食材名必填');
  const item = {
    id: uid(),
    familyId: state.family.id,
    ingredient: name,
    amount: String(amount || '').trim(),
    fromDishId: null,
    fromDishName: '手动添加',
    checked: false,
    manual: true,
    updatedAt: Date.now(),
  };
  state.shopping.push(item);
  persistLocal();
  emit();
  if (state.mode === 'supabase') {
    const ok = await sbWrite('shopping_items', 'insert', toShopRow(item));
    if (!ok) throw new Error('云端保存失败，请检查网络后重试');
  }
  return item;
}

export async function updateShopping(itemId, patch) {
  const item = state.shopping.find((s) => s.id === itemId);
  if (!item) return;
  if (patch.ingredient !== undefined && !String(patch.ingredient).trim())
    throw new Error('食材名不能为空');
  if (patch.ingredient !== undefined) item.ingredient = String(patch.ingredient).trim();
  if (patch.amount !== undefined) item.amount = String(patch.amount).trim();
  item.updatedAt = Date.now();
  persistLocal();
  emit();
  if (state.mode === 'supabase')
    await sbWrite('shopping_items', 'update', {
      id: item.id,
      values: {
        ingredient: item.ingredient,
        amount: item.amount,
        updated_at: new Date().toISOString(),
      },
    });
}

export async function removeShopping(itemId) {
  state.shopping = state.shopping.filter((s) => s.id !== itemId);
  persistLocal();
  emit();
  if (state.mode === 'supabase') await sbWrite('shopping_items', 'delete', itemId);
}

export async function clearBought() {
  state.shopping = state.shopping.filter((s) => !s.checked);
  persistLocal();
  emit();
  if (state.mode === 'supabase')
    await sbWrite('shopping_items', 'deleteChecked', state.family.id);
}

/* ================= 评分 ================= */
export async function rateDish(dishId, score, comment) {
  const me = state.member;
  const dish = dishById(dishId);
  if (!me || !dish) throw new Error('菜品不存在');
  const num = Number(score);
  if (!(num >= 1 && num <= 5)) throw new Error('评分需在 1～5 星之间');
  let rating = state.ratings.find((r) => r.dishId === dishId && r.memberId === me.id);
  if (rating) {
    rating.score = num;
    rating.comment = String(comment || '').trim();
    rating.createdAt = Date.now();
  } else {
    rating = {
      id: uid(),
      familyId: state.family.id,
      dishId,
      memberId: me.id,
      score: num,
      comment: String(comment || '').trim(),
      createdAt: Date.now(),
    };
    state.ratings.push(rating);
  }
  persistLocal();
  emit();
  if (state.mode === 'supabase')
    await sbWrite('ratings', 'upsert', toRatingRow(rating));
}

/* ================= 示例数据 ================= */
const DEMO_DISHES = [
  {
    name: '西红柿炒鸡蛋',
    category: '快手菜',
    difficulty: '简单',
    durationMin: 15,
    tasteTags: ['酸甜', '鲜咸'],
    ingredients: [
      { name: '西红柿', amount: '2 个' },
      { name: '鸡蛋', amount: '3 个' },
      { name: '小葱', amount: '1 根' },
      { name: '盐', amount: '适量' },
    ],
    steps: '1. 鸡蛋打散加少许盐，热油炒至凝固盛出。\n2. 西红柿切块下锅炒软出汁。\n3. 倒回鸡蛋翻炒，撒葱花出锅。',
    links: [
      {
        platform: '下厨房',
        title: '西红柿炒鸡蛋 · 家常做法',
        url: 'https://www.xiachufang.com/recipe/100353565/',
      },
    ],
    cookedCount: 6,
  },
  {
    name: '宫保鸡丁',
    category: '荤菜',
    difficulty: '中等',
    durationMin: 25,
    tasteTags: ['偏辣', '鲜咸'],
    ingredients: [
      { name: '鸡胸肉', amount: '300 克' },
      { name: '花生米', amount: '50 克' },
      { name: '黄瓜', amount: '1 根' },
      { name: '干辣椒', amount: '5 克' },
      { name: '生抽', amount: '2 勺' },
    ],
    steps: '1. 鸡胸肉切丁，用生抽、淀粉腌制 10 分钟。\n2. 花生米小火炒香。\n3. 鸡丁滑炒变色，加干辣椒、黄瓜丁翻炒。\n4. 倒入碗汁收汁，撒花生米即可。',
    links: [
      {
        platform: '抖音',
        title: '宫保鸡丁 30 秒学会',
        url: 'https://www.douyin.com/search/宫保鸡丁做法',
      },
      {
        platform: '下厨房',
        title: '宫保鸡丁详细菜谱',
        url: 'https://www.xiachufang.com/recipe/1043055/',
      },
    ],
    cookedCount: 3,
  },
  {
    name: '清蒸鲈鱼',
    category: '荤菜',
    difficulty: '中等',
    durationMin: 25,
    tasteTags: ['清淡', '鲜咸'],
    ingredients: [
      { name: '鲈鱼', amount: '1 条' },
      { name: '姜', amount: '3 片' },
      { name: '小葱', amount: '2 根' },
      { name: '蒸鱼豉油', amount: '2 勺' },
    ],
    steps: '1. 鲈鱼处理干净，两面划刀，铺姜片。\n2. 水开后大火蒸 8 分钟。\n3. 倒掉汤汁，铺葱丝，淋豉油和热油。',
    links: [
      {
        platform: '小红书',
        title: '零失败清蒸鲈鱼',
        url: 'https://www.xiaohongshu.com/search_result?keyword=清蒸鲈鱼',
      },
    ],
    cookedCount: 2,
  },
  {
    name: '蒜蓉西兰花',
    category: '素菜',
    difficulty: '简单',
    durationMin: 10,
    tasteTags: ['清淡'],
    ingredients: [
      { name: '西兰花', amount: '1 颗' },
      { name: '大蒜', amount: '3 瓣' },
      { name: '盐', amount: '适量' },
    ],
    steps: '1. 西兰花掰小朵，盐水浸泡后焯水 1 分钟。\n2. 蒜末爆香，下西兰花快炒。\n3. 加盐调味出锅。',
    links: [],
    cookedCount: 8,
  },
  {
    name: '白灼虾',
    category: '荤菜',
    difficulty: '简单',
    durationMin: 12,
    tasteTags: ['清淡', '鲜咸'],
    ingredients: [
      { name: '虾', amount: '500 克' },
      { name: '姜', amount: '3 片' },
      { name: '料酒', amount: '1 勺' },
    ],
    steps: '1. 水中加姜片、料酒烧开。\n2. 下虾煮 2～3 分钟变红捞出。\n3. 调生抽蒜末蘸料。',
    links: [
      {
        platform: '下厨房',
        title: '白灼虾的正确做法',
        url: 'https://www.xiachufang.com/recipe/1000877/',
      },
    ],
    cookedCount: 1,
  },
  {
    name: '紫菜蛋花汤',
    category: '汤',
    difficulty: '简单',
    durationMin: 10,
    tasteTags: ['清淡'],
    ingredients: [
      { name: '紫菜', amount: '5 克' },
      { name: '鸡蛋', amount: '1 个' },
      { name: '香油', amount: '几滴' },
    ],
    steps: '1. 水烧开下紫菜。\n2. 淋入蛋液搅出蛋花。\n3. 加盐、香油即可。',
    links: [],
    cookedCount: 4,
  },
  {
    name: '番茄牛腩面',
    category: '主食',
    difficulty: '复杂',
    durationMin: 70,
    tasteTags: ['酸甜', '鲜咸'],
    ingredients: [
      { name: '牛腩', amount: '500 克' },
      { name: '番茄', amount: '3 个' },
      { name: '面条', amount: '200 克' },
      { name: '洋葱', amount: '半个' },
    ],
    steps: '1. 牛腩焯水后加姜片炖 40 分钟。\n2. 番茄洋葱炒出沙，倒入牛腩汤。\n3. 面条另煮，浇上汤头。',
    links: [
      {
        platform: '小红书',
        title: '一锅番茄牛腩面',
        url: 'https://www.xiaohongshu.com/search_result?keyword=番茄牛腩面',
      },
    ],
    cookedCount: 1,
  },
  {
    name: '皮蛋瘦肉粥',
    category: '早餐',
    difficulty: '简单',
    durationMin: 35,
    tasteTags: ['清淡', '鲜咸'],
    ingredients: [
      { name: '大米', amount: '100 克' },
      { name: '皮蛋', amount: '1 个' },
      { name: '瘦肉', amount: '100 克' },
      { name: '姜丝', amount: '少许' },
    ],
    steps: '1. 大米浸泡后加水煮开。\n2. 加入瘦肉丝、皮蛋丁小火熬 20 分钟。\n3. 加盐、姜丝、葱花。',
    links: [],
    cookedCount: 5,
  },
  {
    name: '麻婆豆腐',
    category: '荤菜',
    difficulty: '中等',
    durationMin: 20,
    tasteTags: ['偏辣', '香辣'],
    ingredients: [
      { name: '豆腐', amount: '1 块' },
      { name: '牛肉末', amount: '100 克' },
      { name: '豆瓣酱', amount: '1 勺' },
      { name: '花椒粉', amount: '少许' },
    ],
    steps: '1. 豆腐切块焯水。\n2. 牛肉末炒散，加豆瓣酱炒香。\n3. 下豆腐小火煮 3 分钟，勾芡撒花椒粉。',
    links: [
      {
        platform: '抖音',
        title: '麻婆豆腐 家常版',
        url: 'https://www.douyin.com/search/麻婆豆腐做法',
      },
    ],
    cookedCount: 3,
  },
  {
    name: '手撕包菜',
    category: '快手菜',
    difficulty: '简单',
    durationMin: 12,
    tasteTags: ['偏辣'],
    ingredients: [
      { name: '包菜', amount: '1 颗' },
      { name: '干辣椒', amount: '3 个' },
      { name: '大蒜', amount: '2 瓣' },
    ],
    steps: '1. 包菜手撕成片。\n2. 干辣椒、蒜片爆香。\n3. 大火快炒包菜，加盐、生抽出锅。',
    links: [],
    cookedCount: 7,
  },
  {
    name: '可乐鸡翅',
    category: '荤菜',
    difficulty: '简单',
    durationMin: 25,
    tasteTags: ['酸甜'],
    ingredients: [
      { name: '鸡翅', amount: '10 个' },
      { name: '可乐', amount: '1 罐' },
      { name: '姜', amount: '3 片' },
      { name: '生抽', amount: '2 勺' },
    ],
    steps: '1. 鸡翅两面划刀，焯水。\n2. 煎至两面金黄，加姜片、生抽。\n3. 倒入可乐没过鸡翅，大火收汁。',
    links: [
      {
        platform: '下厨房',
        title: '可乐鸡翅做法',
        url: 'https://www.xiachufang.com/recipe/1001159/',
      },
    ],
    cookedCount: 4,
  },
  {
    name: '蒸蛋羹',
    category: '早餐',
    difficulty: '简单',
    durationMin: 15,
    tasteTags: ['清淡'],
    ingredients: [
      { name: '鸡蛋', amount: '2 个' },
      { name: '温水', amount: '150 毫升' },
      { name: '生抽', amount: '少许' },
    ],
    steps: '1. 鸡蛋打散，加温水搅匀过筛。\n2. 盖保鲜膜扎孔，中火蒸 10 分钟。\n3. 淋生抽、香油。',
    links: [],
    cookedCount: 2,
  },
];

export function seedDemoDishes() {
  if (!state.family) return;
  const existing = new Set(state.dishes.map((d) => d.name));
  const now = Date.now();
  const added = [];
  DEMO_DISHES.forEach((d, i) => {
    if (existing.has(d.name)) return;
    const dish = {
      id: uid(),
      familyId: state.family.id,
      ...d,
      imageUrl: d.imageUrl || '',
      favoriteBy: [],
      createdBy: state.member?.id || null,
      createdAt: now - i * 1000,
    };
    state.dishes.push(dish);
    added.push(dish);
  });
  persistLocal();
  emit();
  if (state.mode === 'supabase' && added.length) {
    sbWrite('dishes', 'insert', added.map(toDishRow));
  }
  return added.length;
}
