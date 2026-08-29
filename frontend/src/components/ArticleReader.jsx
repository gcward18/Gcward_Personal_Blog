import React, { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import Prism from 'prismjs';

import { ARTICLES } from '../data/articlesData.js';
import { MermaidDiagram } from './MermaidDiagram.jsx';

import 'katex/dist/katex.min.css';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-python';

export function ArticleReader() {
  const { articleId } = useParams();
  const article = ARTICLES.find((a) => a.id === articleId);

  useEffect(() => {
    if (article) {
      const timer = setTimeout(() => {
        Prism.highlightAll();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [articleId, article]);

  if (!article) {
    return (
      <div>
        <h2>Article not found</h2>
        <Link to="/">&lt; Return Home</Link>
      </div>
    );
  }

  return (
    <article className="article-body">
      <p style={{ marginBottom: '20px' }}>
        <Link to="/">&lt; Return Home</Link>
      </p>
      <h1>{article.title}</h1>
      <p className="meta">
        [SYS_DATE: {article.date}] | [CAT: {article.category}]
      </p>

      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isMermaid = match && match[1] === 'mermaid';

            if (isMermaid) {
              return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />;
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {article.content}
      </ReactMarkdown>
    </article>
  );
}