import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin, ResolvedConfig } from "vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

function postgresMockPlugin(): Plugin {
	let config: ResolvedConfig;
	return {
		name: "postgres-mock",
		configResolved(resolvedConfig) {
			config = resolvedConfig;
		},
		resolveId(id) {
			if (id === "postgres") {
				if (config.ssr) {
					return null;
				}
				return new URL("./scripts/postgres-mock.js", import.meta.url).pathname;
			}
			return null;
		},
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		reactRouter(),
		tsconfigPaths(),
		postgresMockPlugin(),
	],
	optimizeDeps: {
		include: ["@radix-ui/react-alert-dialog"],
		exclude: ["postgres"],
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
