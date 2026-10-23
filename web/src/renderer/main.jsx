import { startWebEntry } from './features/web/entry';

const root = document.getElementById('root');
const stop = startWebEntry({ root, loadApp: () => import('./features/web/mount-web') });
import.meta.hot?.dispose(stop);
