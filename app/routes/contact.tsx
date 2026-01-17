import type { Route } from "./+types/contact";
import { Form, useActionData, useSearchParams, useRouteLoaderData } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { useState, useEffect } from "react";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSession } from "~/lib/auth.server";
import { getDatabase, type SubmissionType } from "~/db";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Ota yhteyttä / Contact` },
        { name: "description", content: "Ota yhteyttä asukastoimikuntaan / Contact the Tenant Committee" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    const session = await getSession(request);
    let userDetails: { name?: string; email?: string; apartmentNumber?: string | null } | null = null;

    if (session?.email) {
        try {
            const db = getDatabase();
            const dbUser = await db.findUserByEmail(session.email);
            if (dbUser) {
                userDetails = {
                    name: dbUser.name,
                    email: dbUser.email,
                    apartmentNumber: dbUser.apartmentNumber,
                };
            }
        } catch {
            // Database might not be available
        }
    }

    return { siteConfig: SITE_CONFIG, userDetails };
}

// Form types matching the home page options
const FORM_TYPES = [
    {
        id: "committee",
        title: "Hae toimikuntaan",
        subtitle: "Apply for Committee",
        icon: "diversity_3",
        placeholder: "Kerro itsestäsi ja miksi haluaisit liittyä toimikuntaan...\n\nTell us about yourself and why you'd like to join the committee...",
    },
    {
        id: "events",
        title: "Ehdota tapahtumaa",
        subtitle: "Suggest an Event",
        icon: "celebration",
        placeholder: "Kuvaile tapahtumaidea: mitä, milloin, missä...\n\nDescribe your event idea: what, when, where...",
    },
    {
        id: "purchases",
        title: "Pyydä hankintaa",
        subtitle: "Request a Purchase",
        icon: "shopping_cart",
        placeholder: "Mitä haluaisit hankkia ja miksi se hyödyttäisi asukkaita?\n\nWhat would you like to purchase and how would it benefit residents?",
    },
    {
        id: "questions",
        title: "Esitä kysymys",
        subtitle: "Ask a Question",
        icon: "question_mark",
        placeholder: "Kirjoita kysymyksesi tähän...\n\nWrite your question here...",
    },
];

export async function action({ request }: Route.ActionArgs) {
    const formData = await request.formData();
    const type = formData.get("type") as SubmissionType;
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const apartmentNumber = formData.get("apartmentNumber") as string;
    const message = formData.get("message") as string;
    const updateApartment = formData.get("updateApartment") === "on";

    console.log("[Contact Form] Received submission:", { type, name, email, apartmentNumber, updateApartment });

    const db = getDatabase();

    try {
        await db.createSubmission({
            type,
            name,
            email,
            apartmentNumber: apartmentNumber || null,
            message,
        });
        console.log("[Contact Form] Saved submission to database");
    } catch (error) {
        console.error("[Contact Form] Failed to save submission:", error);
    }

    // If user is logged in and wants to update their apartment number
    if (updateApartment && apartmentNumber) {
        try {
            const session = await getSession(request);
            if (session?.email) {
                const dbUser = await db.findUserByEmail(session.email);
                if (dbUser) {
                    await db.updateUser(dbUser.id, { apartmentNumber });
                    console.log(`[Contact Form] Updated apartment number for ${session.email} to ${apartmentNumber}`);
                }
            }
        } catch (error) {
            console.error("[Contact Form] Failed to update apartment number:", error);
        }
    }

    return { success: true };
}

export default function Contact({ loaderData, actionData }: Route.ComponentProps) {
    const submitted = actionData?.success;
    const [searchParams] = useSearchParams();
    const preselectedType = searchParams.get("type");
    const { userDetails } = loaderData;

    const [selectedType, setSelectedType] = useState<string | null>(preselectedType);

    useEffect(() => {
        if (preselectedType) {
            setSelectedType(preselectedType);
        }
    }, [preselectedType]);

    const selectedFormType = FORM_TYPES.find(t => t.id === selectedType);

    // Success state
    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 selection:bg-primary/20">
                <div className="w-full max-w-md p-8 text-center space-y-6">
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto text-green-600 dark:text-green-400">
                        <span className="material-symbols-outlined text-5xl">check</span>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
                            Viesti lähetetty! <br /> <span className="text-lg font-bold text-gray-500">Message Sent!</span>
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">
                            Kiitos yhteydenotostasi! Vastaamme sinulle mahdollisimman pian.
                            <br />
                            <span className="text-sm opacity-80">Thank you for contacting us! We will respond as soon as possible.</span>
                        </p>
                    </div>
                    <Button
                        className="w-full rounded-full font-bold h-12"
                        onClick={() => window.location.href = "/"}
                    >
                        Takaisin etusivulle / Back to Home
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight">
                        Ota yhteyttä
                    </h1>
                    <p className="text-xl md:text-2xl text-gray-400 font-bold mt-1">
                        Contact Us
                    </p>
                </div>

                {/* Type Selection */}
                <div className="mb-8">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 ml-1">
                        Valitse aihe / Select Topic
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {FORM_TYPES.map((type) => (
                            <button
                                key={type.id}
                                type="button"
                                onClick={() => setSelectedType(type.id)}
                                className={cn(
                                    "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-200",
                                    selectedType === type.id
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-transparent bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-700"
                                )}
                            >
                                <span className="material-symbols-outlined text-3xl mb-2">
                                    {type.icon}
                                </span>
                                <span className="text-sm font-bold text-center leading-tight">
                                    {type.title}
                                </span>
                                <span className="text-[10px] font-medium opacity-70 text-center">
                                    {type.subtitle}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Form - Only show when type is selected */}
                {selectedType && (
                    <Form method="post" className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <input type="hidden" name="type" value={selectedType} />

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">
                                    Nimi / Name
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    id="name"
                                    required
                                    defaultValue={userDetails?.name || ""}
                                    className="w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary focus:bg-white dark:focus:bg-gray-900 outline-none transition-all font-medium"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">
                                    Sähköposti / Email
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    id="email"
                                    required
                                    defaultValue={userDetails?.email || ""}
                                    className="w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary focus:bg-white dark:focus:bg-gray-900 outline-none transition-all font-medium"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="apartmentNumber" className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">
                                    Asunto / Apartment
                                </label>
                                <input
                                    type="text"
                                    name="apartmentNumber"
                                    id="apartmentNumber"
                                    required
                                    placeholder="esim. A 123"
                                    defaultValue={userDetails?.apartmentNumber || ""}
                                    className="w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary focus:bg-white dark:focus:bg-gray-900 outline-none transition-all font-medium placeholder:text-gray-400 placeholder:opacity-60"
                                />
                            </div>
                        </div>

                        {/* Checkbox to update apartment number in profile - only for logged-in users */}
                        {userDetails && (
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    name="updateApartment"
                                    defaultChecked={!userDetails.apartmentNumber}
                                    className="w-5 h-5 rounded border-2 border-gray-300 dark:border-gray-600 text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                                />
                                <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors">
                                    Päivitä asuntonumero profiiliini / Update apartment number in my profile
                                </span>
                            </label>
                        )}

                        <div className="space-y-1.5">
                            <label htmlFor="message" className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">
                                Viesti / Message
                            </label>
                            <textarea
                                name="message"
                                id="message"
                                rows={6}
                                required
                                placeholder={selectedFormType?.placeholder}
                                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary focus:bg-white dark:focus:bg-gray-900 outline-none transition-all font-medium resize-none placeholder:text-gray-400 placeholder:opacity-60"
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-14 rounded-xl text-lg font-black uppercase tracking-wide hover:scale-[1.02] transition-transform"
                        >
                            Lähetä / Send
                        </Button>
                    </Form>
                )}

                {/* Prompt to select type */}
                {!selectedType && (
                    <div className="text-center py-12 text-gray-400">
                        <span className="material-symbols-outlined text-5xl mb-4 block opacity-50">arrow_upward</span>
                        <p className="font-medium">Valitse aihe aloittaaksesi / Select a topic to begin</p>
                    </div>
                )}
            </div>
        </PageWrapper>
    );
}
