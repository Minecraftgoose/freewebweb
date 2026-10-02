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

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const params = event.queryStringParameters || {};
  const mode = params.mode || 'list';

  try {
    // ========== 统计模式（优化版，使用数据库聚合） ==========
    if (mode === 'stats') {
      // 1. 总站点数（使用 head 计数，极快）
      const { count: totalSites, error: countErr } = await supabase
        .from('sites')
        .select('*', { count: 'exact', head: true });

      if (countErr) throw countErr;

      // 2. IP 分组统计 - 使用数据库聚合，只查必要字段
      const { data: allSites, error: ipErr } = await supabase
        .from('sites')
        .select('creator_ip, slug, created_at')
        .order('created_at', { ascending: false });

      if (ipErr) throw ipErr;

      // 内存聚合（只查了三个字段，数据量已大幅减少）
      const ipMap = {};
      for (const site of allSites) {
        const ip = site.creator_ip || 'unknown';
        if (!ipMap[ip]) {
          ipMap[ip] = { ip: ip, siteCount: 0, slugs: [], lastActive: site.created_at };
        }
        ipMap[ip].siteCount++;
        if (ipMap[ip].slugs.length < 10) {
          ipMap[ip].slugs.push(site.slug);
        }
        if (site.created_at > ipMap[ip].lastActive) {
          ipMap[ip].lastActive = site.created_at;
        }
      }

      const ipList = Object.values(ipMap).sort(function(a, b) {
        return b.siteCount - a.siteCount;
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          totalSites: totalSites || 0,
          ipStats: ipList
        })
      };
    }

    // ========== 获取单个站点内容（编辑用） ==========
    if (mode === 'content') {
      const slug = params.slug;
      if (!slug) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: '缺少 slug 参数' })
        };
      }

      const { data, error } = await supabase
        .from('sites')
        .select('html_content')
        .eq('slug', slug)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: '站点不存在' })
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ html_content: data.html_content })
      };
    }

    // ========== 列表模式（分页 + 搜索） ==========
    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 50;
    const offset = (page - 1) * limit;
    const search = params.search || '';

    let query = supabase
      .from('sites')
      .select('slug, admin_token, created_at, updated_at, content_type, creator_ip', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search.trim()) {
      query = query.ilike('slug', '%' + search.trim() + '%');
    }

    const { data, count, error } = await query;

    if (error) throw error;

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      statusCode: 200,
      body: JSON.stringify({
        data: data || [],
        total: count || 0,
        page: page,
        limit: limit,
        totalPages: totalPages
      })
    };

  } catch (err) {
    console.error('admin-sites error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};