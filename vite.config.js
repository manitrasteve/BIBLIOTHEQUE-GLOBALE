import { defineConfig } from "vite";
import laravel from "laravel-vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [
        laravel({
            input: ["resources/css/app.css", "resources/js/main.jsx"],
            refresh: true,
        }),
        react(),
        tailwindcss(),
    ],
    build: {
        rollupOptions: {
            output: {
                // React et le routeur changent rarement : un fichier à part reste en cache du navigateur
                // d'une mise à jour du site à l'autre (seul le code de l'application est retéléchargé).
                manualChunks(id) {
                    if (/node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
                        return "vendor-react";
                    }
                },
            },
        },
    },
    server: {
        host: "0.0.0.0",
        hmr: {
            host: "127.0.0.1",
        },
        watch: {
            ignored: ["**/storage/framework/views/**"],
        },
    },
});
