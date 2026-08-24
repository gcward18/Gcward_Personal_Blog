import React, { useState, useEffect } from 'react'; // Added useState!
import { Routes, Route, Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown'; // <--- THIS WAS MISSINGç
import { ARTICLES } from './articlesData';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-python';

function Header() {
  return (
    <header className="profile-header-container">
      <nav className="contact-bar">
        <a href="mailto:gcward18@gmail.com">📧 gcward18@gmail.com</a>
        <span>•</span>
        <a href="https://github.com/gcward18" target="_blank" rel="noreferrer">🐙 GitHub</a>
        <span>•</span>
        <a href="https://www.linkedin.com/in/georgecward/" target="_blank" rel="noreferrer">💼 LinkedIn</a>
        <span>•</span>
        <a href="https://www.instagram.com/georgeward.ifbb/" target="_blank" rel="noreferrer">📸 Instagram</a>
      </nav>

      <div className="profile-main">
        <img
          src="https://avatars.githubusercontent.com/u/24943004?v=4"
          alt="George Ward"
          className="profile-avatar"
        />
        <div className="profile-bio">
          <h1>George Ward</h1>
          <p>
            Full-stack engineer passionate about building scalable systems,
            optimizing performance, and exploring AI to create smarter
            development workflows.
          </p>
          <div className="profile-tags">
            <span className="tag">Full-Stack</span>
            <span className="tag">Software Engineering</span>
            <span className="tag">System Design</span>
            <span className="tag">AWS CDK</span>
            <span className="tag">Python</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function Home() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredArticles = ARTICLES.filter((article) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    const matchesTitle = article.title.toLowerCase().includes(query);
    const matchesSnippet = article.snippet.toLowerCase().includes(query);
    const matchesTags = article.tags.some((tag) =>
      tag.toLowerCase().includes(query)
    );

    return matchesTitle || matchesSnippet || matchesTags;
  });

  return (
    <>
      <Header />
      <hr className="section-divider" />

      <div className="search-section">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles by title, tag, or content..."
          />
          {searchQuery && (
            <button
              className="clear-btn"
              onClick={() => setSearchQuery('')}
              type="button"
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        <div className="search-stats">
          {searchQuery.trim() === ''
            ? `Showing all ${ARTICLES.length} articles`
            : `Found ${filteredArticles.length} article${
                filteredArticles.length === 1 ? '' : 's'
              } for "${searchQuery}"`}
        </div>
      </div>

      <main className="search-results">
        {filteredArticles.length === 0 ? (
          <div className="no-results">
            <p>No matching articles found.</p>
          </div>
        ) : (
          filteredArticles.map((article) => (
            <article key={article.id} className="result-card">
              <div className="card-content">
                <div className="result-meta">
                  <span className="site-name">{article.siteName}</span>
                  <span className="site-url">{article.siteUrl}</span>
                </div>
                <h2 className="result-title">
                  <Link to={`/pages/${article.id}`}>{article.title}</Link>
                </h2>
                <p className="result-snippet">{article.snippet}</p>
                <div className="result-tags">
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      className="tag"
                      onClick={() => setSearchQuery(tag)}
                      style={{ cursor: 'pointer' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))
        )}
      </main>
    </>
  );
}
function ArticleReader() {
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

export default function App() {
  return (
    <div className="app-container">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pages/:articleId" element={<ArticleReader />} />
      </Routes>
    </div>
  );
}