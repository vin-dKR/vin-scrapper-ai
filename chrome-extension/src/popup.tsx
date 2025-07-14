import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getScrapedData, saveScrapedData } from './store';

declare const chrome: any;

const BACKEND_URL = 'http://localhost:3000/ask'; // Update if needed

const Popup = () => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [scraped, setScraped] = useState('');

  const handleScrape = async () => {
    setLoading(true);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
      if (tabs[0].id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: 'scrape' },
          async (response: { data: string }) => {
            if (response && response.data) {
              await saveScrapedData(response.data);
              setScraped(response.data);
            }
            setLoading(false);
          }
        );
      }
    });
  };

  const handleAsk = async () => {
    setLoading(true);
    const data = scraped || (await getScrapedData()) || '';
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context: data }),
    });
    const json = await res.json();
    setAnswer(json.answer);
    setLoading(false);
  };

  return (
    <div style={{ width: 300, padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={handleScrape} disabled={loading} style={{ width: '100%' }}>
        {loading ? 'Scraping...' : 'Scrape This Page'}
      </button>
      <textarea
        style={{ width: '100%', marginTop: 12 }}
        rows={3}
        placeholder="Ask about the page..."
        value={question}
        onChange={e => setQuestion(e.target.value)}
      />
      <button onClick={handleAsk} disabled={loading || !question} style={{ width: '100%', marginTop: 8 }}>
        {loading ? 'Asking...' : 'Ask AI'}
      </button>
      {answer && (
        <div style={{ marginTop: 12, background: '#f4f4f4', padding: 8, borderRadius: 4 }}>
          <b>Answer:</b>
          <div>{answer}</div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<Popup />);
