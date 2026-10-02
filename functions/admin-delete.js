const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  // 管理员认证
  const authHeader = event.headers.authorization || '';
  const expectedAuth =
    'Basic ' + Buffer.from('admin:' + process.env.ADMIN_PASSWORD).toString('base64');
  if (authHeader !== expectedAuth) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: '需要管理员权限' }),
      headers: { 'WWW-Authenticate': 'Basic realm="Admin"' }
    };
  }

  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
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

  const { slug, deleteAll } = body;

  try {
    // 一键删除全部（改进版，直接删除所有行）
    if (deleteAll === true) {
      // 先统计数量
      const { count, error: countErr } = await supabase
        .from('sites')
        .select('*', { count: 'exact', head: true });

      if (countErr) throw countErr;

      if (count === 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            message: '没有站点可删',
            deletedCount: 0
          })
        };
      }

      // 直接删除所有行（Supabase 内部会分批处理，不触发函数超时）
      const { error: delErr } = await supabase
        .from('sites')
        .delete()
        .neq('slug', ''); // 删除所有 slug 不为空的记录（即全部）

      if (delErr) throw delErr;

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: '已删除全部站点',
          deletedCount: count
        })
      };
    }

    // 删除单个站点
    if (!slug) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '缺少 slug 参数' })
      };
    }

    // 先检查是否存在
    const { data: existing } = await supabase
      .from('sites')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle();

    if (!existing) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: '站点不存在' })
      };
    }

    const { error: delErr } = await supabase
      .from('sites')
      .delete()
      .eq('slug', slug);

    if (delErr) throw delErr;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: '站点 ' + slug + ' 已删除'
      })
    };

  } catch (err) {
    console.error('admin-delete error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};