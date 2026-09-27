import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { ARTICLES } from '../src/data/articlesData.js';

const contributed = await Promise.all((await readdir(new URL('../src/content/', import.meta.url)))
  .filter(name => name.endsWith('.json'))
  .map(async name => JSON.parse(await readFile(new URL(`../src/content/${name}`, import.meta.url), 'utf8'))));
const feed = JSON.parse(await readFile(new URL('../dist/api/articles.json', import.meta.url), 'utf8'));
const source = [...contributed, ...ARTICLES];
assert.equal(feed.version, 1);
assert.equal(feed.articles.length, source.length);
assert.equal(new Set(feed.articles.map(article => article.id)).size, source.length);
for (const original of source) {
  const article = feed.articles.find(item => item.id === original.id);
  assert.equal(article.content, original.content, `${original.id}: Markdown must remain exact`);
  assert.equal(article.title, original.title);
  assert.equal(typeof article.date, 'string');
  assert.equal(typeof article.category, 'string');
  assert.ok(Array.isArray(article.tags));
  assert.equal(new URL(article.url).pathname, `/pages/${original.id}/`);
}
console.log(`Verified ${source.length} companion articles against canonical source content.`);
