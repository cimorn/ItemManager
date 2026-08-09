import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import MobileScanPage from './features/scan/MobileScanPage';
import './styles/theme.css';
import './styles/app.css';

const scanMatch = window.location.pathname.match(/^\/scan\/([^/]+)/);
const root = scanMatch ? <MobileScanPage sessionId={decodeURIComponent(scanMatch[1])} /> : <App />;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {root}
  </React.StrictMode>
);
