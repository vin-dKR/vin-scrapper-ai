import React, { useState, useRef, useEffect, KeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
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

function getOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "unknown";
  }
}

const Popup = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [scraped, setScraped] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<string | null>(null);
  const [isSidePanel, setIsSidePanel] = useState(false);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [tabInfo, setTabInfo] = useState<{ tabId: number; origin: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get tabId and origin, then set session key
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
      if (tabs[0]?.id && tabs[0]?.url) {
        const tabId = tabs[0].id;
        const origin = getOrigin(tabs[0].url);
        setTabInfo({ tabId, origin });
        setSessionKey(`vin_scrapper_ai_${tabId}_${origin}`);
      }
    });
  }, []);

  // Load messages and scraped data for this session
  useEffect(() => {
    if (!sessionKey) return;
    chrome.storage.local.get([sessionKey], (result: any) => {
      if (result[sessionKey]?.messages) setMessages(result[sessionKey].messages);
      if (result[sessionKey]?.scraped) setScraped(result[sessionKey].scraped);
    });
  }, [sessionKey]);

  // Save messages and scraped data for this session
  useEffect(() => {
    if (!sessionKey) return;
    chrome.storage.local.get([sessionKey], (result: any) => {
      const prev = result[sessionKey] || {};
      chrome.storage.local.set({
        [sessionKey]: { ...prev, messages, scraped }
      });
    });
  }, [messages, scraped, sessionKey]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Detect if running in side panel
  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.innerHeight > 600) {
      setIsSidePanel(true);
    } else if (window.location.pathname.includes('sidepanel') || window.location.pathname.includes('panel')) {
      setIsSidePanel(true);
    }
  }, []);

  // Scrape logic
  const handleScrape = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setMessages(msgs => [...msgs, { role: "user", content: "[Scraping this page...]" }]);
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (tabs[0]?.id) {
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
                setScraped(response.data);
                setMessages(msgs => [...msgs, { role: "ai", content: "Page scraped and ready!" }]);
              } else {
                setMessages(msgs => [...msgs, { role: "ai", content: "No data received from content script." }]);
              }
              setLoading(false);
            }
          );
        }
      });
    } catch (err) {
      setLoading(false);
      setMessages(msgs => [...msgs, { role: "ai", content: "[Error scraping page]" }]);
    }
  };

  // Send logic
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;
    setMessages(msgs => [...msgs, { role: "user", content: input }]);
    setLoading(true);
    try {
      const data = scraped || "";
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

  // Copy code block
  const handleCopyCode = (code: string, idx: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 1200);
  };

  // Copy entire AI response
  const handleCopyResponse = (content: string, idx: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1200);
  };

  // Open side panel
  const openSidePanel = () => {
    if (chrome.sidePanel) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (tabs[0]?.id) {
          chrome.sidePanel.open({ tabId: tabs[0].id });
          window.close(); // Close the popup after opening side panel
        }
      });
    } else {
      alert("Side panel API not supported in this browser.");
    }
  };

  // Custom styles for markdown elements
  const markdownComponents = {
    code({ node, inline, className, children, ...props }: { node?: any; inline?: boolean; className?: string; children?: React.ReactNode }) {
      const match = /language-(\w+)/.exec(className || "");
      const codeStr = String(children).replace(/\n$/, "");
      const idx = `${className}-${codeStr.slice(0, 10)}`;
      return !inline && match ? (
        <div className="code-block-container" style={{ position: "relative" }}>
          <button
            onClick={() => handleCopyCode(codeStr, idx)}
            style={{ position: "absolute", top: 6, right: 8, zIndex: 2, background: "#222", color: "#fff", border: "none", borderRadius: 4, fontSize: 12, padding: "2px 8px", cursor: "pointer", opacity: 0.8, display: 'flex', alignItems: 'center' }}
            title="Copy code"
          >
            {copiedCodeIdx === idx ? "Copied!" : ClipboardSVG}
          </button>
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            customStyle={{ margin: 0, borderRadius: 6, fontSize: 14 }}
            className="block-code"
            {...props}
          >
            {codeStr}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code
          className="inline-code"
          style={{
            background: "#eee",
            color: "#222",
            borderRadius: 4,
            padding: "2px 4px",
            fontSize: 13,
            margin: 0,
            overflowX: "auto",
            maxWidth: "100%",
            display: "inline-block",
            verticalAlign: "middle",
          }}
          {...props}
        >
          {children}
        </code>
      );
    },
    pre({ children, ...props }: { children?: React.ReactNode }) {
      return <pre className="inline-code" style={{ margin: 0, borderRadius: 6 }}>{children}</pre>;
    },
    p({ children, ...props }: { children?: React.ReactNode }) {
      return <p style={{ margin: 0, marginBottom: 2 }}>{children}</p>;
    },
    ul({ children, ...props }: { children?: React.ReactNode }) {
      return <ul style={{ display: "flex", flexDirection: "column", margin: 0, marginBottom: 2, padding: 0 }}>{children}</ul>;
    },
    math({ value }: { value?: string }) {
      return <span style={{ margin: 0 }}>{value}</span>;
    },
    inlineMath({ value }: { value?: string }) {
      return <span style={{ margin: 0 }}>{value}</span>;
    },
  };

  // SVG for clipboard
  const ClipboardSVG = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="2" width="8" height="12" rx="2" stroke="#fff" strokeWidth="1.5" fill="#333" />
      <rect x="6" y="0.5" width="4" height="3" rx="1" stroke="#fff" strokeWidth="1.2" fill="#4f8cff" />
    </svg>
  );

  // SVG for side panel icon
  const SidePanelSVG = (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-panel-right-icon lucide-panel-right"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M15 3v18" /></svg>
  );

  // Define shared style objects
  const aiBubbleStyle = {
    maxWidth: '80%',
    background: '#222',
    color: '#fff',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 16,
    padding: '10px 14px',
    fontSize: 15,
    boxShadow: '0 2px 8px #0001',
    wordBreak: 'break-word' as const,
    whiteSpace: 'pre-wrap',
    transition: 'background 0.2s',
    position: 'relative' as const,
  };
  const userBubbleStyle = {
    maxWidth: '80%',
    background: '#4f8cff',
    color: '#fff',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 16,
    padding: '10px 14px',
    fontSize: 15,
    boxShadow: '0 2px 8px #4f8cff22',
    wordBreak: 'break-word' as const,
    whiteSpace: 'pre-wrap',
    transition: 'background 0.2s',
    position: 'relative' as const,
  };
  const aiCopyBtnStyle = {
    position: 'absolute' as const,
    bottom: -25,
    left: 0,
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    fontSize: 12,
    padding: '2px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    opacity: 1,
    zIndex: 2,
  };

  function AiMessage({ content, onCopy, copied, idx }: { content: string, onCopy: () => void, copied: boolean, idx: number }) {
    return (
      <div className="ai-bubble-container" style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 24, position: 'relative' }}>
        <div style={aiBubbleStyle}>
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
        <button
          onClick={onCopy}
          className="ai-copy-btn"
          style={aiCopyBtnStyle}
          title="Copy response"
        >
          {copied ? "Copied!" : ClipboardSVG}
        </button>
      </div>
    );
  }

  function UserMessage({ content }: { content: string }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24, position: 'relative' }}>
        <div style={userBubbleStyle}>
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ width: isSidePanel ? '100%' : 350, height: isSidePanel ? '100vh' : 500, display: "flex", flexDirection: "column", background: "#000000", boxShadow: "0 2px 12px #0001", overflow: "hidden", fontFamily: "Inter, sans-serif" }}>
        {/* Header */}
        <div style={{ padding: 16, background: "#18181a", borderBottom: "1px solid #333", fontWeight: 600, fontSize: 18, letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
          <span>Vin Scrapper AI</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleScrape} disabled={loading} style={{ background: '#ececf1', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
              {loading ? "..." : "Scrape"}
            </button>
            {!isSidePanel && (
              <button onClick={openSidePanel} title="Open in Side Panel" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '6px 12px', marginLeft: 4, color: '#4f8cff', fontWeight: 500, display: 'flex', alignItems: 'center' }}>
                {SidePanelSVG}
              </button>
            )}
          </div>
        </div>
        {/* Chat Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16, background: "#000000" }}>
          {messages.length === 0 && (
            <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div>Ask anything about this page!</div>
            </div>
          )}
          {messages.map((msg, i) => (
            msg.role === 'ai' ? (
              <AiMessage
                key={i}
                content={msg.content}
                onCopy={() => handleCopyResponse(msg.content, i)}
                copied={copiedIdx === i}
                idx={i}
              />
            ) : (
              <UserMessage key={i} content={msg.content} />
            )
          ))}
          <div ref={chatEndRef} />
        </div>
        {/* Input Area */}
        <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', padding: 12, background: '#222', borderTop: '1px solid #333' }}>
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
              background: '#18181a',
              color: '#fff',
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
      <style>
        {`
          .inline-code::-webkit-scrollbar {
            height: 4px;
            background: transparent;
          }
          .inline-code::-webkit-scrollbar-thumb {
            background: #bbb;
            border-radius: 2px;
          }
          .inline-code::-webkit-scrollbar-track {
            background: transparent;
          }
          .block-code pre::-webkit-scrollbar {
            height: 4px;
            background: transparent;
          }
          .block-code pre::-webkit-scrollbar-thumb {
            background: #bbb;
            border-radius: 2px;
          }
          .block-code pre::-webkit-scrollbar-track {
            background: transparent;
          }
          .code-block-container .copy-btn {
            opacity: 0.8;
            transition: opacity 0.2s;
          }
          .ai-bubble-container .ai-copy-btn {
            opacity: 1;
          }
        `}
      </style>
    </>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<Popup />);
