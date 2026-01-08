import type { Route } from "./+types/contact";
import { Form, useActionData, useSearchParams } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { useState, useEffect } from "react";
import { saveFormSubmission } from "~/lib/google.server";

export function meta() {
    return [
        { title: "Toas Hippos - Ota yhteyttä / Contact" },
        { name: "description", content: "Ota yhteyttä Hippoksen asukastoimikuntaan / Contact Hippos Tenant Committee" },
    ];
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
    const type = formData.get("type") as string;
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const message = formData.get("message") as string;

    console.log("[Contact Form] Received submission:", { type, name, email });

    const saved = await saveFormSubmission({ type, name, email, message });

    if (!saved) {
        console.error("[Contact Form] Failed to save submission to Google Sheets");
        // Still return success to user (graceful degradation) but log the error
    }

    return { success: true };
}

export default function Contact({ actionData }: Route.ComponentProps) {
    const submitted = actionData?.success;
    const [searchParams] = useSearchParams();
    const preselectedType = searchParams.get("type");

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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">
                                    Nimi / Name
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    id="name"
                                    required
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
                                    className="w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary focus:bg-white dark:focus:bg-gray-900 outline-none transition-all font-medium"
                                />
                            </div>
                        </div>

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
