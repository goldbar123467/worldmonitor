import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { getCachedJson, setCachedJson, mget } from './_upstash-cache.js';

export const config = { runtime: 'edge' };

// Fetch with timeout
async function fetchWithTimeout(url, options, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// Same domain allowlist as rss-proxy.js — keep in sync
const ALLOWED_DOMAINS = [
  'feeds.bbci.co.uk',
  'www.theguardian.com',
  'feeds.npr.org',
  'news.google.com',
  'www.aljazeera.com',
  'rss.cnn.com',
  'hnrss.org',
  'feeds.arstechnica.com',
  'www.theverge.com',
  'www.cnbc.com',
  'feeds.marketwatch.com',
  'www.defenseone.com',
  'breakingdefense.com',
  'www.bellingcat.com',
  'techcrunch.com',
  'huggingface.co',
  'www.technologyreview.com',
  'rss.arxiv.org',
  'export.arxiv.org',
  'www.federalreserve.gov',
  'www.sec.gov',
  'www.whitehouse.gov',
  'www.state.gov',
  'www.defense.gov',
  'home.treasury.gov',
  'www.justice.gov',
  'tools.cdc.gov',
  'www.fema.gov',
  'www.dhs.gov',
  'www.thedrive.com',
  'krebsonsecurity.com',
  'finance.yahoo.com',
  'thediplomat.com',
  'venturebeat.com',
  'foreignpolicy.com',
  'www.ft.com',
  'openai.com',
  'www.reutersagency.com',
  'feeds.reuters.com',
  'rsshub.app',
  'asia.nikkei.com',
  'www.cfr.org',
  'www.csis.org',
  'www.politico.com',
  'www.brookings.edu',
  'layoffs.fyi',
  'www.defensenews.com',
  'www.foreignaffairs.com',
  'www.atlanticcouncil.org',
  'www.zdnet.com',
  'www.techmeme.com',
  'www.darkreading.com',
  'www.schneier.com',
  'rss.politico.com',
  'www.anandtech.com',
  'www.tomshardware.com',
  'www.semianalysis.com',
  'feed.infoq.com',
  'thenewstack.io',
  'devops.com',
  'dev.to',
  'lobste.rs',
  'changelog.com',
  'seekingalpha.com',
  'news.crunchbase.com',
  'www.saastr.com',
  'feeds.feedburner.com',
  'www.producthunt.com',
  'www.axios.com',
  'github.blog',
  'githubnext.com',
  'mshibanami.github.io',
  'www.engadget.com',
  'news.mit.edu',
  'dev.events',
  'www.ycombinator.com',
  'a16z.com',
  'review.firstround.com',
  'www.sequoiacap.com',
  'www.nfx.com',
  'www.aaronsw.com',
  'bothsidesofthetable.com',
  'www.lennysnewsletter.com',
  'stratechery.com',
  'www.eu-startups.com',
  'tech.eu',
  'sifted.eu',
  'www.techinasia.com',
  'kr-asia.com',
  'techcabal.com',
  'disrupt-africa.com',
  'lavca.org',
  'contxto.com',
  'inc42.com',
  'yourstory.com',
  'pitchbook.com',
  'www.cbinsights.com',
  'www.techstars.com',
  'english.alarabiya.net',
  'www.arabnews.com',
  'www.timesofisrael.com',
  'www.haaretz.com',
  'www.scmp.com',
  'kyivindependent.com',
  'www.themoscowtimes.com',
  'feeds.24.com',
  'feeds.capi24.com',
  'www.france24.com',
  'www.euronews.com',
  'www.lemonde.fr',
  'rss.dw.com',
  'www.africanews.com',
  'www.lasillavacia.com',
  'www.channelnewsasia.com',
  'www.thehindu.com',
  'news.un.org',
  'www.iaea.org',
  'www.who.int',
  'www.cisa.gov',
  'www.crisisgroup.org',
  'rusi.org',
  'warontherocks.com',
  'www.aei.org',
  'responsiblestatecraft.org',
  'www.fpri.org',
  'jamestown.org',
  'www.chathamhouse.org',
  'ecfr.eu',
  'www.gmfus.org',
  'www.wilsoncenter.org',
  'www.lowyinstitute.org',
  'www.mei.edu',
  'www.stimson.org',
  'www.cnas.org',
  'carnegieendowment.org',
  'www.rand.org',
  'fas.org',
  'www.armscontrol.org',
  'www.nti.org',
  'thebulletin.org',
  'www.iss.europa.eu',
  'www.fao.org',
  'worldbank.org',
  'www.imf.org',
  'news.ycombinator.com',
  'www.coindesk.com',
  'cointelegraph.com',
];

const MAX_URLS = 30;

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const urls = body.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing or empty urls array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  // Limit batch size
  const validUrls = [];
  const errors = {};
  for (const url of urls.slice(0, MAX_URLS)) {
    try {
      const parsed = new URL(url);
      if (!ALLOWED_DOMAINS.includes(parsed.hostname)) {
        errors[url] = 'Domain not allowed';
      } else {
        validUrls.push(url);
      }
    } catch {
      errors[url] = 'Invalid URL';
    }
  }

  if (validUrls.length === 0) {
    return new Response(JSON.stringify({ results: {}, errors }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  // Batch check cache via mget
  const cacheKeys = validUrls.map(u => `rss:${u}`);
  const cached = await mget(...cacheKeys);

  const results = {};
  const toFetch = [];

  for (let i = 0; i < validUrls.length; i++) {
    if (cached[i]) {
      results[validUrls[i]] = { data: cached[i], source: 'cache' };
    } else {
      toFetch.push(validUrls[i]);
    }
  }

  // Fetch cache misses in parallel
  if (toFetch.length > 0) {
    const fetchPromises = toFetch.map(async (url) => {
      try {
        const isGoogleNews = url.includes('news.google.com');
        const timeout = isGoogleNews ? 20000 : 12000;

        const response = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          redirect: 'follow',
        }, timeout);

        if (!response.ok) {
          return { url, error: `HTTP ${response.status}` };
        }

        const data = await response.text();
        // Cache for 5 minutes
        await setCachedJson(`rss:${url}`, data, 300).catch(() => {});
        return { url, data };
      } catch (err) {
        return { url, error: err.name === 'AbortError' ? 'timeout' : err.message };
      }
    });

    const fetchResults = await Promise.all(fetchPromises);
    for (const result of fetchResults) {
      if (result.data) {
        results[result.url] = { data: result.data, source: 'fetch' };
      } else {
        errors[result.url] = result.error;
      }
    }
  }

  return new Response(JSON.stringify({ results, errors }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
      ...cors,
    },
  });
}
