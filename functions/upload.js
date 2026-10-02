const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ===================== 智能 HTML 检测 =====================

/**
 * 检测内容是否为有效 HTML（拒绝纯文本/文本文件）
 * 返回 { valid: boolean, reason: string, contentType: string }
 */
function detectHTMLContent(content) {
  const trimmed = content.trim();

  // 空内容拒绝
  if (trimmed.length < 10) {
    return { valid: false, reason: '内容过短，请上传完整的 HTML 文件喵~', contentType: 'too_short' };
  }

  // 大小限制 1MB
  const sizeBytes = Buffer.byteLength(content, 'utf8');
  if (sizeBytes > 300 * 1024) {
    return { valid: false, reason: '文件过大，限制 300k 以内喵~', contentType: 'too_large' };
  }

  // === 第一层：HTML 核心标签检测 ===
  // 必须有包含元素标签的 HTML
  const coreTags = [
    /<(!DOCTYPE\s+html)/i,
    /<html[\s>]/i,
    /<head[\s>]/i,
    /<body[\s>]/i,
    /<\/html>/i,
    /<\/body>/i,
  ];
  const anyCoreTag = coreTags.some(r => r.test(trimmed));

  // 必须有常见的内联/块级元素标签
  const contentTags = [
    /<\/?div[\s>]/i,
    /<\/?p[\s>]/i,
    /<\/?span[\s>]/i,
    /<\/?a[\s>]/i,
    /<\/?img[\s>]/i,
    /<\/?h[1-6][\s>]/i,
    /<\/?table[\s>]/i,
    /<\/?ul[\s>]/i,
    /<\/?ol[\s>]/i,
    /<\/?li[\s>]/i,
    /<\/?section[\s>]/i,
    /<\/?header[\s>]/i,
    /<\/?footer[\s>]/i,
    /<\/?nav[\s>]/i,
    /<\/?article[\s>]/i,
    /<\/?main[\s>]/i,
    /<\/?form[\s>]/i,
    /<\/?input[\s>]/i,
    /<\/?button[\s>]/i,
    /<\/?style[\s>]/i,
    /<\/?script[\s>]/i,
    /<\/?link[\s>]/i,
    /<\/?meta[\s>]/i,
    /<\/?br[\s>/]/i,
    /<\/?hr[\s>/]/i,
    /<\/?pre[\s>]/i,
    /<\/?code[\s>]/i,
    /<\/?blockquote[\s>]/i,
    /<\/?canvas[\s>]/i,
    /<\/?svg[\s>]/i,
  ];
  const hasContentTags = contentTags.some(r => r.test(trimmed));

  if (!anyCoreTag && !hasContentTags) {
    return {
      valid: false,
      reason: '未检测到任何 HTML 标签！请上传包含 HTML 标签的网页文件喵~ (例如 <html>, <body>, <div>, <p> 等)',
      contentType: 'no_html_tags'
    };
  }

  // === 第二层：纯文本特征检测 ===
  // 去除所有 HTML 标签后的纯文本内容
  const stripTags = trimmed
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 如果去除标签后得到了长篇纯文本且没有标签→很可能是纯文本文件
  const lines = trimmed.split('\n');
  let textLineCount = 0;
  let totalLineCount = lines.length;

  for (const line of lines) {
    const t = line.trim();
    if (t.length > 0 && !/[<>]/.test(t) && !t.startsWith('{') && !t.startsWith('//') && !t.startsWith('/*')) {
      textLineCount++;
    }
  }

  // 非 HTML 格式检测
  const nonHTMLIndicators = [
    /^(你好|您好|hello|hi|hey)[\s，,]/i,  // 以问候语开头
    /^[A-Za-z\u4e00-\u9fff\s，。！？,.!?]+$/m,  // 整行纯中英文标点
  ];

  const looksLikeText = nonHTMLIndicators.some(r => r.test(stripTags));

  // 如果大多数行都是纯文本且行数>=5，判定为文本文件
  if (totalLineCount >= 5 && textLineCount > totalLineCount * 0.85 && !anyCoreTag) {
    return {
      valid: false,
      reason: '检测到纯文本内容！请上传 HTML 格式的网页文件喵~ 如果只是文字，请用 <p>标签</p> 包裹起来喵~',
      contentType: 'plain_text'
    };
  }

  // === 第三层：常见文本文件内容判断 ===
  // 检测 JSON 格式
  if (/^\s*[{\[]/.test(trimmed) && /[}\]]\s*$/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return {
        valid: false,
        reason: '检测到 JSON 数据！请上传 HTML 网页文件，不是 JSON 文件喵~',
        contentType: 'json_data'
      };
    } catch (e) { /* not JSON, ok */ }
  }

  // 检测纯中文/英文长文本（无任何标签包裹）
  if (stripTags.length > 100 && !hasContentTags) {
    return {
      valid: false,
      reason: '检测到纯文本长内容！请用 HTML 标签包裹你的文本喵~ 比如 <p>你的内容</p>',
      contentType: 'long_plain_text'
    };
  }

  // === 通过检测 ===
  const type = anyCoreTag ? 'html_full' : 'html_partial';
  return { valid: true, contentType: type };
}


// ===================== 主函数 =====================

exports.handler = async (event) => {
  // CORS 预检
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: '请求格式错误，需要 JSON' })
    };
  }

  const { slug, html, token } = body;

  if (!slug || !html) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: '缺少 slug 或 html 参数' })
    };
  }

  // Slug 校验
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 64) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Slug 格式无效（3-64位小写字母/数字/连字符）' })
    };
  }

  // ⭐ 智能 HTML 内容检测
  const detection = detectHTMLContent(html);
  if (!detection.valid) {
    return {
      statusCode: 422,
      body: JSON.stringify({
        error: detection.reason,
        detection: detection.contentType
      })
    };
  }

  // 获取客户端 IP
  const clientIP =
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.headers['client-ip'] ||
    event.headers['x-real-ip'] ||
    'unknown';

  const now = new Date().toISOString();

  try {
    // 检查 slug 是否已存在
    const { data: existing, error: findErr } = await supabase
      .from('sites')
      .select('admin_token')
      .eq('slug', slug)
      .maybeSingle();

    if (findErr) throw findErr;

    if (existing) {
      // 更新模式：验证 token
      if (!token || token !== existing.admin_token) {
        return {
          statusCode: 403,
          body: JSON.stringify({ error: 'Token 验证失败，无权修改此站点' })
        };
      }

      const { error: updateErr } = await supabase
        .from('sites')
        .update({
          html_content: html,
          updated_at: now,
          content_type: detection.contentType,
          creator_ip: clientIP
        })
        .eq('slug', slug);

      if (updateErr) throw updateErr;

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: '站点已更新喵~',
          slug,
          siteUrl: `/s/${slug}`,
          detection: detection.contentType
        })
      };
    } else {
      // 创建模式
      const adminToken = crypto.randomUUID();

      const { error: insertErr } = await supabase
        .from('sites')
        .insert({
          slug,
          html_content: html,
          admin_token: adminToken,
          created_at: now,
          updated_at: now,
          content_type: detection.contentType,
          creator_ip: clientIP
        });

      if (insertErr) {
        if (insertErr.code === '23505') {
          return {
            statusCode: 409,
            body: JSON.stringify({ error: '该 slug 已被占用喵~' })
          };
        }
        throw insertErr;
      }

      return {
        statusCode: 201,
        body: JSON.stringify({
          success: true,
          message: '站点创建成功喵~',
          slug,
          siteUrl: `/s/${slug}`,
          adminToken,
          detection: detection.contentType
        })
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
