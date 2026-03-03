import { getMasterTechnicalScore } from '../technicals';

export const analyzeEURUSD = ({ history, price }) => {
  const technicals = getMasterTechnicalScore(history || [], Number(price?.bid || 0), Number(price?.spread || 0));
  return {
    symbol: 'EURUSD',
    assetClass: 'forex',
    technicals,
    assetSpecific: {
      spreadQuality: Number(price?.spread || 0) <= 3 ? 'good' : Number(price?.spread || 0) <= 7 ? 'ok' : 'bad',
      note: 'EUR/USD most stable pair for beginner flow.',
    },
  };
};
