declare const chrome: any;
import { saveScrapedData } from './store';

chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: (response: any) => void) => {
  if (request.action === 'scrape') {
    if (sender.tab && sender.tab.id) {
      chrome.scripting.executeScript(
        {
          target: { tabId: sender.tab.id },
          func: () => {
            return document.body.innerText;
          },
        },
        (results: any) => {
          const data = results && results[0] && results[0].result;
          saveScrapedData(data);
          sendResponse({ data });
        }
      );
      return true; // Keep the message channel open for sendResponse
    }
  }
});
