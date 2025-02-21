// Khởi tạo IndexedDB
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("BrowsingHistoryDB", 1);

    request.onsuccess = (event) => {
      const db = event.target.result;

      // Kiểm tra nếu object store 'history' không tồn tại
      if (!db.objectStoreNames.contains("history")) {
        db.close();
        indexedDB.deleteDatabase("BrowsingHistoryDB");

        // Mở lại database sau khi xóa
        const newRequest = indexedDB.open("BrowsingHistoryDB", 1);
        newRequest.onupgradeneeded = (event) => {
          const newDb = event.target.result;
          newDb.createObjectStore("history", { keyPath: "id", autoIncrement: true });
        };
        newRequest.onsuccess = (event) => resolve(event.target.result);
        newRequest.onerror = (event) => reject(event.target.error);
      } else {
        resolve(db);
      }
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("history")) {
        db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
      }
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

// Lưu nội dung trang vào IndexedDB
function savePageContent(tabId, url, content) {
  chrome.tabs.get(tabId, async (tab) => {
    if (chrome.runtime.lastError || !tab) return;

    const favicon = tab.favIconUrl || `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}`;
    const timestamp = new Date().toISOString(); // Lưu thời gian lưu

    const data = { url, title: tab.title, content, favicon, time: timestamp };

    try {
      const db = await openDatabase();
      const transaction = db.transaction("history", "readwrite");
      const store = transaction.objectStore("history");
      store.add(data);
      console.log("Saved history item:", data);
    } catch (error) {
      console.error("IndexedDB error:", error);
      chrome.storage.local.set({ "error": String(error) });
    }
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"],
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Lắng nghe sự kiện từ content script
  if (message.type === "pageContentUpdated" && sender.tab) {
    savePageContent(sender.tab.id, sender.tab.url, message.content);
  };

  if (message.action === "openTab") {
    const { url, searchText } = message;

    chrome.tabs.create({ url }, (tab) => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === "complete") {
          // Gửi thông điệp đến content script
          chrome.tabs.sendMessage(tabId, { action: "searchText", text: searchText });
          chrome.tabs.onUpdated.removeListener(listener); // Ngừng lắng nghe
        }
      });
    });
  }
});
