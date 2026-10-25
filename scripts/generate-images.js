// Dev-only: generates candidate dashboard/site images with Gemini.
// Usage: node scripts/generate-images.js <outDir> [model] [styleKeys...]
// Writes <outDir>/<style>-<subject>-<variant>.png; never touches public/.
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY ontbreekt in .env');
  process.exit(1);
}

const outDir = process.argv[2];
if (!outDir) {
  console.error('Usage: node scripts/generate-images.js <outDir> [model] [styleKeys...]');
  process.exit(1);
}
const model = process.argv[3] || 'gemini-3.1-flash-image';
const onlyStyles = process.argv.slice(4);
const VARIANTS = 2;

const PALETTE = 'Colour palette: soft sage green, warm ochre yellow, muted gold, cream, with deep navy as a small accent.';
const RULES = 'Square composition, subject centered with generous empty margin. Absolutely no text, no letters that form words, no captions, no logo, no watermark, no frame, no border, no rounded card edge. Plain background that fills the whole image.';

const STYLES = {
  watercolour: 'Soft hand-painted watercolour illustration on textured cream paper, visible gentle brush strokes and paint blooms, delicate pencil outlines, cosy and warm.',
  flat: 'Warm flat vector illustration, simple geometric shapes, subtle grain texture, no gradients, no outlines, modern and friendly.',
  clay: 'Playful 3D claymation style, rounded soft plasticine objects, soft studio lighting, gentle shadows, cheerful.',
  retro: 'Vintage 1960s board-game box art, retro offset print look with halftone dots and slightly faded inks, nostalgic.',
  lineart: 'Minimal clean line art with even medium-weight dark navy lines on a cream background, one single accent colour fill (ochre), icon-like, very simple.'
};

const SUBJECTS = {
  woordle: 'A word-guessing game: a small grid of square letter tiles, some tiles sage green, some ochre yellow, some light grey, each tile showing a single capital letter.',
  pictionary: 'A drawing-and-guessing game: a pencil and a paintbrush in front of a small easel with a cheerful simple sketch of a house and sun on it.',
  wiebenik: 'A "guess who I am" party game: a friendly mysterious figure in silhouette wearing a hat, with a big question mark floating beside the head. Use a deep navy and gold mood for this one.',
  icon: 'App icon for a cosy family games website: a single die and a small heart together, extremely simple and bold so it stays readable at 32 pixels.'
};

async function generate(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } }
    })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const part = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part) throw new Error('Geen afbeelding in antwoord');
  return Buffer.from(part.inlineData.data, 'base64');
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const styleKeys = onlyStyles.length ? onlyStyles : Object.keys(STYLES);
  const jobs = [];
  for (const style of styleKeys) {
    for (const [subject, subjectPrompt] of Object.entries(SUBJECTS)) {
      for (let v = 0; v < VARIANTS; v++) {
        jobs.push({ style, subject, v, prompt: `${STYLES[style]} ${subjectPrompt} ${PALETTE} ${RULES}` });
      }
    }
  }
  // Small concurrency to stay under rate limits
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      const file = path.join(outDir, `${job.style}-${job.subject}-${'AB'[job.v] || job.v}.png`);
      if (fs.existsSync(file)) continue;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          fs.writeFileSync(file, await generate(job.prompt));
          console.log('ok', path.basename(file));
          break;
        } catch (err) {
          console.error(`fail ${path.basename(file)} (attempt ${attempt}): ${err.message}`);
          await new Promise(r => setTimeout(r, 5000 * attempt));
        }
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
})();
