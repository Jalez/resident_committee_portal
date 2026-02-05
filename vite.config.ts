import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
	optimizeDeps: {
		include: ["@radix-ui/react-alert-dialog"],
	},
	ssr: {
		external: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
	},
	server: {
		allowedHosts: [".ngrok-free.dev", ".ngrok.io"],
	},
});
