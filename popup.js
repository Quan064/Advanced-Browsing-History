const BATCH_SIZE = 20; // Số lượng mục tải mỗi lần
let lastKey = null; // Khóa của bản ghi cuối cùng trong batch trước
let isLoading = false; // Ngăn chặn tải trùng lặp

function checkMessageWithParams(message, query) {
  const termRegex = /([+-]?)\s*([^+-]+)/g;
  let termMatch;
  while ((termMatch = termRegex.exec(query)) !== null) {
    if ((termMatch[1] === '-' && message.includes(termMatch[2].trim())) ||
        (termMatch[1] !== '-' && !message.includes(termMatch[2].trim()))) {
      return false ;
    }
  }
  return true ;
}

function formatDate(date) {
  date = new Date(date);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).padStart(4, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `d${day}-m${month}-y${year} h${hours}:m${minutes}`;
}

function getHistoryBatchFromIndexedDB(query, web, time) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("BrowsingHistoryDB", 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("history")) {resolve([])};
      const transaction = db.transaction("history", "readonly");
      const store = transaction.objectStore("history");
      const history = [];
      const checkboxChecked = document.getElementById("checkbox").checked;
      const history_url = [];

      let cursorRequest;
      if (lastKey) {
        cursorRequest = store.openCursor(IDBKeyRange.upperBound(lastKey, true), "prev"); // Lấy tiếp từ vị trí cuối cùng
      } else {
        cursorRequest = store.openCursor(null, "prev"); // Bắt đầu từ mục mới nhất
      }

      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && history.length < BATCH_SIZE) {
          const message = `${cursor.value.title || ""} ${cursor.value.content || ""}`.trim().toLowerCase().normalize("NFC");

          let timeValid;
          if (time === "current hour") {
            timeValid = new Date(cursor.value.time).getHours() === new Date().getHours();
          } else if (time === "current day") {
            timeValid = new Date(cursor.value.time).getDate() === new Date().getDate();
          } else if (time === "current week") {
            function getWeekNumber(date) {
              const startOfYear = new Date(date.getFullYear(), 0, 1);
              const pastDays = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
              return Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
            }
            timeValid = getWeekNumber(new Date(cursor.value.time)) === getWeekNumber(new Date());
          } else if (time === "current month") {
            timeValid = new Date(cursor.value.time).getMonth() === new Date().getMonth();
          } else if (time === "current year") {
            timeValid = new Date(cursor.value.time).getFullYear() === new Date().getFullYear();
          } else {
            timeValid = checkMessageWithParams(formatDate(cursor.value.time), time);
          };

          if (checkMessageWithParams(message, query) && checkMessageWithParams(cursor.value.url, web) && timeValid) {
            if (checkboxChecked) {
              if (!history_url.includes(cursor.value.url)) {
                history.push(cursor.value);
                history_url.push(cursor.value.url);
              };
            } else {history.push(cursor.value);}
          };

          lastKey = cursor.key; // Cập nhật khóa cuối cùng
          cursor.continue();
        } else {
          resolve(history);
        }
      };

      cursorRequest.onerror = (event) => reject(event.target.error);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

