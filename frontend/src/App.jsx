import React, { useState, useEffect } from 'react'; // Added useState!
import { Routes, Route, Link, useParams } from 'react-router-dom';
import {ArticleReader } from './components/ArticleReader.jsx'
import {ARTICLES} from "./data/articlesData.js";

function Header() {
  return (
    <header className="profile-header-container">
      <nav className="contact-bar">
        <a href="mailto:gcward18@gmail.com">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm9 7.2L20.4 7H3.6l8.4 5.2Zm0 2.3L3 8.9V17h18V8.9l-9 5.6Z" />
          </svg>
          <span>gcward18@gmail.com</span>
        </a>
        <a href="https://github.com/gcward18" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 .7A11.5 11.5 0 0 0 8.4 23c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17.4 4.7 18.4 5 18.4 5c.6 1.5.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.5 5.7.5.4.9 1.1.9 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .7Z" />
          </svg>
          <span>GitHub</span>
        </a>
        <a href="https://www.linkedin.com/in/georgecward/" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2ZM8 19H5V9.5h3V19ZM6.5 8.2A1.75 1.75 0 1 1 6.5 4.7a1.75 1.75 0 0 1 0 3.5ZM19 19h-3v-4.6c0-1.1 0-2.5-1.5-2.5s-1.8 1.2-1.8 2.4V19h-3V9.5h2.9v1.3h.1a3.2 3.2 0 0 1 2.8-1.5c3 0 3.5 2 3.5 4.5V19Z" />
          </svg>
          <span>LinkedIn</span>
        </a>
        <a href="https://www.instagram.com/georgeward.ifbb/" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7.2 2h9.6A5.2 5.2 0 0 1 22 7.2v9.6a5.2 5.2 0 0 1-5.2 5.2H7.2A5.2 5.2 0 0 1 2 16.8V7.2A5.2 5.2 0 0 1 7.2 2Zm-.2 2A3 3 0 0 0 4 7v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm10.3 1.5a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
          </svg>
          <span>Instagram</span>
        </a>
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
