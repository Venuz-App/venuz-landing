module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title = '', text = '', url = '' } = req.body || {};
  if (!title && !text && !url) return res.status(400).json({ error: 'No content provided' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const context = [
    title && `Title: ${title}`,
    text  && `Text: ${text}`,
    url   && `URL: ${url}`
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: `You are a place extraction assistant for VenuZ, a place-saving app.
When given a URL or text content from social media or the web,
extract any place (restaurant, bar, spa, beach, hotel, market, lounge, etc.)
that is being referenced or recommended.
Return ONLY valid JSON with these exact fields:
{
  "name": "Place name or null",
  "place_type": "Restaurant|Bar|Spa|Beach|Market|Hotel|Lounge|Other",
  "city": "City name or null",
  "country": "Country or null",
  "vibe_tags": ["tag1", "tag2"],
  "confidence": "high|medium|low"
}
If no place is found, return: null`,
        messages: [{ role: 'user', content: context }]
      })
    });

    if (!response.ok) {
      console.error('Claude API error:', await response.text());
      return res.status(500).json({ error: 'Extraction failed' });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text?.trim() ?? '';

    let place = null;
    if (raw && raw !== 'null') {
      try {
        place = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) place = JSON.parse(match[0]);
      }
    }

    return res.status(200).json({ place });
  } catch (err) {
    console.error('extract-place error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
