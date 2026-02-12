import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";
import { getMinuteStorage } from "~/lib/minutes/storage.server";

export const loader = genericDeleteLoader;

export const action = createGenericDeleteAction("minute", {
	idParam: "minuteId",
	beforeDelete: async (db, item) => {
		// Delete from storage if we have a fileKey
		if (item.fileKey) {
			const storage = getMinuteStorage();
			await storage.deleteFile(item.fileKey);
		}
	},
});
