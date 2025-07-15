import React, { useState, useRef, useEffect, KeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import { getScrapedData, saveScrapedData } from "./store";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
// @ts-expect-error: No types for react-syntax-highlighter
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
// @ts-expect-error: No types for react-syntax-highlighter styles
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

declare const chrome: any;

const BACKEND_URL = "http://localhost:3000/ask"

interface Message {
  role: "user" | "ai";
  content: string;
}

const Popup = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [scraped, setScraped] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleScrape = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setMessages(msgs => [...msgs, { role: "user", content: "[Scraping this page...]" }]);
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (tabs[0].id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "scrape" },
            async (response: { data: string }) => {
              if (chrome.runtime.lastError) {
                setMessages(msgs => [...msgs, { role: "ai", content: "Could not connect to the page. Try refreshing the page or make sure you're on a supported site." }]);
                setLoading(false);
                return;
              }
              if (response && response.data) {
                await saveScrapedData(response.data);
                setScraped(response.data);
                setMessages(msgs => [...msgs, { role: "ai", content: "Page scraped and ready!" }]);
              } else {
                setMessages(msgs => [...msgs, { role: "ai", content: "No data received from content script." }]);
              }
              setLoading(false);
            }
          );
        } else {
          setMessages(msgs => [...msgs, { role: "ai", content: "No active tab found." }]);
          setLoading(false);
        }
      });
    } catch (err) {
      setLoading(false);
      setMessages(msgs => [...msgs, { role: "ai", content: "[Error scraping page]" }]);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;
    setMessages(msgs => [...msgs, { role: "user", content: input }]);
    setLoading(true);
    try {
      const data = scraped || (await getScrapedData()) || "";
      if (!data) {
        setMessages(msgs => [...msgs, { role: "ai", content: "No scraped data available. Please scrape the page first." }]);
        setLoading(false);
        return;
      }
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input, context: data }),
      });
      const json = await res.json();
      setMessages(msgs => [...msgs, { role: "ai", content: json.answer }]);
      setInput("");
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setMessages(msgs => [...msgs, { role: "ai", content: "[Error getting answer from AI]" }]);
    }
  };

  // Handle Enter to submit, Shift+Enter for newline
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Custom styles for markdown elements
  const markdownComponents = {
    code({ node, inline, className, children, ...props }: { node?: any; inline?: boolean; className?: string; children?: React.ReactNode }) {
      const match = /language-(\w+)/.exec(className || "");
      return !inline && match ? (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{ margin: 0, borderRadius: 6, fontSize: 14 }}
          {...props}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      ) : (
        <code
          style={{
            background: "#eee",
            borderRadius: 4,
            padding: "2px 4px",
            fontSize: 13,
            margin: 0,
          }}
          {...props}
        >
          {children}
        </code>
      );
    },
    pre({ children, ...props }: { children?: React.ReactNode }) {
      return <pre style={{ margin: 0, borderRadius: 6 }}>{children}</pre>;
    },
    p({ children, ...props }: { children?: React.ReactNode }) {
      return <p style={{ margin: 0, marginBottom: 4 }}>{children}</p>;
    },
    math({ value }: { value?: string }) {
      return <span style={{ margin: 0 }}>{value}</span>;
    },
    inlineMath({ value }: { value?: string }) {
      return <span style={{ margin: 0 }}>{value}</span>;
    },
  };

  return (
    <div style={{ width: 350, height: 500, display: "flex", flexDirection: "column", background: "#f7f7f8", borderRadius: 12, boxShadow: "0 2px 12px #0001", overflow: "hidden", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: 16, background: "#fff", borderBottom: "1px solid #eee", fontWeight: 600, fontSize: 18, letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Vin Scrapper AI</span>
        <button onClick={handleScrape} disabled={loading} style={{ background: '#ececf1', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
          {loading ? "..." : "Scrape"}
        </button>
      </div>
      {/* Chat Area */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, background: "#f7f7f8" }}>
        {messages.length === 0 && (
          <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div>Ask anything about this page!</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{
              maxWidth: '80%',
              background: msg.role === 'user' ? '#4f8cff' : '#fff',
              color: msg.role === 'user' ? '#fff' : '#222',
              borderRadius: 16,
              borderBottomRightRadius: msg.role === 'user' ? 4 : 16,
              borderBottomLeftRadius: msg.role === 'user' ? 16 : 4,
              padding: '10px 14px',
              fontSize: 15,
              boxShadow: msg.role === 'user' ? '0 2px 8px #4f8cff22' : '0 2px 8px #0001',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              transition: 'background 0.2s',
            }}>
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      {/* Input Area */}
      <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', padding: 12, background: '#fff', borderTop: '1px solid #eee' }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your question..."
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: '#f7f7f8',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 15,
            marginRight: 8,
            minHeight: 36,
            maxHeight: 80,
            boxShadow: '0 1px 2px #0001',
          }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            background: '#4f8cff',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 18px',
            fontWeight: 600,
            fontSize: 15,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            boxShadow: '0 2px 8px #4f8cff22',
          }}
        >
          {loading ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<Popup />);
