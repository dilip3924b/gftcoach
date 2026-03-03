import { XMLParser } from 'fast-xml-parser';
import { getEconomicCalendar } from './api';

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

const RSS_FEEDS = {
  EURUSD: [
    'https://www.fxstreet.com/rss/news',
    'https://tradingeconomics.com/rss/news.aspx',
    'https://www.forexfactory.com/rss/news',
  ],
  XAUUSD: [
    'https://www.kitco.com/rss/goldnews.xml',
    'https://goldprice.org/feeds/gold-price-news.xml',
    'https://tradingeconomics.com/rss/news.aspx',
  ],
  BTCUSD: [
    'https://cryptocurrency.cv/api/rss?feed=bitcoin',
    'https://www.coindesk.com/arc/outboundfeeds/rss/',
    'https://cointelegraph.com/rss',
  ],
};

const SENTIMENT_KEYWORDS = {
  EURUSD: {
    bullish: ['rate cut', 'weak dollar', 'strong euro', 'ecb hike', 'usd falls', 'dollar drops', 'euro rises', 'dovish fed'],
    bearish: ['rate hike', 'strong dollar', 'weak euro', 'dollar surges', 'euro falls', 'hawkish fed', 'usd rallies'],
  },
  XAUUSD: {
    bullish: ['safe haven', 'rate cut', 'inflation rises', 'uncertainty', 'war', 'crisis', 'weak dollar', 'gold rises', 'geopolitical', 'tension', 'fear'],
    bearish: ['rate hike', 'strong dollar', 'risk on', 'stocks rally', 'yields rise', 'gold falls', 'sell off'],
  },
  BTCUSD: {
    bullish: ['etf approved', 'institutional', 'adoption', 'halving', 'bullish', 'rally', 'all-time high', 'buying'],
    bearish: ['ban', 'regulation', 'hack', 'crash', 'sec rejects', 'sell off', 'bear', 'crackdown', 'fraud'],
  },
};

const normalize = (v) => String(v || '').toLowerCase();

const impactFromScore = (s) => {
  const abs = Math.abs(s);
  if (abs >= 0.67) return 'HIGH';
  if (abs >= 0.34) return 'MEDIUM';
  return 'LOW';
};

const parseRssItems = (xmlText) => {
  const parsed = parser.parse(xmlText);
  const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
  if (Array.isArray(items)) return items;
  return items ? [items] : [];
};

const mapRssItem = (item, source = 'RSS') => ({
  title: item?.title?.['#text'] || item?.title || 'Untitled',
  source,
  publishedAt: item?.pubDate || item?.published || item?.updated || new Date().toISOString(),
  url: item?.link?.href || item?.link || item?.guid || null,
});

const fetchRSS = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];

    const contentType = String(res.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('application/json') || contentType.includes('text/json')) {
      const json = await res.json();
      const rows = Array.isArray(json) ? json : json?.items || json?.articles || json?.results || [];
      return rows.map((row) => ({
        title: row?.title || row?.headline || 'Untitled',
        source: row?.source || row?.site || 'JSON Feed',
        publishedAt: row?.publishedAt || row?.pubDate || row?.created_at || new Date().toISOString(),
        url: row?.url || row?.link || null,
        sentiment: row?.sentiment || null,
      }));
    }

    const xml = await res.text();
    const items = parseRssItems(xml);
    return items.map((item) => mapRssItem(item, new URL(url).hostname));
  } catch {
    return [];
  }
};

const fetchCryptoNewsWithSentiment = async () => {
  try {
    const res = await fetch('https://cryptocurrency.cv/api/analyze?topic=Bitcoin');
    if (!res.ok) throw new Error('cryptocurrency.cv analyze failed');
    const json = await res.json();
    const rows = json?.articles || json?.results || json?.items || [];
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('empty analyze rows');

    return rows.map((row) => ({
      title: row?.title || row?.headline || 'Untitled',
      source: row?.source || 'cryptocurrency.cv',
      publishedAt: row?.publishedAt || row?.pubDate || row?.created_at || new Date().toISOString(),
      url: row?.url || row?.link || null,
      sentiment: normalize(row?.sentiment),
      sentimentScore: typeof row?.sentimentScore === 'number'
        ? row.sentimentScore
        : normalize(row?.sentiment) === 'bullish'
          ? 0.35
          : normalize(row?.sentiment) === 'bearish'
            ? -0.35
            : 0,
    }));
  } catch {
    const fallback = await fetchRSS('https://cryptocurrency.cv/api/rss?feed=bitcoin');
    return fallback.slice(0, 10);
  }
};

