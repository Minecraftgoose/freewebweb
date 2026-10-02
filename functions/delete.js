const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { slug, token } = JSON.parse(event.body);
  if (!slug || !token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing slug or token' }) };
  }

  try {
    const { data: site, error: fetchError } = await supabase
      .from('sites')
      .select('admin_token')
      .eq('slug', slug)
      .single();

    if (fetchError || !site) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Site not found' }) };
    }

    if (token !== site.admin_token) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const { error: deleteError } = await supabase
      .from('sites')
      .delete()
      .eq('slug', slug);

    if (deleteError) throw deleteError;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Site deleted' })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};