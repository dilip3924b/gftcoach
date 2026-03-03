import { getAllAssetsNews, getAssetNews } from '../lib/newsFeeds';

export const analyzeNewsForAsset = async (symbol) => {
  const news = await getAssetNews(symbol);
  const bullish = news.headlines.filter((h) => h.sentiment === 'bullish').length;
  const bearish = news.headlines.filter((h) => h.sentiment === 'bearish').length;

  return {
    ...news,
    summary: {
      headlineCount: news.headlines.length,
      bullishCount: bullish,
      bearishCount: bearish,
      neutralCount: Math.max(0, news.headlines.length - bullish - bearish),
      score: news.sentimentScore,
      signal: news.newsSignal,
    },
  };
};

export const analyzeAllNews = async () => {
  const all = await getAllAssetsNews();
  return {
    EURUSD: {
      ...all.EURUSD,
      summary: {
        headlineCount: all.EURUSD.headlines.length,
        score: all.EURUSD.sentimentScore,
        signal: all.EURUSD.newsSignal,
      },
    },
    XAUUSD: {
      ...all.XAUUSD,
      summary: {
        headlineCount: all.XAUUSD.headlines.length,
        score: all.XAUUSD.sentimentScore,
        signal: all.XAUUSD.newsSignal,
      },
    },
    BTCUSD: {
      ...all.BTCUSD,
      summary: {
        headlineCount: all.BTCUSD.headlines.length,
        score: all.BTCUSD.sentimentScore,
        signal: all.BTCUSD.newsSignal,
      },
    },
  };
};
