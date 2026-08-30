import React, { useState, useEffect } from 'react'; // Added useState!
import { Routes, Route, Link, useParams } from 'react-router-dom';
import {ArticleReader } from './components/ArticleReader.jsx'
import {ARTICLES} from "./data/articlesData.js";

function ThemeToggle() {
  const [theme, setTheme] = useState(() =>
    window.localStorage.getItem('curious-theme') || 'light'
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('curious-theme', theme);
  }, [theme]);

  const nextTheme = theme === 'light' ? 'dark' : 'light';

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
    </button>
  );
}

function Header() {
  return (
    <header className="profile-header-container">
      <div className="brand-bar">
        <Link className="brand" to="/" aria-label="The Curious Developer home">
          <span className="brand-mark" aria-hidden="true">?</span>
          <span>The Curious Developer</span>
        </Link>
        <nav className="contact-bar" aria-label="External links">
          <a href="https://github.com/gcward18" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://www.linkedin.com/in/georgecward/" target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="mailto:gcward18@gmail.com">Say hello</a>
          <ThemeToggle />
        </nav>
      </div>

      <div className="profile-main">
        <div className="profile-bio">
          <p className="eyebrow">FIELD NOTES FOR CURIOUS ENGINEERS</p>
          <h1>Stay curious. <span>Build with intention.</span></h1>
          <p className="hero-copy">
            Practical explorations of cloud architecture, artificial intelligence,
            and the ideas that make software systems easier to understand.
          </p>
          <div className="profile-tags" aria-label="Topics">
            <span className="tag">Cloud architecture</span>
            <span className="tag">AI systems</span>
            <span className="tag">Developer craft</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function Home() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredArticles = ARTICLES.filter((article) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    const matchesTitle = (article.title ?? '').toLowerCase().includes(query);
    const matchesSnippet = (article.snippet ?? '').toLowerCase().includes(query);
    const matchesTags = (article.tags ?? []).some((tag) =>
      String(tag).toLowerCase().includes(query)
    );

    return matchesTitle || matchesSnippet || matchesTags;
  });

  return (
    <>
      <div className="home-controls">
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
