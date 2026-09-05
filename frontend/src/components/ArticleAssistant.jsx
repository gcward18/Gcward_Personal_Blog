import React, { useEffect, useState } from 'react';

function createLineDiff(original, revised) {
  const before = original.split('\n');
  const after = revised.split('\n');
  const prefix = [];
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    prefix.push({ type: 'same', text: before[start] });
    start += 1;
  }

  let beforeEnd = before.length - 1;
  let afterEnd = after.length - 1;
  const suffix = [];
  while (beforeEnd >= start && afterEnd >= start && before[beforeEnd] === after[afterEnd]) {
    suffix.unshift({ type: 'same', text: before[beforeEnd] });
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return [
    ...prefix,
    ...before.slice(start, beforeEnd + 1).map((text) => ({ type: 'removed', text })),
    ...after.slice(start, afterEnd + 1).map((text) => ({ type: 'added', text })),
    ...suffix,
  ];
}

export function ArticleAssistant({ article, articleMeta, endpoint, linkedinEndpoint, token, onAccept }) {
  const [instruction, setInstruction] = useState('');
  const [messages, setMessages] = useState([]);
  const [proposal, setProposal] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [socialPost, setSocialPost] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentAlt, setAttachmentAlt] = useState('');
  const [linkedin, setLinkedin] = useState({ connected: false, displayName: '', organizationName: '', status: 'idle' });
  const [publishMessage, setPublishMessage] = useState('');

  useEffect(() => () => {
    if (attachment?.objectUrl) URL.revokeObjectURL(attachment.url);
  }, [attachment]);

  const linkedinRequest = async (payload) => {
    const request = await fetch(linkedinEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await request.json();
    if (!request.ok) throw new Error(result.error || 'LinkedIn could not complete the request.');
    return result;
  };

  useEffect(() => {
    if (!linkedinEndpoint || !token) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error');
    const finish = () => window.history.replaceState({}, '', window.location.pathname);

    setLinkedin((current) => ({ ...current, status: 'working' }));
    if (oauthError) {
      setError('LinkedIn connection was cancelled or denied.');
      finish();
    }
    const payload = code && state ? { action: 'callback', code, state } : { action: 'status' };
    linkedinRequest(payload)
      .then((result) => {
        setLinkedin({ connected: result.connected, displayName: result.displayName || '', organizationName: result.organizationName || '', status: 'idle' });
        if (code) finish();
      })
      .catch((requestError) => {
        setLinkedin({ connected: false, displayName: '', organizationName: '', status: 'idle' });
        setError(requestError.message);
        if (code) finish();
      });
  }, [linkedinEndpoint, token]);

  const runAssistant = async (requestedInstruction, mode = 'article') => {
    const request = requestedInstruction.trim();
    if (!request || status === 'working') return;

    if (mode === 'article') setInstruction('');
    setError('');
    setCopyStatus('');
    setStatus('working');
    const userMessage = { role: 'user', content: request };
    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instruction: request,
          article,
          articleMeta,
          messages,
          mode,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The assistant request failed.');

      setMessages((current) => [
        ...current,
        { role: 'assistant', content: result.feedback },
      ]);
      setProposal(result.changed && result.markdown !== article ? {
        original: article,
        revised: result.markdown,
        lines: createLineDiff(article, result.markdown),
      } : null);
      if (result.socialPost) setSocialPost(result.socialPost);
      if (result.imageBase64) {
        setAttachment({
          url: `data:${result.contentType || 'image/png'};base64,${result.imageBase64}`,
          name: result.filename || 'linkedin-article-image.png',
          type: result.contentType || 'image/png',
          source: 'AI-generated',
        });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setStatus('idle');
    }
  };

  const askAssistant = () => runAssistant(instruction);

  const generateLinkedInPost = () => runAssistant(
    'Create a concise LinkedIn post that introduces this article, gives readers a useful reason to open it, includes the article link, and ends with a few relevant hashtags.',
    'linkedin',
  );

  const generateLinkedInImage = () => runAssistant(
    imagePrompt.trim() || `Create an editorial image for the article titled “${articleMeta?.title || 'this article'}”.`,
    'linkedin_image',
  );

  const uploadAttachment = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Choose a PNG or JPEG image for LinkedIn.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError('The image must be 6 MB or smaller.');
      return;
    }
    setError('');
    setAttachment({
      url: URL.createObjectURL(file),
      objectUrl: true,
      file,
      name: file.name,
      type: file.type,
      source: 'Uploaded',
    });
  };

  const connectLinkedIn = async () => {
    try {
      setLinkedin((current) => ({ ...current, status: 'working' }));
      const result = await linkedinRequest({ action: 'authorize' });
      window.location.assign(result.authorizeUrl);
    } catch (requestError) {
      setLinkedin((current) => ({ ...current, status: 'idle' }));
      setError(requestError.message);
    }
  };

  const publishToLinkedIn = async () => {
    if (!window.confirm(`Publish this post to the ${linkedin.organizationName || 'company'} LinkedIn Page now? This action is public and cannot be undone here.`)) return;
    setPublishMessage('Publishing…');
    setError('');
    try {
      let encodedAttachment;
      if (attachment) {
        const blob = attachment.file || await (await fetch(attachment.url)).blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let index = 0; index < bytes.length; index += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        }
        encodedAttachment = {
          base64: btoa(binary),
          contentType: attachment.type,
          altText: attachmentAlt.trim() || articleMeta?.title || 'Article image',
        };
      }
      const result = await linkedinRequest({ action: 'publish', commentary: socialPost, attachment: encodedAttachment });
      setPublishMessage(result.postId ? `Published successfully (${result.postId}).` : 'Published successfully.');
    } catch (requestError) {
      setPublishMessage('');
      setError(requestError.message);
    }
  };

  const copyLinkedInPost = async () => {
    try {
      await navigator.clipboard.writeText(socialPost);
      setCopyStatus('Copied');
    } catch {
      setError('Copying was blocked by the browser. Select the post text and copy it manually.');
    }
  };

  const acceptProposal = () => {
    if (article !== proposal.original) {
      setError('The article changed after this suggestion was created. Ask the assistant again to avoid overwriting newer edits.');
      return;
    }
    onAccept(proposal.revised);
    setProposal(null);
    setError('');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      askAssistant();
    }
  };

  if (!endpoint || !token) {
    return (
      <aside className="article-assistant locked">
        <div className="assistant-heading">
          <div><span className="premium-badge">Premium</span><h3>AI writing assistant</h3></div>
        </div>
        <p>Sign in with an author account to discuss and revise this article with Bedrock.</p>
      </aside>
    );
  }

  return (
    <aside className="article-assistant">
      <div className="assistant-heading">
        <div><span className="premium-badge">Premium</span><h3>AI writing assistant</h3></div>
        <span className="assistant-provider">Amazon Bedrock</span>
      </div>

      <div className="assistant-quick-actions">
        <button type="button" disabled={!article.trim() || status === 'working'} onClick={generateLinkedInPost}>
          Generate LinkedIn post
        </button>
      </div>

      <div className="assistant-conversation" aria-live="polite">
        {messages.length === 0 && (
          <p className="assistant-empty">Ask for an outline, editorial feedback, or a Markdown revision.</p>
        )}
        {messages.map((message, index) => (
          <div className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}>
            <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
            <p>{message.content}</p>
          </div>
        ))}
        {status === 'working' && <p className="assistant-thinking">Reviewing the article…</p>}
      </div>

      {proposal && (
        <section className="assistant-proposal">
          <div className="proposal-heading">
            <h4>Suggested changes</h4>
            <div>
              <button type="button" className="text-button" onClick={() => setProposal(null)}>Reject</button>
              <button type="button" className="primary-button" onClick={acceptProposal}>Accept changes</button>
            </div>
          </div>
          <pre className="article-diff" aria-label="Article changes">
            {proposal.lines.map((line, index) => (
              <span className={`diff-line ${line.type}`} key={index}>
                <span className="diff-marker">{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span>
                {line.text || ' '}
              </span>
            ))}
          </pre>
        </section>
      )}

      {socialPost && (
        <section className="social-post-draft">
          <div className="proposal-heading">
            <h4>LinkedIn post draft</h4>
            <button type="button" className="text-button" onClick={copyLinkedInPost}>
              {copyStatus || 'Copy post'}
            </button>
          </div>
          <label>
            Review and edit before posting
            <textarea
              rows="10"
              value={socialPost}
              onChange={(event) => {
                setSocialPost(event.target.value);
                setCopyStatus('');
              }}
            />
          </label>
          <p className={socialPost.length > 3000 ? 'character-count over-limit' : 'character-count'}>
            {socialPost.length.toLocaleString()} / 3,000 characters
          </p>

          <div className="post-attachment-editor">
            <div className="proposal-heading">
              <h4>Post image <span>(optional)</span></h4>
              {attachment && (
                <button type="button" className="text-button" onClick={() => setAttachment(null)}>Remove</button>
              )}
            </div>
            {attachment ? (
              <figure className="attachment-preview">
                <img src={attachment.url} alt="LinkedIn post attachment preview" />
                <figcaption>{attachment.name} · {attachment.source}</figcaption>
              </figure>
            ) : (
              <p className="attachment-empty">Add one image to accompany the LinkedIn post.</p>
            )}
            <label className="image-prompt-label">
              AI image direction
              <textarea
                rows="3"
                value={imagePrompt}
                maxLength="700"
                onChange={(event) => setImagePrompt(event.target.value)}
                placeholder="Optional: A clean editorial illustration of speech becoming a search workflow, dark blue and warm orange."
              />
            </label>
            <div className="attachment-actions">
              <button type="button" disabled={status === 'working'} onClick={generateLinkedInImage}>
                {status === 'working' ? 'Working…' : 'Generate with AI'}
              </button>
              <label className="upload-button">
                Upload image
                <input type="file" accept="image/png,image/jpeg" onChange={uploadAttachment} />
              </label>
              {attachment && <a href={attachment.url} download={attachment.name}>Download image</a>}
            </div>
            {attachment && (
              <label className="attachment-alt-label">
                Image description for accessibility
                <input value={attachmentAlt} maxLength="4086" onChange={(event) => setAttachmentAlt(event.target.value)} placeholder={articleMeta?.title || 'Describe the image'} />
              </label>
            )}
            <p className="attachment-note">PNG or JPEG; maximum 6 MB. Review generated images before publishing.</p>
          </div>

          <div className="linkedin-publish-controls">
            {linkedin.connected ? (
              <>
                <span>{linkedin.displayName} publishing to {linkedin.organizationName}</span>
                <button type="button" className="primary-button" disabled={!socialPost.trim() || socialPost.length > 3000 || publishMessage === 'Publishing…'} onClick={publishToLinkedIn}>
                  Publish to LinkedIn
                </button>
              </>
            ) : (
              <button type="button" disabled={!linkedinEndpoint || linkedin.status === 'working'} onClick={connectLinkedIn}>
                {linkedin.status === 'working' ? 'Checking LinkedIn…' : 'Connect LinkedIn'}
              </button>
            )}
          </div>
          {publishMessage && <p className="linkedin-publish-message" role="status">{publishMessage}</p>}
        </section>
      )}

      <label className="assistant-input-label">
        Discuss or request changes
        <textarea
          rows="4"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="For example: Make the introduction clearer and add a concise conclusion."
        />
      </label>
      <div className="assistant-submit-row">
        <span>⌘/Ctrl + Enter</span>
        <button className="primary-button" type="button" disabled={!instruction.trim() || status === 'working'} onClick={askAssistant}>Send</button>
      </div>
      {error && <p className="assistant-error" role="alert">{error}</p>}
    </aside>
  );
}
