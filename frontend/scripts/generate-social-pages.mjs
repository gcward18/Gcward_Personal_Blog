import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARTICLES as CORE_ARTICLES } from '../src/data/articlesData.js';

const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = path.join(frontendDirectory, 'dist');
const contentDirectory = path.join(frontendDirectory, 'src', 'content');
const siteUrl = (process.env.SITE_URL || 'https://thecuriousengineerblog.dev').replace(/\/$/, '');

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function contributedArticles() {
  try {
    const names = (await readdir(contentDirectory)).filter((name) => name.endsWith('.json'));
    return Promise.all(names.map(async (name) => (
      JSON.parse(await readFile(path.join(contentDirectory, name), 'utf8'))
    )));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function socialMetadata(article) {
  const title = escapeAttribute(`${article.title} | The Curious Engineer`);
  const description = escapeAttribute(article.snippet || 'Practical field notes for curious engineers.');
  const url = escapeAttribute(`${siteUrl}/pages/${encodeURIComponent(article.id)}/`);
  const image = escapeAttribute(`${siteUrl}/social-card.png`);

  return `
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="The Curious Engineer" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:alt" content="The Curious Engineer — Stay curious. Build with intention." />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="627" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />`;
}

const template = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
const articles = [...await contributedArticles(), ...CORE_ARTICLES];

for (const article of articles) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.id)) {
    throw new Error(`Cannot generate social metadata for invalid article id: ${article.id}`);
  }

  const pageDirectory = path.join(distDirectory, 'pages', article.id);
  const page = template
    .replace(/<title>.*?<\/title>/, `<title>${escapeAttribute(article.title)} | The Curious Engineer</title>`)
    .replace(
      /<meta\s+name="description"[\s\S]*?\/>/,
      `<meta name="description" content="${escapeAttribute(article.snippet)}" />`,
    )
    .replace('</head>', `${socialMetadata(article)}\n  </head>`);

  await mkdir(pageDirectory, { recursive: true });
  await writeFile(path.join(pageDirectory, 'index.html'), page, 'utf8');
}

console.log(`Generated social metadata pages for ${articles.length} articles.`);
