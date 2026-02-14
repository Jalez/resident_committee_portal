import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	redirect,
	useActionData,
	useFetcher,
	useNavigation,
} from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { EditForm } from "~/components/ui/edit-form";
import { getDatabase, type Minute } from "~/db/server.server";
import { clearCache } from "~/lib/cache.server";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import { getReceiptsForPurchaseEdit } from "~/lib/receipts/server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const description = (data as any)?.reimbursement?.description;
	const title = description
		? `Muokkaa: ${description.substring(0, 30)} / Edit Reimbursement`
		: "Muokkaa kulukorvausta / Edit Reimbursement";
	return [
		{ title: `${(data as any)?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createEditLoader({
		entityType: "reimbursement",
		permission: "treasury:reimbursements:update",
		permissionSelf: "treasury:reimbursements:update-self",
		params,
		request,
		fetchEntity: (db, id) => db.getPurchaseById(id),
		extend: async ({ db, entity }: any) => {
			if (entity.emailSent) {
				throw redirect(`/treasury/reimbursements/${entity.id}`);
			}

			const [receiptsByYear, allMinutes] = await Promise.all([
				getReceiptsForPurchaseEdit(entity.id),
				db.getMinutes().then((minutes: Minute[]) =>
					minutes
						.filter((m: Minute) => m.status !== "draft")
						.map((m: Minute) => ({
							id: m.id,
							name: m.title || "Untitled",
							url: m.fileUrl,
							year: m.year?.toString() || new Date().getFullYear().toString(),
						})),
				),
			]);

			return {
				receiptsByYear,
				recentMinutes: allMinutes,
				currentYear: new Date().getFullYear(),
			};
		},
	});
}

const reimbursementSchema = z.object({
	description: z.string().min(1, "Description is required"),
	amount: z.string().regex(/^[\d.,]+$/, "Invalid amount format"),
	purchaserName: z.string().min(1, "Purchaser name is required"),
	bankAccount: z.string().min(1, "Bank account is required"),
	year: z.string().or(z.number()),
	notes: z.string().optional(),
	status: z.string().optional(),
	minutesId: z.string().optional(),
	minutesName: z.string().optional(),
	receiptLinks: z.string().optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
	const db = getDatabase();
	const clonedRequest = request.clone();
	const formData = await clonedRequest.formData();
	const actionType = formData.get("_action") as string;

	if (actionType === "refreshReceipts") {
		clearCache("RECEIPTS_BY_YEAR");
		return { success: true };
	}

	return createEditAction({
		entityType: "reimbursement",
		permission: "treasury:reimbursements:update",
		permissionSelf: "treasury:reimbursements:update-self",
		params,
		request,
		schema: reimbursementSchema,
		fetchEntity: (db, id) => db.getPurchaseById(id),
		onUpdate: ({ db, id, data, newStatus }: any) => {
			const { receiptLinks, minutesId, minutesName, ...rest } = data;
			return db.updatePurchase(id, {
				...rest,
				amount: Number.parseFloat(data.amount.replace(",", ".")).toFixed(2),
				year:
					typeof data.year === "string" ? parseInt(data.year, 10) : data.year,
				minutesId: minutesId || undefined,
				minutesName: minutesName || undefined,
				status: (newStatus as any) || (data.status as any),
			});
		},
		successRedirect: (entity: any) =>
			`/treasury/reimbursements/${entity.id}?success=updated`,
	});
}

export default function EditReimbursement({
	loaderData,
}: Route.ComponentProps) {
	const {
		reimbursement,
		relationships,
		recentMinutes,
		receiptsByYear,
		returnUrl,
		sourceContext,
		currentYear,
	} = loaderData as any;
	const { t } = useTranslation();
	const navigation = useNavigation();
	const fetcher = useFetcher();
	const actionData = useActionData<typeof action>();
	const actionDataProcessedRef = useRef(false);

	useEffect(() => {
		if (actionData && !actionDataProcessedRef.current) {
			actionDataProcessedRef.current = true;
			if ((actionData as any).error) {
				toast.error((actionData as any).error as string);
			} else if ((actionData as any).fieldErrors) {
				const errorMessages = Object.values((actionData as any).fieldErrors)
					.flat()
					.join(", ");
				toast.error(errorMessages || t("common.error.validation_failed"));
			}
		}
	}, [actionData, t]);

	const isSubmitting =
		navigation.state === "submitting" || fetcher.state === "submitting";

	const actualCurrentYear = new Date().getFullYear();

	const yearOptions = useMemo(() => {
		return [
			{
				label: String(actualCurrentYear - 1),
				value: String(actualCurrentYear - 1),
			},
			{ label: String(actualCurrentYear), value: String(actualCurrentYear) },
			{
				label: String(actualCurrentYear + 1),
				value: String(actualCurrentYear + 1),
			},
		];
	}, [actualCurrentYear]);

	const inputFields = useMemo(
		() => ({
			description: reimbursement.description ?? "",
			amount: reimbursement.amount ?? "",
			purchaserName: reimbursement.purchaserName ?? "",
			bankAccount: {
				value: reimbursement.bankAccount ?? "",
				placeholder: "FI12 3456 7890 1234 56",
			},
			year: {
				type: "select",
				value: String(reimbursement.year),
				options: yearOptions,
			},
			notes: reimbursement.notes ?? "",
			status: reimbursement.status ?? "",
		}),
		[reimbursement, yearOptions],
	);

	const readOnlyFields = {};

	const hiddenFields = {
		_sourceType: sourceContext?.type,
		_sourceId: sourceContext?.id,
		_returnUrl: returnUrl,
		minutesId: reimbursement.minutesId,
		minutesName: reimbursement.minutesName,
	};

	return (
		<PageWrapper>
			<EditForm
				title={t("treasury.reimbursements.edit.title")}
				action=""
				inputFields={inputFields as any}
				hiddenFields={hiddenFields as any}
				readOnlyFields={readOnlyFields}
				entityType="reimbursement"
				entityId={reimbursement.id}
				entityName={reimbursement.description || ""}
				returnUrl={returnUrl || `/treasury/reimbursements/${reimbursement.id}`}
				relationships={relationships}
				translationNamespace="treasury.reimbursements"
			/>
		</PageWrapper>
	);
}
