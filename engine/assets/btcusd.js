import { getMasterTechnicalScore } from '../technicals';

export const analyzeBTCUSD = ({ history, price }) => {
  const spreadAsPipsEquivalent = Number(price?.spread || 0) / 100;
  const technicals = getMasterTechnicalScore(history || [], Number(price?.bid || 0), spreadAsPipsEquivalent);

  const fearGreed = Number(price?.fearGreedIndex || 0);
  const fearGreedSignal = fearGreed >= 76 ? 'sell_zone' : fearGreed <= 25 ? 'buy_zone' : 'neutral';

  return {
    symbol: 'BTCUSD',
    assetClass: 'crypto',
    technicals,
    assetSpecific: {
      fearGreedIndex: fearGreed || null,
      fearGreedLabel: price?.fearGreedLabel || null,
      fearGreedSignal,
      btcDominance: null,
      volumeVsAvg: null,
      nasdaqCorrelation: null,
      cryptoSentiment: null,
      note: 'BTC is demo-mode by default unless account supports BTCUSD CFD.',
    },
  };
};
