import { ARTICLES as CORE_ARTICLES } from './articlesData.js';

const contributedModules = import.meta.glob('../content/*.json', {
  eager: true,
  import: 'default',
});

const CONTRIBUTED_ARTICLES = Object.values(contributedModules);

export const ARTICLES = [...CONTRIBUTED_ARTICLES, ...CORE_ARTICLES];
