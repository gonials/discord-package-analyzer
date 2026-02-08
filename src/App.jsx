import React, { useState, useCallback } from 'react';
import LoadScreen from './components/LoadScreen';
import Layout from './components/Layout';
import Overview from './views/Overview';
import Messages from './views/Messages';
import RandomMessage from './views/RandomMessage';
import Insights from './views/Insights';
import Vocabulary from './views/Vocabulary';
import Timeline from './views/Timeline';
import './App.css';

const PASSWORD_HASH = '259d4d1b1b40dacd66fcff8de35d21b54e838d43b1919c4188cead41f2c188e8';

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const VIEWS = {
  overview: Overview,
  messages: Messages,
  random: RandomMessage,
  insights: Insights,
  vocabulary: Vocabulary,
  timeline: Timeline,
};

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('overview');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const handlePasswordSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const pwd = passwordInput.trim();
      if (!pwd) {
        setPasswordError('Enter a password.');
        return;
      }
      setPasswordError('');
      setPasswordSubmitting(true);
      try {
        const hash = await sha256(pwd);
        if (hash.toLowerCase() === PASSWORD_HASH.toLowerCase()) {
          setUnlocked(true);
          setPasswordInput('');
        } else {
          setPasswordError('Incorrect password.');
        }
      } catch (err) {
        setPasswordError('Something went wrong. Try again.');
      } finally {
        setPasswordSubmitting(false);
      }
    },
    [passwordInput]
  );

  const handleLoad = useCallback((result) => {
    setLoading(false);
    setError(null);
    if (result?.error) {
      setError(result.error);
      setData(null);
      return;
    }
    setData(result);
    setError(null);
  }, []);

  const handleStartLoad = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  const hasData = data && !data.error && data.stats;

  if (!unlocked) {
    return (
      <div className="password-screen">
        <div className="password-card">
          <h1 className="password-title">
            Discord Data Analyzer by <span className="brand-gold">gonials</span>
          </h1>
          <p className="password-subtitle">Enter the password to continue.</p>
          <form onSubmit={handlePasswordSubmit} className="password-form">
            <input
              type="password"
              className="password-input"
              placeholder="Password"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setPasswordError('');
              }}
              autoFocus
              autoComplete="current-password"
              disabled={passwordSubmitting}
            />
            {passwordError && <div className="password-error">{passwordError}</div>}
            <button type="submit" className="btn-primary password-btn" disabled={passwordSubmitting}>
              {passwordSubmitting ? 'Checking…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <LoadScreen
        onLoad={handleLoad}
        onStartLoad={handleStartLoad}
        loading={loading}
        error={error}
      />
    );
  }

  const ViewComponent = VIEWS[view] || Overview;

  return (
    <Layout
      data={data}
      currentView={view}
      onViewChange={setView}
      onLoadNew={() => setData(null)}
    >
      <ViewComponent data={data} />
    </Layout>
  );
}
