import React, { useState } from 'react';

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

export function ArticleAssistant({ article, endpoint, token, onAccept }) {
  const [instruction, setInstruction] = useState('');
  const [messages, setMessages] = useState([]);
  const [proposal, setProposal] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const askAssistant = async () => {
    const request = instruction.trim();
    if (!request || status === 'working') return;

    setInstruction('');
    setError('');
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
          messages,
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
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setStatus('idle');
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
