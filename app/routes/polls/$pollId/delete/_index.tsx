import { createGenericDeleteAction, genericDeleteLoader } from "~/lib/actions/generic-delete.server";
import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

export const loader = genericDeleteLoader;

export const action = createGenericDeleteAction("poll", {
    idParam: "pollId",
});
