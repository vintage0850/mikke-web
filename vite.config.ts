import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base must match the GitHub repo name for project pages (https://<user>.github.io/<repo>/)
export default defineConfig({
  base: '/mikke-web/',
  plugins: [react()],
})
