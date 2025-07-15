import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { getScrapedData, saveScrapedData } from "./store";

declare const chrome: any;

const BACKEND_URL = "http://localhost:3000/ask"

const Popup = () => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [scraped, setScraped] = useState("");

  const handleScrape = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    console.log("[DEBUG] Scraping page...");
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (tabs[0].id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "scrape" },
            async (response: { data: string }) => {
              if (chrome.runtime.lastError) {
                console.error("[ERROR] Could not connect to content script:", chrome.runtime.lastError.message);
                alert("Could not connect to the page. Try refreshing the page or make sure you're on a supported site.");
                setLoading(false);
                return;
              }
              if (response && response.data) {
                await saveScrapedData(response.data);
                setScraped(response.data);
                console.log("[DEBUG] Scraped data:", response.data);
              } else {
                console.log("[DEBUG] No data received from content script.");
              }
              setLoading(false);
            }
          );
        } else {
          console.log("[DEBUG] No active tab found.");
          setLoading(false);
        }
      });
    } catch (err) {
      setLoading(false);
      console.error("[ERROR] Scrape failed:", err);
    }
  };

  const handleAsk = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    console.log("[DEBUG] Asking AI...", question);
    try {
      const data = scraped || (await getScrapedData()) || "";
      if (!data) {
        console.log("[DEBUG] No scraped data available to send to AI.");
        setLoading(false);
        return;
      }
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context: data }),
      });
      const json = await res.json();
      setAnswer(json.answer);
      setLoading(false);
      console.log("[DEBUG] AI answer:", json.answer);
    } catch (err) {
      setLoading(false);
      console.error("[ERROR] Ask AI failed:", err);
    }
  };

  return (
    <div style={{ width: 300, padding: 16, fontFamily: "sans-serif" }}>
      <button onClick={handleScrape} disabled={loading} style={{ width: "100%" }}>
        {loading ? "Scraping..." : "Scrape This Page"}
      </button>
      <textarea
        style={{ width: "100%", marginTop: 12 }}
        rows={3}
        placeholder="Ask about the page..."
        value={question}
        onChange={e => setQuestion(e.target.value)}
      />
      <button onClick={handleAsk} disabled={loading || !question} style={{ width: "100%", marginTop: 8 }}>
        {loading ? "Asking..." : "Ask AI"}
      </button>
      {answer && (
        <div style={{ marginTop: 12, background: "#f4f4f4", padding: 8, borderRadius: 4 }}>
          <b>Answer:</b>
          <div>{answer}</div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<Popup />);
