import {Link, Route, Routes, useParams} from "react-router-dom";
import React, {useEffect} from "react";
import ReactMarkdown from 'react-markdown'; // <--- THIS WAS MISSING
import { ARTICLES } from '../data/articlesData.js';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-python';


export function ArticleReader() {
  const { articleId } = useParams();
  const article = ARTICLES.find((a) => a.id === articleId);

  useEffect(() => {
    // Re-run Prism code syntax highlighting after markdown renders
    Prism.highlightAll();
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

      {/* Replaced <div>{article.content}</div> with ReactMarkdown */}
      <ReactMarkdown>{article.content}</ReactMarkdown>
    </article>
  );
}
