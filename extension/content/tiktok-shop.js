// TikTok Shop product page scraper content script
// Runs on shop.tiktok.com product pages to extract product data

const API_BASE = "http://localhost:3000/api";

console.log("[TikTok Flow] TikTok Shop scraper content script loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SCRAPE_PRODUCT") {
    scrapeCurrentProduct()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "PING") {
    sendResponse({ status: "alive", url: window.location.href });
    return true;
  }
});

async function scrapeCurrentProduct() {
  const url = window.location.href;
  console.log("[TikTok Flow] Scraping product from:", url);

  // Wait a moment for dynamic content to load
  await new Promise((r) => setTimeout(r, 1500));

  // --- Title ---
  const title =
    getMetaContent("og:title") ||
    getText("h1") ||
    getText("[data-e2e='product-title']") ||
    getText("[class*='product-title']") ||
    getText("[class*='ProductTitle']") ||
    document.title.replace(/\s*[-|].*$/, "").trim() ||
    "Unknown Product";

  // --- Description ---
  const description =
    getMetaContent("og:description") ||
    getMetaContent("description") ||
    getText("[data-e2e='product-desc']") ||
    getText("[class*='product-desc']") ||
    getText("[class*='ProductDesc']") ||
    "";

  // --- Images ---
  const images = [];
  const ogImage = getMetaContent("og:image");
  if (ogImage) images.push(ogImage);

  // Product gallery images
  document
    .querySelectorAll(
      '[class*="product"] img, [class*="gallery"] img, [class*="slider"] img, [class*="carousel"] img, [data-e2e*="product"] img',
    )
    .forEach((img) => {
      const src =
        img.getAttribute("src") ||
        img.getAttribute("data-src") ||
        img.getAttribute("srcset")?.split(" ")[0];
      if (src && !images.includes(src) && images.length < 10) {
        // Filter out tiny icons/avatars
        if (
          !src.includes("avatar") &&
          !src.includes("icon") &&
          !src.includes("logo")
        ) {
          images.push(src);
        }
      }
    });

  // Fallback: all large images on the page
  if (images.length === 0) {
    document.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (
        src &&
        !images.includes(src) &&
        images.length < 10 &&
        img.naturalWidth > 100 &&
        img.naturalHeight > 100
      ) {
        images.push(src);
      }
    });
  }

  // --- Price ---
  let price = getMetaContent("product:price:amount") || "";
  const currency = getMetaContent("product:price:currency") || "";
  if (price && currency) price = `${currency} ${price}`;

  if (!price) {
    // Look for price in visible elements
    const priceEl =
      document.querySelector("[data-e2e='product-price']") ||
      document.querySelector("[class*='price' i][class*='current' i]") ||
      document.querySelector("[class*='ProductPrice']") ||
      document.querySelector("[class*='product-price']") ||
      document.querySelector("[class*='price']");
    if (priceEl) {
      price = priceEl.textContent.trim();
    }
  }

  // Try JSON-LD structured data
  if (!price || !title || title === "Unknown Product") {
    document
      .querySelectorAll('script[type="application/ld+json"]')
      .forEach((script) => {
        try {
          const json = JSON.parse(script.textContent);
          if (json.offers?.price && !price) {
            price =
              `${json.offers.priceCurrency || ""} ${json.offers.price}`.trim();
          }
          if (json.name && title === "Unknown Product") {
            // We'd need to reassign but title is const; this is a fallback
          }
        } catch {
          // ignore
        }
      });
  }

  // --- Shop Name ---
  const shopName =
    getMetaContent("og:site_name") ||
    getText("[data-e2e='shop-name']") ||
    getText("[class*='shop-name']") ||
    getText("[class*='ShopName']") ||
    getText("[class*='seller-name']") ||
    "TikTok Shop";

  const product = {
    url,
    title: title.replace(/\s*[-|].*TikTok.*$/i, "").trim(),
    description: description.substring(0, 2000),
    images,
    price,
    shopName: shopName.replace(/\s*[-|].*$/i, "").trim(),
  };

  console.log("[TikTok Flow] Scraped product:", product);
  return product;
}

// Helper: get meta tag content
function getMetaContent(name) {
  const el =
    document.querySelector(`meta[property="${name}"]`) ||
    document.querySelector(`meta[name="${name}"]`);
  return el ? el.getAttribute("content") || "" : "";
}

// Helper: get text content of first matching element
function getText(selector) {
  const el = document.querySelector(selector);
  return el ? el.textContent.trim() : "";
}

// ---- Auto-scrape on product page load ----
function isProductPage() {
  const url = window.location.href;
  return (
    /\/product\//.test(url) ||
    /\/shop\/.*\/product/.test(url) ||
    /shop\.tiktok\.com\/.*\/product/.test(url)
  );
}

async function autoScrape() {
  if (!isProductPage()) return;

  // Avoid duplicate scrapes on the same URL
  const scraped = sessionStorage.getItem("__tiktokflow_scraped");
  if (scraped === window.location.href) return;
  sessionStorage.setItem("__tiktokflow_scraped", window.location.href);

  console.log("[TikTok Flow] Auto-scraping product page...");
  try {
    const data = await scrapeCurrentProduct();
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "SAVE_SCRAPED_PRODUCT", payload: { scraped: data } },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.error) {
            reject(new Error(response.error));
          } else {
            console.log(
              "[TikTok Flow] Auto-scraped and saved:",
              response?.title || response?.id,
            );
            resolve(response);
          }
        },
      );
    });
  } catch (err) {
    console.error("[TikTok Flow] Auto-scrape failed:", err);
  }
}

// Run after page settles
setTimeout(autoScrape, 3000);