// Hiển thị kết quả lên trang
async function loadMoreHistory(searchButton=false) {
  if (isLoading) return;
  isLoading = true;

  const query = document.getElementById("searchInput").value.toLowerCase().normalize("NFC");
  const web = document.getElementById("WebInput").value.toLowerCase().normalize("NFC");
  const time = document.getElementById("TimeInput").value.toLowerCase().normalize("NFC");
  const resultsDiv = document.getElementById("results");

  const groupedHistory = {};

  // Tạo và hiển thị biểu tượng loading
  let loadingDiv;
  if (searchButton) {
    document.getElementById("results").innerHTML = ""; // Xóa kết quả cũ
    loadingDiv = document.createElement("div");
    loadingDiv.id = "loading";
    loadingDiv.innerHTML = `<span class="loader"></span> Searching...`;
    resultsDiv.appendChild(loadingDiv);
  };

  try {
    const historyBatch = await getHistoryBatchFromIndexedDB(query, web, time);
    // console.log(historyBatch);

    // Ẩn loading
    if (searchButton) {
      loadingDiv.remove();
    };

    if (historyBatch.length === 0) {
      if (searchButton) {
        resultsDiv.innerHTML = "<div class='date-header' style='color:red;'>No results found."
      }
      window.removeEventListener("scroll", handleScroll); // Không còn dữ liệu nữa
      return;
    } else {
      historyBatch.forEach(item => {
        const date = new Date(item.time);
        const dateStr = date.toLocaleDateString("en-US", { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = date.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', hour12: false });
  
        if (!groupedHistory[dateStr]) {
          groupedHistory[dateStr] = [];
        }
        groupedHistory[dateStr].push({ ...item, time: timeStr });
      });

      Object.keys(groupedHistory).forEach(date => {
        const dateHeaders = resultsDiv.querySelectorAll(".date-header");
        if (dateHeaders.length === 0 || dateHeaders[dateHeaders.length - 1].textContent !== date) {
          const dateHeader = document.createElement("div");
          dateHeader.className = "date-header";
          dateHeader.textContent = date;
          resultsDiv.appendChild(dateHeader);
        }
  
        groupedHistory[date].forEach(item => {
          const resultItem = document.createElement("div");
          resultItem.className = "result-item";
          resultItem.innerHTML = `<img src="${item.favicon}" class="favicon">`;

          const div = document.createElement("div");
          div.className = "history-text";

          const link = document.createElement("a");
          link.href = item.url;
          link.target = "_blank";
          link.className = "title";
          link.textContent = item.title || "No Title";
          link.color = "#000";

          // Sự kiện hover
          div.addEventListener("mouseenter", () => {
            link.textContent = item.url; // Hiện URL khi hover
            link.color = "#4fb6cd";
          });

          div.addEventListener("mouseleave", () => {
            link.textContent = item.title || "No Title"; // Trả lại title khi rời chuột
            link.color = "#000";
          });

          const time = document.createElement("span");
          time.className = "time";
          time.textContent = item.time;

          div.appendChild(link);
          resultItem.appendChild(div);
          resultItem.appendChild(time);
          resultsDiv.appendChild(resultItem);
        });
      });
    }
  } catch (error) {
    console.error("Error loading history:", error);
  } finally {
    isLoading = false;
  }
}

// Sự kiện tìm kiếm
document.getElementById("searchButton").addEventListener("click", () => {
  lastKey = null; // Reset vị trí lấy dữ liệu

  // Xử lý cuộn để tải thêm dữ liệu
  window.addEventListener("scroll", handleScroll);
  loadMoreHistory(true);
});
function handleScroll() {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
    loadMoreHistory();
  }
}


// Lắng nghe sự kiện click vào link
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("history-link")) {
    e.preventDefault();

    const url = e.target.dataset.url;
    const searchText = e.target.dataset.searchText;

    // Mở tab mới và lưu text cần tìm
    chrome.runtime.sendMessage({ action: "openTab", url, searchText });
  }
});

// Xóa lịch sử
document.getElementById("clear-history").addEventListener("click", () => {
  if (confirm("Are you sure you want to clear the history?")) {
    const request = indexedDB.open("BrowsingHistoryDB");
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction("history", 'readwrite');
      const store = transaction.objectStore("history");
      
      const clearRequest = store.clear();  // Xóa tất cả mục trong objectStore
      chrome.storage.local.set({ "error": "" });
      clearRequest.onsuccess = () => {
        alert('All data cleared successfully.');
      };
      
      clearRequest.onerror = (error) => {
        alert('Error clearing data:', error);
      };
    };
  
    request.onerror = (error) => {
      console.error('Error opening database:', error);
    };
  }
});

// Key down
{
  document.querySelectorAll(".searchInput").forEach(i => {
    i.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        document.getElementById("searchButton").click();
      }
    });
  });
  document.getElementById("searchInput").addEventListener("keydown", function(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      document.getElementById("WebInput").focus();
    }
  });
  document.getElementById("WebInput").addEventListener("keydown", function(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      document.getElementById("TimeInput").focus();
    }
  });
  document.getElementById("TimeInput").addEventListener("keydown", function(event) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      document.getElementById("WebInput").focus();
    }
  });
  document.getElementById("WebInput").addEventListener("keydown", function(event) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      document.getElementById("searchInput").focus();
    }
  });
}

window.onload = function() {
  document.getElementById('searchInput').focus();
  document.getElementById('TimeInput').placeholder = `Time (Today: ${formatDate(new Date())})`;

  const checkbox = document.getElementById("checkbox");

  // Khi popup mở, lấy trạng thái checkbox từ chrome.storage.local
  chrome.storage.local.get(["CheckboxState"], function(result) {
    if (result.CheckboxState !== undefined) {
      checkbox.checked = result.CheckboxState;
    } else {
      checkbox.checked = true;  // Mặc định là false nếu chưa có dữ liệu
    }
  });

  // Khi trạng thái checkbox thay đổi, lưu lại trạng thái vào chrome.storage.local
  checkbox.addEventListener("change", function() {
    chrome.storage.local.set({ "CheckboxState": checkbox.checked });
  });

  chrome.storage.local.get(["error"], function(result) {
    if (result.error !== undefined) {
      if (result.error !== "") {
        const resultsDiv = document.getElementById("results");
        resultsDiv.innerHTML = `<div class='date-header' style='color:red;'>${result.error} (try clear history)`;
      }
    } else {
      chrome.storage.local.set({ "error": "" });
    }
  });
};