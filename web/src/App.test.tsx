import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { App } from './App';

// Node-environment smoke test: proves the test runner executes web code end
// to end without a DOM. Real component tests (jsdom + Testing Library) come
// when there is interactive UI worth testing.
describe('App', () => {
  it('renders the app title', () => {
    const html = renderToString(<App />);

    expect(html).toContain('OpenSetlist');
  });
});
