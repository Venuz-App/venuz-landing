// Fetch the URL server-side to resolve short links and get the page title
async function fetchUrlContext(url) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' },
      signal: AbortSignal.timeout(6000)
    });

    const finalUrl = response.url;
    const html = await response.text();

    // Pull page title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s*[-|·]\s*Google Maps.*$/i, '').trim() : '';

    // Pull meta description (often has address + category on Maps)
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                   || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const description = descMatch ? descMatch[1] : '';

    // For Google Maps URLs, the place name is in the path: /maps/place/PLACE_NAME/
    const mapsMatch = finalUrl.match(/\/maps\/place\/([^/@?]+)/);
    const mapsName = mapsMatch ? decodeURIComponent(mapsMatch[1].replace(/\+/g, ' ')) : '';

    return { finalUrl, pageTitle, description, mapsName };
  } catch {
    return { finalUrl: url, pageTitle: '', description: '', mapsName: '' };
  }
}

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

  // Resolve URL and enrich context
  let fetchedTitle = '', fetchedDesc = '', mapsName = '', finalUrl = url;
  if (url) {
    const ctx = await fetchUrlContext(url);
    fetchedTitle = ctx.pageTitle;
    fetchedDesc  = ctx.description;
    mapsName     = ctx.mapsName;
    finalUrl     = ctx.finalUrl;
  }

  const context = [
    title    && `Title: ${title}`,
    mapsName && `Google Maps place name: ${mapsName}`,
    fetchedTitle && `Page title: ${fetchedTitle}`,
    fetchedDesc  && `Page description: ${fetchedDesc}`,
    text     && `Text: ${text}`,
    finalUrl && `URL: ${finalUrl}`
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
  "price_range": "$|$$|$$$|$$$$|null",
  "hours": "Brief hours summary e.g. Mon-Fri 12pm-10pm, Sat-Sun 11am-11pm or null",
  "vibe_tags": ["tag1", "tag2"],
  "confidence": "high|medium|low"
}
For price_range: $ = under $15, $$ = $15-$30, $$$ = $30-$60, $$$$ = $60+. Extract from page description symbols or text clues.
For hours: extract open/close times if present in the page content. Keep it brief.
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
