import React from 'react';
import ReactDOM from 'react-dom/client';
import WebApp from './WebApp';
import '../../styles/theme.css';
import '../../styles/app.css';

export function mountWebApp(root, bootstrap) {
  ReactDOM.createRoot(root).render(<React.StrictMode><WebApp bootstrap={bootstrap} /></React.StrictMode>);
}
