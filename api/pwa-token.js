const SUPABASE_URL = 'https://xjkrplonwfexigkudhmo.supabase.co';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' });

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`
  };

  // POST — create a one-time token, return its UUID
  if (req.method === 'POST') {
    const { access_token, refresh_token } = req.body || {};
    if (!access_token || !refresh_token) return res.status(400).json({ error: 'Missing tokens' });

    const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const r = await fetch(`${SUPABASE_URL}/rest/v1/pwa_tokens`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({ access_token, refresh_token, expires_at })
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: 'DB error' });
    return res.status(200).json({ id: data[0].id });
  }

  // GET — read and immediately delete the token
  if (req.method === 'GET') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const now = new Date().toISOString();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/pwa_tokens?id=eq.${id}&expires_at=gt.${now}`,
      { headers }
    );
    const rows = await r.json();
    if (!rows.length) return res.status(404).json({ error: 'Token not found or expired' });

    // Delete immediately — one-time use
    await fetch(`${SUPABASE_URL}/rest/v1/pwa_tokens?id=eq.${id}`, {
      method: 'DELETE',
      headers
    });

    return res.status(200).json({
      access_token: rows[0].access_token,
      refresh_token: rows[0].refresh_token
    });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
