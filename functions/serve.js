const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// 自定义 404 页面
const NOT_FOUND_PAGE = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>404 - 页面不存在</title><style>body{background:#0d1117;color:#c9d1d9;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}h1{font-size:4rem;margin:0;color:#58a6ff;}p{color:#8b949e;margin:0.5rem 0 1.5rem;}a{color:#58a6ff;text-decoration:none;border:1px solid #30363d;padding:0.5rem 1.5rem;border-radius:8px;transition:0.2s;}a:hover{background:#161b22;}</style></head><body><div><h1>404</h1><p>站点不存在，请检查地址是否正确</p><a href="/">返回首页</a></div></body></html>';

exports.handler = async (event) => {
  // 匹配路径 /s/xxx
  var match = event.path.match(/^\/s\/([a-z0-9][a-z0-9-]{1,62}[a-z0-9])$/i);
  if (!match) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/html' },
      body: NOT_FOUND_PAGE
    };
  }
  var slug = match[1].toLowerCase();

  var { data, error } = await supabase
    .from('sites')
    .select('html_content')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/html' },
      body: NOT_FOUND_PAGE
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=3600'  // 缓存 1 小时
    },
    body: data.html_content
  };
};