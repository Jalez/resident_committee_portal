import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useSearchParams } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button, buttonVariants } from "~/components/ui/button";
import { getDatabase, type SubmissionType } from "~/db";
import { getSession } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/contact";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Ota yhteyttä / Contact` },
		{
			name: "description",
			content: "Ota yhteyttä asukastoimikuntaan / Contact the Tenant Committee",
		},
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	const session = await getSession(request);
	let userDetails: {
		name?: string;
		email?: string;
		apartmentNumber?: string | null;
	} | null = null;

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
		titleFi: "Hae toimikuntaan",
		titleEn: "Apply for Committee",
		icon: "diversity_3",
		placeholderFi: "Kerro itsestäsi ja miksi haluaisit liittyä toimikuntaan...",
		placeholderEn:
			"Tell us about yourself and why you'd like to join the committee...",
	},
	{
		id: "events",
		titleFi: "Ehdota tapahtumaa",
		titleEn: "Suggest an Event",
		icon: "celebration",
		placeholderFi: "Kuvaile tapahtumaidea: mitä, milloin, missä...",
		placeholderEn: "Describe your event idea: what, when, where...",
	},
	{
		id: "purchases",
		titleFi: "Pyydä hankintaa",
		titleEn: "Request a Purchase",
		icon: "shopping_cart",
		placeholderFi: "Mitä haluaisit hankkia ja miksi se hyödyttäisi asukkaita?",
		placeholderEn:
			"What would you like to purchase and how would it benefit residents?",
	},
	{
		id: "questions",
		titleFi: "Esitä kysymys",
		titleEn: "Ask a Question",
		icon: "question_mark",
		placeholderFi: "Kirjoita kysymyksesi tähän...",
		placeholderEn: "Write your question here...",
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

	console.log("[Contact Form] Received submission:", {
		type,
		name,
		email,
		apartmentNumber,
		updateApartment,
	});

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
					console.log(
						`[Contact Form] Updated apartment number for ${session.email} to ${apartmentNumber}`,
					);
				}
			}
		} catch (error) {
			console.error("[Contact Form] Failed to update apartment number:", error);
		}
	}

	return { success: true };
}

export default function Contact({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const submitted = actionData?.success;
	const [searchParams] = useSearchParams();
	const preselectedType = searchParams.get("type");
	const { userDetails } = loaderData;
	const { t } = useTranslation();

	const [selectedType, setSelectedType] = useState<string | null>(
		preselectedType,
	);

	useEffect(() => {
		if (preselectedType) {
			setSelectedType(preselectedType);
		}
	}, [preselectedType]);

	// Derived form types with translations
	const formTypes = FORM_TYPES.map((ft) => ({
		...ft,
		title: t(`contact.types.${ft.id}.title`),
		placeholder: t(`contact.types.${ft.id}.placeholder`),
	}));

	const selectedFormType = formTypes.find((t) => t.id === selectedType);

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
							{t("contact.success.title")}
						</h2>
						<p className="text-gray-500 dark:text-gray-400 font-medium">
							{t("contact.success.message")}
						</p>
					</div>
					<Link
						to="/"
						className={cn(
							buttonVariants(),
							"w-full rounded-full font-bold h-12",
						)}
					>
						{t("contact.success.back_home")}
					</Link>
				</div>
			</div>
		);
	}

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto">
				{/* Header */}
				<div className="text-center mb-8">
					<h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight">
						{t("contact.header")}
					</h1>
				</div>

				{/* Type Selection */}
				<div className="mb-8">
					<span className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 ml-1">
						{t("contact.select_topic")}
					</span>
					<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
						{formTypes.map((type) => (
							<Button
								key={type.id}
								type="button"
								variant={selectedType === type.id ? "default" : "outline"}
								onClick={() => setSelectedType(type.id)}
								className={cn(
									"flex flex-col items-center justify-center p-4 h-auto rounded-2xl border-2 transition-all duration-200",
									selectedType === type.id
										? "bg-primary/10 text-primary border-primary hover:bg-primary/20 hover:text-primary"
										: "border-transparent bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-700",
								)}
							>
								<span className="material-symbols-outlined text-3xl mb-2">
									{type.icon}
								</span>
								<span className="text-sm font-bold text-center leading-tight">
									{type.title}
								</span>
							</Button>
						))}
					</div>
				</div>

				{/* Form - Only show when type is selected */}
				{selectedType && (
					<Form
						method="post"
						className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300"
					>
						<input type="hidden" name="type" value={selectedType} />

						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div className="space-y-1.5">
								<label
									htmlFor="name"
									className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1"
								>
									{t("contact.form.name")}
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
								<label
									htmlFor="email"
									className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1"
								>
									{t("contact.form.email")}
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
								<label
									htmlFor="apartmentNumber"
									className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1"
								>
									{t("contact.form.apartment")}
								</label>
								<input
									type="text"
									name="apartmentNumber"
									id="apartmentNumber"
									required
									placeholder={t("contact.form.apartment_placeholder")}
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
									{t("contact.form.update_apartment_profile")}
								</span>
							</label>
						)}

						<div className="space-y-1.5">
							<label
								htmlFor="message"
								className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1"
							>
								{t("contact.form.message")}
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
							{t("contact.form.send")}
						</Button>
					</Form>
				)}

				{/* Prompt to select type */}
				{!selectedType && (
					<div className="text-center py-12 text-gray-400">
						<span className="material-symbols-outlined text-5xl mb-4 block opacity-50">
							arrow_upward
						</span>
						<p className="font-medium">{t("contact.select_topic_prompt")}</p>
					</div>
				)}
			</div>
		</PageWrapper>
	);
}
