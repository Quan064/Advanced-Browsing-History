chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getPageContent") {
    const content = document.body.innerText || ""; // Lấy toàn bộ nội dung trang
    const fullUrl = window.location.href; // Lấy URL đầy đủ từ trang hiện tại
    sendResponse({ content, fullUrl});
  }
  if (message.action === "searchText") {
    try {
      const searchText = message.text.toLowerCase();

      // Danh sách lưu các text nodes cần xử lý
      const textNodes = [];
      const highlightedSpans = [];

      // Sử dụng TreeWalker để duyệt qua text nodes
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const style = window.getComputedStyle(node.parentElement);
            // Loại bỏ text nodes trong phần tử ẩn
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              style.opacity === "0"
            ) {
              return NodeFilter.FILTER_REJECT;
            }

            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.toLowerCase().includes(searchText)) {
          textNodes.push(node); // Lưu node cần xử lý
        }
      }

      // Cuộn đến đoạn text đầu tiên tìm được (nếu có)
      if (textNodes.length > 0) {
        textNodes[0].parentElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      // Thay thế text trong từng text node đã tìm thấy
      for (const node of textNodes) {
        const parent = node.parentNode;

        // Tạo một span để đánh dấu text tìm được
        const index = node.nodeValue.toLowerCase().indexOf(searchText);
        const before = document.createTextNode(node.nodeValue.slice(0, index));
        const match = document.createTextNode(node.nodeValue.slice(index, index + searchText.length));
        const after = document.createTextNode(node.nodeValue.slice(index + searchText.length));

        const span = document.createElement("span");
        span.style.backgroundColor = "rgb(187, 187, 0)";
        span.appendChild(match);

        // Thay thế text node bằng các phần tử mới
        parent.replaceChild(after, node);
        parent.insertBefore(span, after);
        parent.insertBefore(before, span);

        // Lưu tham chiếu tới phần tử span đã được highlight
        highlightedSpans.push(span);
      }
    } catch (error) {
      console.error(error);
    }
  }
});

window.addEventListener("beforeunload", () => {
  chrome.runtime.sendMessage({ type: "pageUnload", url: window.location.href });
});

(function () {
  let lastContent = document.body.innerText.trim();
  let timeoutId = null;

  function sendUpdatedContent() {
    const currentContent = document.body.innerText.trim();
    
    if (currentContent !== lastContent && currentContent.length > 50) {
      lastContent = currentContent;
      chrome.runtime.sendMessage({ type: "pageContentUpdated", content: currentContent });
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(sendUpdatedContent, 3000); // Debounce 300ms
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Nếu trang có AJAX, kiểm tra lại nội dung mỗi 3 giây
  setInterval(sendUpdatedContent, 3000);
})();