import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../css/app.css';

// PWA : Service Worker enregistré uniquement en production (jamais avec le serveur Vite de dev).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

ReactDOM.createRoot(document.getElementById('app')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
