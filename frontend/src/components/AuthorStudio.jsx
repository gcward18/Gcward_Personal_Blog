import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

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
};

const hasCompleteConfig = (config) =>
  Boolean(config?.clientId && config?.authorizeUrl && config?.publishApiUrl);

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
  const [config, setConfig] = useState(null);
  const [token, setToken] = useState(() => parseTokenFromHash());
  const [draft, setDraft] = useState(emptyDraft);
  const [status, setStatus] = useState({ type: 'idle', message: '' });

  useEffect(() => {
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
    setStatus({ type: 'working', message: 'Creating review request…' });

    try {
      const response = await fetch(config.publishApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...draft,
          tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The review request failed.');
      setStatus({
        type: 'success',
        message: 'Draft submitted for review.',
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
        Reader access is public. Members of the Authors group can submit a draft,
        which opens a GitHub pull request for editorial review before publication.
      </p>

      {!token ? (
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
              <p>The draft remains unpublished until its pull request is merged.</p>
            </div>
            <button className="text-button" type="button" onClick={signOut}>Sign out</button>
          </div>

          <label>Title<input required name="title" value={draft.title} onChange={updateField} /></label>
          <label>Slug<input required name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="secure-cross-account-access" value={draft.slug} onChange={updateField} /></label>
          <label>Summary<textarea required name="snippet" rows="3" value={draft.snippet} onChange={updateField} /></label>
          <label>Tags<input name="tags" placeholder="AWS, Security, IAM" value={draft.tags} onChange={updateField} /></label>
          <label>Article Markdown<textarea required className="markdown-editor" name="content" rows="18" value={draft.content} onChange={updateField} /></label>

          <button className="primary-button" type="submit" disabled={status.type === 'working'}>
            {status.type === 'working' ? 'Creating request…' : 'Submit for review'}
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
