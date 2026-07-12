import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { TradingViewSymbolChart } from './TradingViewSymbolChart';

afterEach(() => {
  cleanup();
});

it('defaults to a weekly interval and a line chart style', () => {
  render(<TradingViewSymbolChart symbol="AAPL" />);

  const chart = screen.getByTestId('tradingview-symbol-chart');
  expect(chart).toHaveAttribute('data-symbol', 'AAPL');
  expect(chart).toHaveAttribute('data-interval', 'W');
  expect(chart).toHaveAttribute('data-style', '2');
});

it('supports overriding interval and style', () => {
  render(<TradingViewSymbolChart symbol="TSLA" interval="D" style="1" />);

  const chart = screen.getByTestId('tradingview-symbol-chart');
  expect(chart).toHaveAttribute('data-symbol', 'TSLA');
  expect(chart).toHaveAttribute('data-interval', 'D');
  expect(chart).toHaveAttribute('data-style', '1');
});
