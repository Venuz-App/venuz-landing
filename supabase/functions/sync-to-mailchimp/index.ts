const MAILCHIMP_API_KEY = Deno.env.get('MAILCHIMP_API_KEY')!;
const MAILCHIMP_AUDIENCE_ID = Deno.env.get('MAILCHIMP_AUDIENCE_ID')!;
const MAILCHIMP_DC = 'us12';

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    if (!record?.email) {
      return new Response(JSON.stringify({ error: 'No email in payload' }), { status: 400 });
    }

    const body: Record<string, unknown> = {
      email_address: record.email,
      status: 'subscribed',
    };

    if (record.city) {
      body.merge_fields = { CITY: record.city };
    }

    const res = await fetch(
      `https://${MAILCHIMP_DC}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members`,
      {
        method: 'POST',
        headers: {
          'Authorization': `apikey ${MAILCHIMP_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const data = await res.json();

    // Member already exists — treat as success
    if (!res.ok && data.title !== 'Member Exists') {
      return new Response(JSON.stringify({ error: data.detail }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
