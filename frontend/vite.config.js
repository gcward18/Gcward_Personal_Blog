import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function localArticleWriter() {
  return {
    name: 'local-article-writer',
    configureServer(server) {
      server.middlewares.use('/api/dev/articles', (request, response, next) => {
        if (request.method !== 'POST') return next();

        let body = '';
        request.on('data', (chunk) => { body += chunk; });
        request.on('end', async () => {
          response.setHeader('Content-Type', 'application/json');

          try {
            const draft = JSON.parse(body);
            const slug = String(draft.slug || '').trim().toLowerCase();
            if (!slugPattern.test(slug) || !draft.title || !draft.snippet || !draft.content) {
              response.statusCode = 400;
              response.end(JSON.stringify({ error: 'Title, valid slug, summary, and content are required.' }));
              return;
            }

            const contentDirectory = path.resolve(process.cwd(), 'src/content');
            const article = {
              id: slug,
              title: String(draft.title).trim(),
              snippet: String(draft.snippet).trim(),
              tags: Array.isArray(draft.tags) ? draft.tags : [],
              date: new Date().toISOString().slice(0, 7),
              category: 'LOCAL',
              content: String(draft.content).trim(),
            };

            await mkdir(contentDirectory, { recursive: true });
            await writeFile(
              path.join(contentDirectory, `${slug}.json`),
              `${JSON.stringify(article, null, 2)}\n`,
              'utf8',
            );
            response.statusCode = 201;
            response.end(JSON.stringify({ status: 'saved', slug }));
          } catch (error) {
            response.statusCode = 400;
            response.end(JSON.stringify({ error: error.message || 'Invalid article data.' }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localArticleWriter()],
  server: {
    hot: true, // Enables HMR
    open: true, // Automatically opens browser on startup
  },
});
