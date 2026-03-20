import * as cheerio from "cheerio";

export interface ScrapedProduct {
  url: string;
  title: string;
  description: string;
  images: string[];
  price: string;
  shopName: string;
}

export async function scrapeTikTokProduct(
  productUrl: string,
): Promise<ScrapedProduct> {
  const url = new URL(productUrl);
  if (
    !url.hostname.includes("tiktok.com") &&
    !url.hostname.includes("shop.tiktok")
  ) {
    throw new Error("URL must be a TikTok Shop product link");
  }

  const res = await fetch(productUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch product page: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Try multiple selector strategies for TikTok Shop pages
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "Unknown Product";

  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    "";

  const images: string[] = [];
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) images.push(ogImage);

  // Collect product gallery images
  $('img[src*="tiktokcdn"], img[src*="alicdn"], img[data-src]').each(
    (_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (src && !images.includes(src) && images.length < 10) {
        images.push(src);
      }
    },
  );

  // Try to extract price from JSON-LD or meta tags
  let price = "";
  try {
    $('script[type="application/ld+json"]').each((_, el) => {
      const json = JSON.parse($(el).html() || "{}");
      if (json.offers?.price) {
        price =
          `${json.offers.priceCurrency || ""} ${json.offers.price}`.trim();
      }
      if (json["@graph"]) {
        for (const item of json["@graph"]) {
          if (item.offers?.price) {
            price =
              `${item.offers.priceCurrency || ""} ${item.offers.price}`.trim();
          }
        }
      }
    });
  } catch {
    // ignore JSON parse errors
  }

  if (!price) {
    price = $('meta[property="product:price:amount"]').attr("content") || "";
    const currency =
      $('meta[property="product:price:currency"]').attr("content") || "";
    if (price && currency) price = `${currency} ${price}`;
  }

  const shopName =
    $('meta[property="og:site_name"]').attr("content") || "TikTok Shop";

  return {
    url: productUrl,
    title: title.replace(/\s*[-|].*TikTok.*$/i, "").trim() || title,
    description,
    images,
    price,
    shopName,
  };
}
