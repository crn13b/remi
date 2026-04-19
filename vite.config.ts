import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 3001
    },
    build: {
        rollupOptions: {
            input: {
                main: './dashboard.html',
                index: './index.html',
                pricing: './pricing.html',
                welcome: './welcome.html',
                resetPassword: './reset-password.html'
            }
        }
    }
})
