import { useEffect, useRef } from 'react';

interface TradingViewSymbolChartProps {
  symbol: string;
  /** TradingView interval code: e.g. '1','5','15','60','D','W','M'. Defaults to 'W' (weekly). */
  interval?: string;
  /** TradingView chart style: '1' candles, '2' line, '3' area, etc. Defaults to '2' (line). */
  style?: string;
  height?: number;
}

/**
 * Embeds TradingView's free public "Advanced Chart" widget for a given symbol. This is a
 * script-injected iframe widget (no API key, no backend involvement) - it does not support
 * programmatically overlaying custom data series (that requires TradingView's paid Charting
 * Library), so this only renders the real market price chart. Our own signal history is shown
 * separately alongside it (see SymbolPerformancePage).
 */
export function TradingViewSymbolChart({ symbol, interval = 'W', style = '2', height = 640 }: TradingViewSymbolChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear any previously injected widget before re-initializing for the new symbol.
    container.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    // The TradingView embed script sizes its `autosize` iframe to fill this div's own box - since
    // it's a bare block-level element with no content, it collapses to (near) zero height unless
    // explicitly stretched to fill the outer container (which does have the real pixel height).
    // Without this the chart renders vertically squeezed regardless of the `height` prop above.
    widgetDiv.style.height = '100%';
    widgetDiv.style.width = '100%';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Etc/UTC',
      theme: 'light',
      style,
      locale: 'en',
      allow_symbol_change: true,
      support_host: 'https://www.tradingview.com'
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [symbol, interval, style]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      data-testid="tradingview-symbol-chart"
      data-symbol={symbol}
      data-interval={interval}
      data-style={style}
      style={{ height, width: '100%' }}
    />
  );
}