export const analyzeSentiment = (headline, symbol) => {
  const txt = normalize(headline);
  const kw = SENTIMENT_KEYWORDS[symbol] || { bullish: [], bearish: [] };

  const bullishMatches = kw.bullish.filter((k) => txt.includes(k));
  const bearishMatches = kw.bearish.filter((k) => txt.includes(k));

  if (bullishMatches.length > bearishMatches.length) {
    return {
      sentiment: 'bullish',
      score: Math.min(1, bullishMatches.length * 0.3),
      keywords: bullishMatches,
    };
  }

  if (bearishMatches.length > bullishMatches.length) {
    return {
      sentiment: 'bearish',
      score: -Math.min(1, bearishMatches.length * 0.3),
      keywords: bearishMatches,
    };
  }

  return { sentiment: 'neutral', score: 0, keywords: [] };
};

export const getAssetNews = async (symbol) => {
  let articles = [];

  if (symbol === 'BTCUSD') {
    articles = await fetchCryptoNewsWithSentiment();
  } else {
    const feeds = RSS_FEEDS[symbol] || [];
    const results = await Promise.allSettled(feeds.map(fetchRSS));

    articles = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .slice(0, 12);
  }

  const headlines = articles.slice(0, 8).map((article) => {
    const existingSentiment = normalize(article?.sentiment);
    const sentimentObj = ['bullish', 'bearish', 'neutral'].includes(existingSentiment)
      ? {
          sentiment: existingSentiment,
          score: existingSentiment === 'bullish' ? 0.35 : existingSentiment === 'bearish' ? -0.35 : 0,
          keywords: [],
        }
      : analyzeSentiment(article.title, symbol);

    const score = Number((article?.sentimentScore ?? sentimentObj.score ?? 0).toFixed(2));

    return {
      title: article.title,
      source: article.source || 'RSS',
      publishedAt: article.publishedAt,
      url: article.url,
      sentiment: sentimentObj.sentiment,
      sentimentScore: score,
      impactLevel: impactFromScore(score),
      relevantKeywords: sentimentObj.keywords,
      priceImpact: sentimentObj.sentiment === 'bullish'
        ? 'positive'
        : sentimentObj.sentiment === 'bearish'
          ? 'negative'
          : 'mixed',
      simpleExplanation: sentimentObj.sentiment === 'bullish'
        ? 'News flow favors an upward move.'
        : sentimentObj.sentiment === 'bearish'
          ? 'News flow favors a downward move.'
          : 'News flow is mixed right now.',
    };
  });

  const avgScore = headlines.length
    ? headlines.reduce((sum, h) => sum + Number(h.sentimentScore || 0), 0) / headlines.length
    : 0;

  const overallSentiment = avgScore > 0.1 ? 'bullish' : avgScore < -0.1 ? 'bearish' : 'neutral';

  const bullishHeadlines = headlines.filter((h) => h.sentiment === 'bullish');
  const bearishHeadlines = headlines.filter((h) => h.sentiment === 'bearish');

  const calendarEvents = ['EURUSD', 'XAUUSD'].includes(symbol)
    ? await getEconomicCalendar().catch(() => [])
    : [];
  const dangerEvents = calendarEvents.filter((e) => e.impact === 'HIGH');

  return {
    symbol,
    headlines: headlines.slice(0, 5),
    overallSentiment,
    sentimentScore: Number(avgScore.toFixed(2)),
    topBullishFactor: bullishHeadlines[0]?.title || null,
    topBearishFactor: bearishHeadlines[0]?.title || null,
    newsSignal: avgScore > 0.2 ? 'BUY' : avgScore < -0.2 ? 'SELL' : 'NEUTRAL',
    calendarEvents,
    dangerEvents,
    fetchedAt: new Date().toISOString(),
  };
};

export const getAllAssetsNews = async () => {
  const [EURUSD, XAUUSD, BTCUSD] = await Promise.all([
    getAssetNews('EURUSD'),
    getAssetNews('XAUUSD'),
    getAssetNews('BTCUSD'),
  ]);

  return { EURUSD, XAUUSD, BTCUSD };
};
