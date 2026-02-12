import { createGenericUpdateAction } from "~/lib/actions/generic-update.server";

export const action = createGenericUpdateAction("minute", {
	idParam: "minuteId",
});
