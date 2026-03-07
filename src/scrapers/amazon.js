'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

// Rotate through common desktop User-Agents to reduce bot detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
];

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Extract ASIN from an Amazon URL.
 * Handles formats like /dp/ASIN, /gp/product/ASIN, /ASIN
 */
function extractAsin(url) {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/,
    /\/gp\/product\/([A-Z0-9]{10})/,
    /\/product\/([A-Z0-9]{10})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Parse JSON-LD structured data blocks — Amazon often includes Product schema.
 */
function extractJsonLd($) {
  const results = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      const items = Array.isArray(data) ? data : [data];
      items.forEach(item => {
        if (item['@type'] === 'Product' || item['@type'] === 'ItemPage') results.push(item);
      });
    } catch (_) { /* ignore */ }
  });
  return results[0] || null;
}

/**
 * Extract the highest-resolution image URL from Amazon's image data.
 */
function extractHighResImage($) {
  // 1. colorImages JSON blob (highest res)
  for (const script of $('script').toArray()) {
    const text = $(script).html() || '';
    const match = text.match(/'colorImages'\s*:\s*\{[^}]*'initial'\s*:\s*(\[[\s\S]*?\])\s*\}/);
    if (match) {
      try {
        const images = JSON.parse(match[1]);
        const first = images[0];
        if (first && (first.hiRes || first.large)) return first.hiRes || first.large;
      } catch (_) { /* ignore */ }
    }
  }

  // 2. #landingImage
  const landing = $('#landingImage');
  if (landing.length) {
    const src = landing.attr('data-old-hires') || landing.attr('data-a-dynamic-image');
    if (src && !src.startsWith('{')) return src;
    const plain = landing.attr('src');
    if (plain) return plain;
  }

  // 3. #imgTagWrapperId
  const wrapper = $('#imgTagWrapperId img');
  if (wrapper.length) {
    const src = wrapper.first().attr('src');
    if (src) return src;
  }

  // 4. .a-dynamic-image
  const dynamic = $('.a-dynamic-image').first();
  if (dynamic.length) {
    const src = dynamic.attr('src');
    if (src) return src;
  }

  // 5. og:image
  return $('meta[property="og:image"]').attr('content') || null;
}

/**
 * Extract product title.
 */
function extractTitle($, jsonLd) {
  // JSON-LD is most reliable
  if (jsonLd?.name) return String(jsonLd.name).trim();

  const selectors = [
    '#productTitle',
    '#title span',
    'h1.a-size-large',
    'h1#title',
    'h1',
  ];
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    if (text) return text;
  }
  return $('meta[property="og:title"]').attr('content') || null;
}

/**
 * Extract bullet-point description, falling back to product description paragraph.
 */
function extractDescription($, jsonLd) {
  // Bullet points
  const bullets = [];
  $('#feature-bullets ul li span.a-list-item').each((_, el) => {
    const text = $(el).text().trim();
    if (text && !text.toLowerCase().includes('make sure this fits')) {
      bullets.push(text);
    }
  });
  if (bullets.length) return bullets.join(' ');

  // Product description paragraph
  const desc = $('#productDescription p').first().text().trim()
    || $('#productDescription').first().text().trim();
  if (desc) return desc;

  // JSON-LD description
  if (jsonLd?.description) return String(jsonLd.description).trim();

  // og:description fallback
  return $('meta[property="og:description"]').attr('content') || null;
}

/**
 * Main Amazon scraper with retry logic.
 * @param {string} url - Amazon product URL
 * @param {object} options
 * @param {string} [options.proxy] - Optional proxy URL
 * @param {number} [_attempt=1] - Internal retry counter
 * @returns {Promise<{asin, title, description, imageUrl, price, sourceUrl}>}
 */
async function scrapeAmazon(url, options = {}, _attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const asin = extractAsin(url);

  const axiosConfig = {
    headers: {
      'User-Agent': randomUserAgent(),
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    },
    timeout: 20000,
    maxRedirects: 10,
  };

  if (options.proxy) {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    axiosConfig.httpsAgent = new HttpsProxyAgent(options.proxy);
  }

  let response;
  try {
    response = await axios.get(url, axiosConfig);
  } catch (err) {
    // Retry on network errors / 5xx
    const retryable = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT'
      || (err.response && err.response.status >= 500);
    if (retryable && _attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 1200 * _attempt));
      return scrapeAmazon(url, options, _attempt + 1);
    }
    throw new Error(`Failed to fetch Amazon page: ${err.message}`);
  }

  const $ = cheerio.load(response.data);

  // Detect CAPTCHA / robot check — retry with a different User-Agent
  const bodyText = $('body').text().toLowerCase();
  const isCaptcha = bodyText.includes('enter the characters you see below')
    || bodyText.includes('robot check')
    || bodyText.includes('type the characters')
    || ($('title').text().toLowerCase().includes('robot'));

  if (isCaptcha) {
    if (_attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 1500 * _attempt));
      return scrapeAmazon(url, options, _attempt + 1);
    }
    throw new Error('Amazon is showing a CAPTCHA. Please try again in a moment or use a different URL format.');
  }

  const jsonLd = extractJsonLd($);
  const title = extractTitle($, jsonLd);
  const description = extractDescription($, jsonLd);
  const imageUrl = extractHighResImage($);

  // Price (informational only — not used in pin)
  const price =
    $('.a-price .a-offscreen').first().text().trim() ||
    $('#priceblock_ourprice').text().trim() ||
    (jsonLd?.offers?.price ? `${jsonLd.offers.priceCurrency || ''}${jsonLd.offers.price}` : null) ||
    null;

  if (!title) throw new Error('Could not extract product title. The page may be region-restricted or temporarily unavailable.');
  if (!imageUrl) throw new Error('Could not extract product image. Try previewing the URL in a browser first to confirm it loads correctly.');

  return {
    asin,
    title,
    description: description || '',
    imageUrl,
    price,
    sourceUrl: url,
  };
}

module.exports = { scrapeAmazon, extractAsin };
