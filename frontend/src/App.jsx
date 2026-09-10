import React, { useState, useEffect } from 'react'; // Added useState!
import { Routes, Route, Link, useParams } from 'react-router-dom';
import {ArticleReader } from './components/ArticleReader.jsx'
import { ARTICLES } from './data/articleCatalog.js';
import { AuthorStudio } from './components/AuthorStudio.jsx';
import { VIDEOS, getYouTubeThumbnail, getYouTubeUrl } from './data/videoCatalog.js';

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
        <Link className="brand" to="/" aria-label="The Curious Engineer home">
          <span className="brand-mark" aria-hidden="true">?</span>
          <span>The Curious Engineer</span>
        </Link>
        <nav className="contact-bar" aria-label="External links">
          <Link to="/author">Write</Link>
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
  const [section, setSection] = useState('articles');
  const [videoCategory, setVideoCategory] = useState('All');

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

  const videoCategories = ['All', ...new Set(VIDEOS.map((video) => video.category))];
  const filteredVideos = VIDEOS.filter((video) => {
    const matchesCategory = videoCategory === 'All' || video.category === videoCategory;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || [
      video.title,
      video.channel,
      video.description,
      video.category,
      ...(video.tags ?? []),
    ].some((value) => String(value).toLowerCase().includes(query));

    return matchesCategory && matchesSearch;
  });

  const switchSection = (nextSection) => {
    setSection(nextSection);
    setSearchQuery('');
  };

  return (
    <>
      <div className="home-controls">
        <Header />
        <hr className="section-divider" />

        <nav className="content-tabs" aria-label="Content sections">
          <button
            className={section === 'articles' ? 'active' : ''}
            type="button"
            onClick={() => switchSection('articles')}
          >
            Articles <span>{ARTICLES.length}</span>
          </button>
          <button
            className={section === 'videos' ? 'active' : ''}
            type="button"
            onClick={() => switchSection('videos')}
          >
            Videos <span>{VIDEOS.length}</span>
          </button>
        </nav>

        <div className="search-section">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${section} by title, tag, or ${section === 'videos' ? 'channel' : 'content'}...`}
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
            {section === 'articles'
              ? (searchQuery.trim() === ''
                ? `Showing all ${ARTICLES.length} articles`
                : `Found ${filteredArticles.length} article${filteredArticles.length === 1 ? '' : 's'} for "${searchQuery}"`)
              : `${filteredVideos.length} video${filteredVideos.length === 1 ? '' : 's'} in ${videoCategory}`}
          </div>
        </div>
      </div>

      <main className="search-results">
        {section === 'videos' && (
          <div className="category-filters" aria-label="Filter videos by category">
            {videoCategories.map((category) => (
              <button
                key={category}
                className={videoCategory === category ? 'active' : ''}
                type="button"
                onClick={() => setVideoCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {section === 'articles' && filteredArticles.length === 0 ? (
          <div className="no-results">
            <p>No matching articles found.</p>
          </div>
        ) : section === 'articles' ? (
          filteredArticles.map((article) => (
            <article key={article.id} className="result-card">
              {article.image && (
                <Link className="article-thumbnail" to={`/pages/${article.id}`} tabIndex="-1" aria-hidden="true">
                  <img src={article.image} alt="" loading="lazy" />
                </Link>
              )}
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
        ) : filteredVideos.length === 0 ? (
          <div className="no-results">
            <p>No matching videos found.</p>
          </div>
        ) : (
          <div className="video-grid">
            {filteredVideos.map((video) => (
              <article key={video.id} className="video-card">
                <a
                  className="video-thumbnail"
                  href={getYouTubeUrl(video.youtubeId, video.startSeconds)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Watch ${video.title} on YouTube`}
                >
                  <img src={getYouTubeThumbnail(video.youtubeId)} alt="" loading="lazy" />
                  <span className="play-button" aria-hidden="true">▶</span>
                </a>
                <div className="video-content">
                  <p className="video-category">{video.category}</p>
                  <h2 className="result-title">
                    <a href={getYouTubeUrl(video.youtubeId, video.startSeconds)} target="_blank" rel="noreferrer">
                      {video.title}
                    </a>
                  </h2>
                  <p className="video-channel">{video.channel}</p>
                  <p className="result-snippet">{video.description}</p>
                  <div className="result-tags">
                    {video.tags.map((tag) => (
                      <button key={tag} className="tag tag-button" type="button" onClick={() => setSearchQuery(tag)}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
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
        <Route path="/author" element={<AuthorStudio />} />
      </Routes>
    </div>
  );
}
