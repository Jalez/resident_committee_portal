import {
    createGenericDeleteAction,
    genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";

export const loader = genericDeleteLoader;
export const action = createGenericDeleteAction("inventory", {
    idParam: "itemId",
});
