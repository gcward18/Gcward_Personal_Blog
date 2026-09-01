import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { ArticleAssistant } from './ArticleAssistant.jsx';

const emptyDraft = {
  title: '',
  slug: '',
  snippet: '',
  tags: '',
  content: '',
};

const localConfig = {
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  authorizeUrl: import.meta.env.VITE_COGNITO_AUTHORIZE_URL,
  publishApiUrl: import.meta.env.VITE_PUBLISH_API_URL,
  assistantApiUrl: import.meta.env.VITE_ASSISTANT_API_URL,
};

const hasCompleteConfig = (config) =>
  Boolean(config?.clientId && config?.authorizeUrl && config?.publishApiUrl);

const isLocalDevelopment = import.meta.env.DEV;

function parseTokenFromHash() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('id_token');
  const returnedState = params.get('state');
  const expectedState = window.sessionStorage.getItem('author-oauth-state');

  if (token && returnedState && returnedState === expectedState) {
    window.sessionStorage.setItem('author-id-token', token);
    window.sessionStorage.removeItem('author-oauth-state');
    window.history.replaceState({}, '', window.location.pathname);
    return token;
  }

  return window.sessionStorage.getItem('author-id-token');
}

export function AuthorStudio() {
  const [config, setConfig] = useState(() => (
    isLocalDevelopment && hasCompleteConfig(localConfig) ? localConfig : null
  ));
  const [token, setToken] = useState(() => parseTokenFromHash());
  const [draft, setDraft] = useState(emptyDraft);
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [editorMode, setEditorMode] = useState('write');
  const editorRef = useRef(null);

  useEffect(() => {
    if (isLocalDevelopment) return;

    fetch('/author-config.json', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Author configuration is unavailable.');
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Author configuration has not been deployed yet.');
        }
        const result = await response.json();
        if (!hasCompleteConfig(result)) {
          throw new Error('Author configuration is incomplete.');
        }
        return result;
      })
      .then(setConfig)
      .catch((error) => {
        if (hasCompleteConfig(localConfig)) {
          setConfig(localConfig);
          return;
        }
        setStatus({
          type: 'error',
          message: `${error.message} Deploy BlogStack or configure the local author environment.`,
        });
      });
  }, []);

  const loginUrl = useMemo(() => {
    if (!config) return '';
    const state = crypto.randomUUID();
    const redirectUri = `${window.location.origin}/author`;
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'token',
      scope: 'openid email profile',
      redirect_uri: redirectUri,
      state,
    });
    return { url: `${config.authorizeUrl}?${params}`, state };
  }, [config]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
  };

  const insertMarkdown = (before, after = '', fallback = '') => {
    const editor = editorRef.current;
    const start = editor?.selectionStart ?? draft.content.length;
    const end = editor?.selectionEnd ?? start;
    const selection = draft.content.slice(start, end) || fallback;
    const insertion = `${before}${selection}${after}`;

    setDraft((current) => ({
      ...current,
      content: `${current.content.slice(0, start)}${insertion}${current.content.slice(end)}`,
    }));
    setEditorMode('write');

    requestAnimationFrame(() => {
      editor?.focus();
      const selectionStart = start + before.length;
      editor?.setSelectionRange(selectionStart, selectionStart + selection.length);
    });
  };

  const editorActions = [
    { label: 'Section', title: 'Add a section heading', action: () => insertMarkdown('\n## ', '\n', 'Section title') },
    { label: 'Table', title: 'Add a Markdown table', action: () => insertMarkdown('\n| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n| Value 3 | Value 4 |\n') },
    { label: 'Collapse', title: 'Add a collapsible heading', action: () => insertMarkdown('\n<details>\n<summary>', '</summary>\n\nAdd hidden content here.\n\n</details>\n', 'Expandable heading') },
    { label: 'Code', title: 'Add a fenced code block', action: () => insertMarkdown('\n```text\n', '\n```\n', 'Add code here') },
  ];

  const signIn = () => {
    if (!loginUrl) return;
    window.sessionStorage.setItem('author-oauth-state', loginUrl.state);
    window.location.assign(loginUrl.url);
  };

  const signOut = () => {
    window.sessionStorage.removeItem('author-id-token');
    setToken(null);
  };

  const submitDraft = async (event) => {
    event.preventDefault();
    setStatus({
      type: 'working',
      message: isLocalDevelopment ? 'Saving local article…' : 'Creating review request…',
    });

    try {
      const response = await fetch(
        isLocalDevelopment ? '/api/dev/articles' : config.publishApiUrl,
        {
        method: 'POST',
        headers: {
          ...(!isLocalDevelopment && { Authorization: `Bearer ${token}` }),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...draft,
          tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The article could not be saved.');
      setStatus({
        type: 'success',
        message: isLocalDevelopment
          ? `Saved to frontend/src/content/${draft.slug}.json.`
          : 'Draft submitted for review.',
        url: result.pullRequestUrl,
      });
      setDraft(emptyDraft);
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <main className="author-studio">
      <Link className="back-button" to="/">← Back to articles</Link>
      <p className="eyebrow author-eyebrow">CURIOUS DEVELOPER PUBLISHING</p>
      <h1>Author studio</h1>
      <p className="author-intro">
        {isLocalDevelopment
          ? 'Development mode saves articles directly into your local content directory.'
          : 'Reader access is public. Members of the Authors group can submit a draft, which opens a GitHub pull request for editorial review before publication.'}
      </p>

      {!token && !isLocalDevelopment ? (
        <section className="author-login">
          <h2>Author sign in</h2>
          <p>Use your approved author account to create a review request.</p>
          <button className="primary-button" type="button" onClick={signIn} disabled={!config}>
            Sign in to write
          </button>
        </section>
      ) : (
        <form className="author-form" onSubmit={submitDraft}>
          <div className="author-form-heading">
            <div>
              <h2>New article</h2>
              <p>{isLocalDevelopment ? 'Changes are saved locally and reload automatically.' : 'The draft remains unpublished until its pull request is merged.'}</p>
            </div>
            {isLocalDevelopment
              ? <div className="development-controls">
                  <span className="development-badge">Local development</span>
                  {!token && config && <button className="text-button" type="button" onClick={signIn}>Connect premium AI</button>}
                </div>
              : <button className="text-button" type="button" onClick={signOut}>Sign out</button>}
          </div>

          <label>Title<input required name="title" value={draft.title} onChange={updateField} /></label>
          <label>Slug<input required name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="secure-cross-account-access" value={draft.slug} onChange={updateField} /></label>
          <label>Summary<textarea required name="snippet" rows="3" value={draft.snippet} onChange={updateField} /></label>
          <label>Tags<input name="tags" placeholder="AWS, Security, IAM" value={draft.tags} onChange={updateField} /></label>
          <div className="markdown-field">
            <div className="markdown-field-header">
              <span id="article-markdown-label">Article Markdown</span>
              <div className="editor-tabs" role="tablist" aria-label="Article view">
                <button className={editorMode === 'write' ? 'active' : ''} type="button" role="tab" aria-selected={editorMode === 'write'} onClick={() => setEditorMode('write')}>Write</button>
                <button className={editorMode === 'preview' ? 'active' : ''} type="button" role="tab" aria-selected={editorMode === 'preview'} onClick={() => setEditorMode('preview')}>Preview</button>
              </div>
            </div>
            <div className="markdown-toolbar" role="toolbar" aria-label="Insert Markdown">
              {editorActions.map((item) => (
                <button key={item.label} type="button" title={item.title} onClick={item.action}>{item.label}</button>
              ))}
            </div>
            {editorMode === 'write' ? (
              <textarea
                ref={editorRef}
                required
                aria-labelledby="article-markdown-label"
                className="markdown-editor"
                name="content"
                rows="22"
                placeholder="Start writing your article in Markdown…"
                value={draft.content}
                onChange={updateField}
              />
            ) : (
              <div className="markdown-preview article-body" role="tabpanel">
                {draft.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{draft.content}</ReactMarkdown>
                ) : (
                  <p className="markdown-preview-empty">Nothing to preview yet.</p>
                )}
              </div>
            )}
            <p className="markdown-help">Select text before using Section, Collapse, or Code to wrap it.</p>
          </div>

          <ArticleAssistant
            article={draft.content}
            endpoint={config?.assistantApiUrl}
            token={token}
            onAccept={(content) => {
              setDraft((current) => ({ ...current, content }));
              setEditorMode('write');
            }}
          />

          <button className="primary-button" type="submit" disabled={status.type === 'working'}>
            {status.type === 'working'
              ? (isLocalDevelopment ? 'Saving…' : 'Creating request…')
              : (isLocalDevelopment ? 'Save locally' : 'Submit for review')}
          </button>
        </form>
      )}

      {status.message && (
        <p className={`author-status ${status.type}`} role="status">
          {status.message}{' '}
          {status.url && <a href={status.url} target="_blank" rel="noreferrer">Open pull request</a>}
        </p>
      )}
    </main>
  );
}
