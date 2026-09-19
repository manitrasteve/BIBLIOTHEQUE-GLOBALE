import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../css/app.css';

// PWA : Service Worker (le navigateur ne l'expose qu'en HTTPS ou sur localhost).
// Enregistré aussi avec le serveur Vite de dev : il ne met en cache que /build/assets,
// /images et le manifest, donc il ne gêne pas le rechargement à chaud.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((error) => {
            console.warn('Service Worker non enregistré :', error);
        });
    });
}

ReactDOM.createRoot(document.getElementById('app')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
