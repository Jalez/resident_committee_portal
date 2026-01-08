import { redirect } from "react-router";
import { destroySession } from "~/lib/auth.server";

export async function loader() {
    const sessionCookie = await destroySession();

    return redirect("/", {
        headers: {
            "Set-Cookie": sessionCookie,
        },
    });
}
