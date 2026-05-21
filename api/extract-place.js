// Fetch URL server-side to resolve short links and pull static page data
async function fetchUrlContext(url) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' },
      signal: AbortSignal.timeout(8000)
    });

    const finalUrl = response.url;
    const html = await response.text();

    // Page title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s*[-|·]\s*Google Maps.*$/i, '').trim() : '';

    // Meta description (Google Maps: "4.7 ★ · $$ · Italian restaurant · 123 Main St, NYC")
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                   || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const description = descMatch ? descMatch[1] : '';

    // Google Maps place name from URL path /maps/place/PLACE_NAME/
    const mapsMatch = finalUrl.match(/\/maps\/place\/([^/@?]+)/);
    const mapsName = mapsMatch ? decodeURIComponent(mapsMatch[1].replace(/\+/g, ' ')) : '';

    // ── Parse Google Maps description format ──
    let googleRating = null;
    let googlePrice = null;
    let googleHours = null;

    if (description) {
      // Rating: "4.7 ★" or "★4.7" or "Rated 4.7"
      const ratingMatch = description.match(/(\d+\.\d+|\d+)\s*[★⭐]/) || description.match(/[★⭐]\s*(\d+\.\d+|\d+)/);
      if (ratingMatch) googleRating = parseFloat(ratingMatch[1]);

      // Price range: look for $$$ symbols surrounded by spaces or dots
      const priceMatch = description.match(/(?:^|·|\s)(\${1,4})(?:\s|·|$)/);
      if (priceMatch) googlePrice = priceMatch[1].trim();
    }

    // ── Try JSON-LD for structured hours ──
    const ldMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of ldMatches) {
      try {
        const ld = JSON.parse(match[1]);
        const entries = Array.isArray(ld) ? ld : [ld];
        for (const entry of entries) {
          if (entry.openingHours) {
            googleHours = Array.isArray(entry.openingHours)
              ? entry.openingHours.join(', ')
              : entry.openingHours;
            break;
          }
          if (entry.openingHoursSpecification) {
            // Flatten spec into a short string
            const specs = Array.isArray(entry.openingHoursSpecification)
              ? entry.openingHoursSpecification
              : [entry.openingHoursSpecification];
            const parts = specs.map(s => {
              const days = Array.isArray(s.dayOfWeek) ? s.dayOfWeek.join('/') : s.dayOfWeek || '';
              const open = s.opens || '';
              const close = s.closes || '';
              return days && open ? `${days.replace(/https?:\/\/schema\.org\//gi, '')} ${open}–${close}` : '';
            }).filter(Boolean);
            if (parts.length) { googleHours = parts.join(', '); break; }
          }
        }
      } catch { /* skip malformed */ }
    }

    // ── Mine hours from JS data blob if JSON-LD missed ──
    // Google embeds hours as quoted strings like "Monday\u202f8:00\u202fAM\u2013\u202f10:00\u202fPM"
    if (!googleHours) {
      const hoursPattern = /"((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^"]{3,40})"/g;
      const dayHits = [...html.matchAll(hoursPattern)].map(m => m[1].replace(/\\u[\dA-Fa-f]{4}/g, c => {
        try { return JSON.parse(`"${c}"`); } catch { return ' '; }
      })).filter(s => /\d/.test(s)).slice(0, 7);
      if (dayHits.length >= 5) googleHours = dayHits.join(', ');
    }

    return { finalUrl, pageTitle, description, mapsName, googleRating, googlePrice, googleHours };
  } catch {
    return { finalUrl: url, pageTitle: '', description: '', mapsName: '', googleRating: null, googlePrice: null, googleHours: null };
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
  let googleRating = null, googlePrice = null, googleHours = null;
  if (url) {
    const ctx = await fetchUrlContext(url);
    fetchedTitle  = ctx.pageTitle;
    fetchedDesc   = ctx.description;
    mapsName      = ctx.mapsName;
    finalUrl      = ctx.finalUrl;
    googleRating  = ctx.googleRating;
    googlePrice   = ctx.googlePrice;
    googleHours   = ctx.googleHours;
  }

  const context = [
    title                         && `Title: ${title}`,
    mapsName                      && `Google Maps place name: ${mapsName}`,
    fetchedTitle                  && `Page title: ${fetchedTitle}`,
    fetchedDesc                   && `Page description: ${fetchedDesc}`,
    googleRating !== null         && `Pre-parsed Google rating: ${googleRating}`,
    googlePrice                   && `Pre-parsed price range: ${googlePrice}`,
    googleHours                   && `Pre-parsed hours: ${googleHours}`,
    text                          && `Text: ${text}`,
    finalUrl                      && `URL: ${finalUrl}`
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
        max_tokens: 300,
        system: `You are a place extraction assistant for VenuZ, a place-saving app.
When given page metadata from a Google Maps or social media URL, extract the referenced place.

Google Maps page descriptions often follow this format:
"RATING ★ · PRICE · TYPE · ADDRESS"
Example: "4.7 ★ · $$ · Italian restaurant · 181 Thompson St, New York, NY 10012"

If "Pre-parsed Google rating", "Pre-parsed price range", or "Pre-parsed hours" fields are provided,
use them directly — they are already extracted. Only fall back to parsing the description yourself
if those fields are absent.

Return ONLY valid JSON:
{
  "name": "Place name or null",
  "place_type": "Restaurant|Bar|Café|Hotel|Spa|Beach|Shopping|Park|Museum|Gallery|Entertainment|Lounge|Other",
  "city": "City name or null",
  "country": "Country or null",
  "address": "Full street address or null",
  "price_range": "$|$$|$$$|$$$$|null",
  "hours": "Brief hours summary or null",
  "google_rating": number or null,
  "vibe_tags": ["tag1", "tag2"],
  "confidence": "high|medium|low"
}
For price_range: $ = under $15, $$ = $15–$30, $$$ = $30–$60, $$$$ = $60+.
For hours: keep brief, e.g. "Mon–Fri 12pm–10pm, Sat–Sun 11am–11pm".
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
