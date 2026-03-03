import { getMasterTechnicalScore } from '../technicals';

export const analyzeXAUUSD = ({ history, price, eurusd }) => {
  const spreadAsPipsEquivalent = Number(price?.spread || 0) / 10;
  const technicals = getMasterTechnicalScore(history || [], Number(price?.bid || 0), spreadAsPipsEquivalent);
  const eurChange = Number(eurusd?.change24h || 0);
  const inferredDxyTrend = eurChange > 0 ? 'FALLING' : eurChange < 0 ? 'RISING' : 'FLAT';

  return {
    symbol: 'XAUUSD',
    assetClass: 'commodity',
    technicals,
    assetSpecific: {
      dxyTrend: inferredDxyTrend,
      dxyValue: null,
      realYields: null,
      realYieldsTrend: null,
      goldVsSMA50: null,
      goldVsSMA200: null,
      note: 'DXY trend inferred from EURUSD if direct DXY feed unavailable.',
    },
  };
};
