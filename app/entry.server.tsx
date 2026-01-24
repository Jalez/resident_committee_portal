import { resolve } from "node:path";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { createInstance } from "i18next";
import Backend from "i18next-fs-backend";
import { renderToPipeableStream } from "react-dom/server";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import i18n from "./i18n"; // your i18n configuration file
import i18next from "./i18next.server";

export const streamTimeout = 5000;

export default async function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
	_loadContext: AppLoadContext,
) {
	const instance = createInstance();
	const lng = await i18next.getLocale(request);
	const ns = i18next.getRouteNamespaces(routerContext);

	await instance
		.use(initReactI18next) // Tell our instance to use react-i18next
		.use(Backend) // Setup our backend
		.init({
			...i18n, // spread the configuration
			lng, // The detected language
			ns, // The namespaces the routes about to render wants to use
			backend: { loadPath: resolve("./public/locales/{{lng}}/{{ns}}.json") },
		});

	return new Promise((resolve, reject) => {
		let shellRendered = false;
		const _userAgent = request.headers.get("user-agent");

		const { pipe, abort } = renderToPipeableStream(
			<I18nextProvider i18n={instance}>
				<ServerRouter context={routerContext} url={request.url} />
			</I18nextProvider>,
			{
				onShellReady() {
					shellRendered = true;
					const body = new PassThrough();
					const stream = createReadableStreamFromReadable(body);

					responseHeaders.set("Content-Type", "text/html");

					resolve(
						new Response(stream, {
							headers: responseHeaders,
							status: responseStatusCode,
						}),
					);

					pipe(body);
				},
				onShellError(error: unknown) {
					reject(error);
				},
				onError(error: unknown) {
					responseStatusCode = 500;
					if (shellRendered) {
						console.error(error);
					}
				},
			},
		);

		setTimeout(abort, streamTimeout + 1000);
	});
}
