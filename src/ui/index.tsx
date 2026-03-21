// ============================================================
// TABLO - UI Entry Point
// Clean, fast, user-friendly interface
// ============================================================

import { render } from '@create-figma-plugin/ui';
import { h } from 'preact';
import { App } from './components/App';

function Plugin() {
  return <App />;
}

export default render(Plugin);
