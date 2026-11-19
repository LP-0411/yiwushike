/**
 * 云端配置
 * 在 Supabase 控制台 → Project Settings → API 中获取。
 * 填好这两项后刷新页面，App 会自动切换到云端同步模式；
 * 留空则使用浏览器本地存储（本地演示模式），功能完全一致。
 *
 * 详细建表步骤见 supabase/schema.sql 文件开头的说明。
 */
export const CONFIG = {
  SUPABASE_URL: 'https://twcctggehdnsknowxgss.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_pCODrIuwoLM1ItAYnkipFw_AqIf9NpH',
  // 演示环境固定验证码（真实短信登录需要额外接入短信服务商）
  DEMO_CODE: '123456',
};

export function supabaseEnabled() {
  // URL 加上 ?local=1 可强制使用本地演示模式（便于离线预览与调试）
  try {
    if (new URLSearchParams(location.search).get('local') === '1') return false;
  } catch {
    /* ignore */
  }
  return Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
}
