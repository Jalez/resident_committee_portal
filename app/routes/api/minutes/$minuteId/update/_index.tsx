import { createGenericUpdateAction } from "~/lib/actions/generic-update.server";
import {
	handleFileUpload,
	deleteOldFile,
	extractYearFromPath,
} from "~/lib/file-upload.server";

export const action = createGenericUpdateAction("minute", {
	idParam: "minuteId",
	beforeUpdate: async (db, item, fields, formData) => {
		const date = fields.date ? new Date(fields.date) : null;
		const year = date?.getFullYear() || extractYearFromPath(item.fileKey);

		const uploadResult = await handleFileUpload({
			formData,
			entityType: "minute",
			entity: {
				id: item.id,
				fileUrl: item.fileUrl,
				fileKey: item.fileKey,
			},
			name: fields.title,
			year: year?.toString(),
		});

		if ("error" in uploadResult) {
			throw new Response(JSON.stringify({ error: uploadResult.error }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		if (uploadResult.pathname && uploadResult.pathname !== item.fileKey) {
			await deleteOldFile("minute", item.fileKey);
		}

		fields.fileUrl = uploadResult.url || item.fileUrl;
		fields.fileKey = uploadResult.pathname || item.fileKey;
		fields.year = year;
	},
});
