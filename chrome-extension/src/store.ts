declare const chrome: any;

export async function saveScrapedData(data: string) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({ scrapedData: data });
  }
}

export async function getScrapedData(): Promise<string | undefined> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const result = await chrome.storage.local.get(["scrapedData"]);
    return result.scrapedData;
  }
  return undefined;
}
