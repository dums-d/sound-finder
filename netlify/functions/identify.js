// Receives a short audio clip from the page, asks Gemini what the sound is,
// and returns the answer. The Gemini key lives in Netlify, never in the page.

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const PROMPT = `You are an expert in sound effects and internet sound culture (memes, TikTok, games, movies, UI sounds, stock SFX).
Listen to the audio in this file.
Identify the most prominent sound effect. Reply with JSON only, in this shape:
{
  "best_name": "the name people would type to find this sound, 1-4 words",
  "also_called": ["up to 5 other names for the same sound"],
  "what_it_is": "one plain sentence on what the sound is and, if it is a known meme, game, movie or app sound, where it comes from",
  "category": "e.g. transition, impact, meme, notification, ambience, voice, music, foley",
  "search_terms": ["up to 5 short phrases (1-4 words) as typed into a sound-effects site, best first"],
  "confidence": "high, medium or low"
}
If the clip is only speech or only music, say so in what_it_is and still give your best search terms. Do not invent a source if you are not sure.`;

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj)
});

const str = v => (typeof v === 'string' ? v.slice(0, 200) : '');
const strList = v => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, 8) : []);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(500, { error: 'The server is missing its GEMINI_API_KEY setting.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Bad request.' }); }

  const data = body.data;
  if (!data || typeof data !== 'string') return json(400, { error: 'No audio received.' });
  if (data.length > 4500000) return json(413, { error: 'That clip is too large. Try a shorter one.' });

  let res, result;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'audio/wav', data } },
          { text: PROMPT }
        ]}],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
      })
    });
    result = await res.json();
  } catch (err) {
    return json(502, { error: 'Could not reach Gemini. Try again in a moment.' });
  }

  if (!res.ok) {
    if (res.status === 429) return json(429, { error: 'Daily free limit reached. Try again later.' });
    console.error('Gemini error', res.status, JSON.stringify(result).slice(0, 500));
    return json(502, { error: 'Gemini could not process this clip.' });
  }

  const text = (((result.candidates || [])[0] || {}).content || {}).parts;
  const raw = (text || []).map(p => p.text || '').join('');
  let parsed;
  try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
  catch { return json(502, { error: 'Could not read the answer. Try again.' }); }

  return json(200, {
    best_name: str(parsed.best_name),
    also_called: strList(parsed.also_called),
    what_it_is: str(parsed.what_it_is),
    category: str(parsed.category),
    search_terms: strList(parsed.search_terms),
    confidence: str(parsed.confidence)
  });
};
