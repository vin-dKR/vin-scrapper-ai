declare const chrome: any;
// Scrape all visible text from the page
function scrapePage(): string {
  return document.body.innerText;
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: (response: any) => void) => {
  if (request.action === 'scrape') {
    const data = scrapePage();
    sendResponse({ data });
  }
});
