"use strict";
(() => {
  // src/content.ts
  function scrapePage() {
    return document.body.innerText;
  }
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrape") {
      const data = scrapePage();
      sendResponse({ data });
    }
  });
})();
