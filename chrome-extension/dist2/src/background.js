"use strict";
(() => {
  // src/store.ts
  async function saveScrapedData(data) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ scrapedData: data });
    }
  }

  // src/background.ts
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrape") {
      if (sender.tab && sender.tab.id) {
        chrome.scripting.executeScript(
          {
            target: { tabId: sender.tab.id },
            func: () => {
              return document.body.innerText;
            }
          },
          (results) => {
            const data = results && results[0] && results[0].result;
            saveScrapedData(data);
            sendResponse({ data });
          }
        );
        return true;
      }
    }
  });
})();
