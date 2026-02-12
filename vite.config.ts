import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
	optimizeDeps: {
		include: ["@radix-ui/react-alert-dialog"],
		exclude: ["postgres"],
	},
	resolve: {
		alias: {
			// Mock postgres for client build - it should never be used in client code
			postgres: new URL("./scripts/postgres-mock.js", import.meta.url).pathname,
		},
	},
	ssr: {
		external: [
			"@aws-sdk/client-s3",
			"@aws-sdk/s3-request-presigner",
			"postgres",
		],
	},
	server: {
		allowedHosts: [".ngrok-free.dev", ".ngrok.io"],
	},
});
