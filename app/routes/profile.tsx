import type { Route } from "./+types/profile";
import { Form, redirect, useLoaderData } from "react-router";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { getDatabase } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import { PageWrapper } from "~/components/layout/page-layout";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Profiili / Profile` },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    const authUser = await getAuthenticatedUser(request, getDatabase);

    if (!authUser) {
        return redirect("/auth/login");
    }

    const db = getDatabase();
    const user = await db.findUserByEmail(authUser.email);

    if (!user) {
        return redirect("/auth/login");
    }

    // Get role name from the user's role
    const role = await db.getRoleById(user.roleId);

    return {
        siteConfig: SITE_CONFIG,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            apartmentNumber: user.apartmentNumber,
            roleName: role?.name || "Unknown",
            createdAt: user.createdAt,
        },
    };
}

export async function action({ request }: Route.ActionArgs) {
    const authUser = await getAuthenticatedUser(request, getDatabase);

    if (!authUser) {
        throw new Response("Unauthorized", { status: 401 });
    }

    const db = getDatabase();
    const user = await db.findUserByEmail(authUser.email);

    if (!user) {
        throw new Response("User not found", { status: 404 });
    }

    const formData = await request.formData();
    const name = formData.get("name") as string;
    const apartmentNumber = formData.get("apartmentNumber") as string;

    // Update user profile
    await db.updateUser(user.id, {
        name: name || user.name,
        apartmentNumber: apartmentNumber || null,
    });

    return { success: true };
}



export default function Profile({ loaderData, actionData }: Route.ComponentProps) {
    const { user } = loaderData;

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                        Profiili
                    </h1>
                    <p className="text-lg text-gray-500">
                        Profile
                    </p>
                </div>

                {/* Success Message */}
                {actionData?.success && (
                    <div className="mb-6 p-4 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl">
                        <p className="font-medium">Profiili päivitetty! / Profile updated!</p>
                    </div>
                )}

                {/* Profile Form */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <Form method="post" className="space-y-6">
                        {/* Email (read-only) */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                Sähköposti / Email
                            </label>
                            <input
                                type="email"
                                value={user.email}
                                disabled
                                className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Sähköpostia ei voi muuttaa / Email cannot be changed
                            </p>
                        </div>

                        {/* Name */}
                        <div>
                            <label htmlFor="name" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                Nimi / Name
                            </label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                defaultValue={user.name}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                            />
                        </div>

                        {/* Apartment Number */}
                        <div>
                            <label htmlFor="apartmentNumber" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                Asuntonumero / Apartment Number
                                <span className="ml-2 text-xs font-normal text-gray-500">(vapaaehtoinen / optional)</span>
                            </label>
                            <input
                                type="text"
                                id="apartmentNumber"
                                name="apartmentNumber"
                                defaultValue={user.apartmentNumber || ""}
                                placeholder="esim. A 101"
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Asuntonumeroa käytetään äänestysten validointiin / Used for validating votes
                            </p>
                        </div>

                        {/* Role (read-only) */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                Rooli / Role
                            </label>
                            <div className="px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700">
                                <span className="font-medium text-gray-700 dark:text-gray-300">
                                    {user.roleName}
                                </span>
                            </div>
                        </div>

                        {/* Member Since */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                Jäsen alkaen / Member since
                            </label>
                            <div className="px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700">
                                <span className="text-gray-700 dark:text-gray-300">
                                    {new Date(user.createdAt).toLocaleDateString("fi-FI", {
                                        day: "numeric",
                                        month: "long",
                                        year: "numeric",
                                    })}
                                </span>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-4">
                            <button
                                type="submit"
                                className="w-full px-6 py-4 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors"
                            >
                                Tallenna muutokset / Save Changes
                            </button>
                        </div>
                    </Form>
                </div>
            </div>
        </PageWrapper>
    );
}
