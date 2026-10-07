// Searches Freesound for short sounds. The Freesound key lives in Netlify.

const json = (statusCode, obj, extra = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...extra },
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  const key = process.env.FREESOUND_API_KEY;
  if (!key) return json(500, { error: 'The server is missing its FREESOUND_API_KEY setting.' });

  const q = String((event.queryStringParameters || {}).q || '').trim().slice(0, 80);
  if (!q) return json(400, { error: 'Missing search words.' });

  const url = new URL('https://freesound.org/apiv2/search/text/');
  url.search = new URLSearchParams({
    query: q,
    filter: 'duration:[0 TO 15]',
    fields: 'id,name,duration,username,url,previews',
    page_size: '8',
    sort: 'score',
    token: key
  }).toString();

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Freesound error', res.status);
      return json(502, { error: 'Freesound could not search right now.' });
    }
    const body = await res.json();
    const results = (body.results || []).map(r => ({
      id: r.id,
      name: r.name,
      duration: r.duration,
      username: r.username,
      url: r.url,
      preview: r.previews && (r.previews['preview-hq-mp3'] || r.previews['preview-lq-mp3']) || ''
    }));
    return json(200, { results }, { 'Cache-Control': 'public, max-age=3600' });
  } catch (err) {
    return json(502, { error: 'Could not reach Freesound.' });
  }
};
