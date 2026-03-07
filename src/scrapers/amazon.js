'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

// Rotate through recent desktop User-Agents (2025-era) to reduce bot detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];

// Mobile User-Agents for fallback when desktop is blocked
const MOBILE_USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
];

// Referrers that mimic organic traffic from search engines
const REFERRERS = [
  'https://www.google.com/',
  'https://www.google.com/search?q=amazon',
  'https://www.bing.com/',
  'https://www.bing.com/search?q=amazon+product',
  '',  // sometimes no referrer is fine
];

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomMobileUA() {
  return MOBILE_USER_AGENTS[Math.floor(Math.random() * MOBILE_USER_AGENTS.length)];
}

function randomReferrer() {
  return REFERRERS[Math.floor(Math.random() * REFERRERS.length)];
}

// Generate a plausible session-id cookie to mimic a returning visitor.
// Do NOT include sp-cdn or other geo-specific cookies — they trigger region mismatch checks.
function fakeSessionCookies() {
  const sid = Array.from({ length: 17 }, () => Math.floor(Math.random() * 10)).join('');
  return `session-id=${sid}; i18n-prefs=USD; skin=noskin`;
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
 * Amazon has multiple page layouts; we try all known selectors.
 */
function extractDescription($, jsonLd) {
  // All known bullet-point containers across Amazon's page layouts
  const bulletSelectors = [
    '#feature-bullets ul li span.a-list-item',
    '#feature-bullets .a-list-item',
    '#featurebullets_feature_div .a-list-item',
    '[data-feature-name="featurebullets"] .a-list-item',
    '#productFactsDesktop_feature_div .a-list-item',
    '#productOverview_feature_div .a-list-item',
    '#detailBullets_feature_div .a-list-item',
  ];

  for (const sel of bulletSelectors) {
    const bullets = [];
    $(sel).each((_, el) => {
      const text = $(el).text().trim();
      if (text
        && !text.toLowerCase().includes('make sure this fits')
        && !text.toLowerCase().startsWith('›')
        && text.length > 10) {
        bullets.push(text);
      }
    });
    if (bullets.length) return bullets.slice(0, 6).join(' '); // cap at 6 bullets
  }

  // Product description paragraph
  const descSelectors = [
    '#productDescription p',
    '#productDescription_feature_div p',
    '#productDescription',
    '#aplus p',
  ];
  for (const sel of descSelectors) {
    const text = $(sel).first().text().trim();
    if (text && text.length > 20) return text;
  }

  // og:description is often pre-populated with bullet text — use it early
  const og = $('meta[property="og:description"]').attr('content');
  if (og && og.length > 20) return og;

  // JSON-LD description as last resort
  if (jsonLd?.description) return String(jsonLd.description).trim();

  return null;
}

/**
 * Main Amazon scraper with retry logic.
 * @param {string} url - Amazon product URL
 * @param {object} options
 * @param {string} [options.proxy] - Optional proxy URL
 * @param {number} [_attempt=1] - Internal retry counter
 * @returns {Promise<{asin, title, description, imageUrl, price, sourceUrl}>}
 */
function jitter(ms) {
  return ms + Math.floor(Math.random() * ms * 0.5);
}

/**
 * Build fetch URL: use ScraperAPI when key is configured, otherwise direct.
 * ScraperAPI routes through residential IPs and handles CAPTCHA automatically.
 */
function buildFetchUrl(targetUrl) {
  const key = process.env.SCRAPERAPI_KEY;
  if (!key) return targetUrl;
  return `http://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(targetUrl)}&country_code=us&device_type=desktop`;
}

async function scrapeAmazon(url, options = {}, _attempt = 1) {
  const useScraperApi = !!process.env.SCRAPERAPI_KEY;
  const MAX_ATTEMPTS = useScraperApi ? 3 : 6; // ScraperAPI rarely needs many retries
  const asin = extractAsin(url);

  // Only delay on retries. ScraperAPI handles rate limiting on their end.
  if (_attempt > 1) {
    await new Promise(r => setTimeout(r, jitter(useScraperApi ? 800 : 1500)));
  }

  let axiosConfig;

  if (useScraperApi) {
    // ScraperAPI manages headers and IPs — keep our request minimal
    axiosConfig = {
      headers: { 'User-Agent': randomUserAgent() },
      timeout: 30000, // ScraperAPI can take up to 25s on hard pages
      maxRedirects: 5,
    };
  } else {
    // Direct fetch — rotate UA, cookies, referrer to avoid detection
    const useMobile = _attempt >= 4;
    const ua  = useMobile ? randomMobileUA() : randomUserAgent();
    const ref = randomReferrer();
    const chromeVer = ua.includes('Chrome/131') ? '131' : ua.includes('Chrome/130') ? '130' : '131';

    const headers = {
      'User-Agent': ua,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'DNT': '1',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': ref ? 'cross-site' : 'none',
      'Sec-Fetch-User': '?1',
      'Cookie': fakeSessionCookies(),
    };
    if (ua.includes('Chrome/')) {
      headers['sec-ch-ua'] = `"Chromium";v="${chromeVer}", "Google Chrome";v="${chromeVer}", "Not?A_Brand";v="99"`;
      headers['sec-ch-ua-mobile'] = useMobile ? '?1' : '?0';
      headers['sec-ch-ua-platform'] = useMobile ? '"Android"' : '"Windows"';
    }
    if (ref) headers['Referer'] = ref;

    axiosConfig = { headers, timeout: 12000, maxRedirects: 8 };

    if (options.proxy) {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      axiosConfig.httpsAgent = new HttpsProxyAgent(options.proxy);
    }
  }

  const fetchUrl = buildFetchUrl(url);

  let response;
  try {
    response = await axios.get(fetchUrl, axiosConfig);
  } catch (err) {
    // Retry on network errors / 5xx
    const retryable = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT'
      || err.code === 'ECONNRESET'
      || (err.response && err.response.status >= 500)
      || (err.response && err.response.status === 503);
    if (retryable && _attempt < MAX_ATTEMPTS) {
      return scrapeAmazon(url, options, _attempt + 1);
    }
    throw new Error(`Failed to fetch Amazon page: ${err.message}`);
  }

  const $ = cheerio.load(response.data);
  const pageTitle = $('title').text().toLowerCase();
  const bodyText  = $('body').text().toLowerCase();

  // Detect bot-check / access-denied pages — retry with a different User-Agent
  const isBlocked = bodyText.includes('enter the characters you see below')
    || bodyText.includes('robot check')
    || bodyText.includes('type the characters')
    || bodyText.includes('captcha')
    || bodyText.includes('verify you are human')
    || bodyText.includes('automated access')
    || pageTitle.includes('robot')
    || pageTitle.includes('captcha')
    || pageTitle.includes('access denied')
    || pageTitle.includes('503')
    // Amazon "page not found" or sign-in redirect served instead of product
    || pageTitle === 'amazon.com'
    || bodyText.includes('sign in to continue');

  if (isBlocked) {
    if (_attempt < MAX_ATTEMPTS) {
      return scrapeAmazon(url, options, _attempt + 1);
    }
    throw new Error(
      useScraperApi
        ? 'ScraperAPI could not retrieve this Amazon page. The product may be region-locked or temporarily unavailable — try again in a moment.'
        : 'Amazon is blocking automated access. Try again in a few minutes, or add a ScraperAPI key in settings to bypass this permanently.'
    );
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

  // If title or image is missing, the page may have loaded an unexpected layout — retry
  if (!title || !imageUrl) {
    if (_attempt < MAX_ATTEMPTS) {
      return scrapeAmazon(url, options, _attempt + 1);
    }
    if (!title) throw new Error('Could not extract product title. Amazon may be rate-limiting requests — try increasing the delay between pins.');
    throw new Error('Could not extract product image. Try previewing the URL in a browser first to confirm it loads correctly.');
  }

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
