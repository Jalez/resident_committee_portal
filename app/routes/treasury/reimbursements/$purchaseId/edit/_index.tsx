import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
	redirect,
	useActionData,
	useFetcher,
	useNavigate,
	useNavigation,
} from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { EditForm } from "~/components/ui/edit-form";
import { getDatabase } from "~/db/server";
import { clearCache } from "~/lib/cache.server";
import {
	createEditAction,
	createEditLoader,
	createEmailAction,
} from "~/lib/edit-handlers.server";
import {
	buildMinutesAttachment,
	buildReceiptAttachments,
	isEmailConfigured,
	sendReimbursementEmail,
} from "~/lib/email.server";
import type { AnyEntity } from "~/lib/entity-converters";
import { getReceiptsForPurchaseEdit } from "~/lib/receipts/server";
import {
	getMissingReceiptsError,
	parseReceiptLinks,
} from "~/lib/treasury/receipt-validation";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const description = (data as any)?.purchase?.description;
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
		entityType: "purchase",
		permission: "treasury:reimbursements:update",
		permissionSelf: "treasury:reimbursements:update-self",
		params,
		request,
		fetchEntity: (db, id) => db.getPurchaseById(id),
		extend: async ({ db, entity }: any) => {
			if (entity.emailSent) {
				throw redirect(`/treasury/reimbursements/${entity.id}`);
			}

			const [receiptsByYear, pickerItems, allMinutes, emailConfigured] =
				await Promise.all([
					getReceiptsForPurchaseEdit(entity.id),
					db.getActiveInventoryItems(),
					db.getMinutes().then((minutes) =>
						minutes
							.filter((m) => m.status !== "draft")
							.map((m) => ({
								id: m.id,
								name: m.title || "Untitled",
								url: m.fileUrl,
								year: m.year?.toString() || new Date().getFullYear().toString(),
							}))
							.slice(0, 50),
					),
					isEmailConfigured(),
				]);

			return {
				receiptsByYear,
				pickerItems,
				recentMinutes: allMinutes,
				emailConfigured,
				currentYear: new Date().getFullYear(),
			};
		},
	});
}

const reimbursementSchema = z.object({
	description: z.string().min(1, "Description is required"),
	amount: z.string().regex(/^\d+([,.]\d{1,2})?$/, "Invalid amount"),
	purchaserName: z.string().min(1, "Purchaser name is required"),
	bankAccount: z.string().min(1, "Bank account is required"),
	notes: z.string().optional(),
	status: z.string().optional(),
	minutesId: z.string().optional(),
	minutesName: z.string().optional(),
	receiptLinks: z.string().optional(), // JSON string from hidden field
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

	if (actionType === "sendRequest") {
		return createEmailAction({
			entityType: "purchase",
			permission: "treasury:reimbursements:update",
			permissionSelf: "treasury:reimbursements:update-self",
			params,
			request,
			fetchEntity: (db, id) => db.getPurchaseById(id),
			onSend: async ({ db, entity: purchase, formData }: any) => {
				const receiptLinks = parseReceiptLinks(formData);
				const receiptError = getMissingReceiptsError(receiptLinks, true);
				if (receiptError) {
					return { success: false, error: receiptError };
				}

				const [minutesAttachment, receiptAttachments] = await Promise.all([
					buildMinutesAttachment(
						purchase.minutesId,
						purchase.minutesName || undefined,
					),
					buildReceiptAttachments(receiptLinks),
				]);

				return sendReimbursementEmail(
					{
						itemName: purchase.description || "Reimbursement request",
						itemValue: purchase.amount,
						purchaserName: purchase.purchaserName,
						bankAccount: purchase.bankAccount,
						minutesReference:
							purchase.minutesName || purchase.minutesId || "Not specified",
						notes: purchase.notes || undefined,
						receiptLinks: receiptLinks.length > 0 ? receiptLinks : undefined,
					},
					purchase.id,
					minutesAttachment || undefined,
					receiptAttachments,
					db,
				);
			},
			onSuccess: async ({ db, id, result }: any) => {
				await db.updatePurchase(id, {
					emailSent: true,
					emailMessageId: result.messageId,
					emailError: null,
				});
			},
			successRedirect: (entity: any) =>
				`/treasury/reimbursements/${entity.id}?success=sent`,
		});
	}

	return createEditAction({
		entityType: "purchase",
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
				minutesId: minutesId || undefined,
				minutesName: minutesName || undefined,
				status: (newStatus as any) || (data.status as any),
			});
		},
		successRedirect: (entity: any) =>
			`/treasury/reimbursements?year=${entity.year}&success=updated`,
	});
}

export default function EditReimbursement({
	loaderData,
}: Route.ComponentProps) {
	const {
		purchase,
		relationships,
		recentMinutes,
		receiptsByYear,
		emailConfigured,
		returnUrl,
		sourceContext,
		currentYear,
	} = loaderData as any;
	const { t } = useTranslation();
	const navigation = useNavigation();
	const fetcher = useFetcher();

	const isSubmitting =
		navigation.state === "submitting" || fetcher.state === "submitting";

	const inputFields = {
		description: purchase.description,
		amount: purchase.amount,
		purchaserName: purchase.purchaserName,
		bankAccount: {
			value: purchase.bankAccount,
			placeholder: "FI12 3456 7890 1234 56",
		},
		notes: purchase.notes,
	};

	const readOnlyFields = {
		status: t(`treasury.reimbursements.status.${purchase.status}`),
		year: String(purchase.year),
	};

	const hiddenFields = {
		_sourceType: sourceContext?.type,
		_sourceId: sourceContext?.id,
		_returnUrl: returnUrl,
		minutesId: purchase.minutesId,
		minutesName: purchase.minutesName,
		// We'll manage receiptLinks via state/children if needed,
		// but EditForm doesn't easily expose form values to children to update hidden fields.
		// However, we can use the `render` prop or just standard hidden inputs in children.
	};

	// Mocking standard relationship picker sections
	const relationshipPickerProps = {
		relationAType: "reimbursement" as const,
		relationAId: purchase.id,
		relationAName: purchase.description || "",
		mode: "edit" as const,
		currentPath: `/treasury/reimbursements/${purchase.id}/edit`,
		sections: [
			{
				relationBType: "transaction" as const,
				linkedEntities: (relationships.transaction?.linked ||
					[]) as unknown as AnyEntity[],
				availableEntities: (relationships.transaction?.available ||
					[]) as unknown as AnyEntity[],
				maxItems: 1,
				label: t("treasury.transactions.title"),
			},
			{
				relationBType: "receipt" as const,
				linkedEntities: (relationships.receipt?.linked ||
					[]) as unknown as AnyEntity[],
				availableEntities: (relationships.receipt?.available ||
					[]) as unknown as AnyEntity[],
				label: t("treasury.receipts.title"),
				// onUpload would go here but EditForm's RelationshipPicker handle it
			},
			{
				relationBType: "inventory" as const,
				linkedEntities: (relationships.inventory?.linked ||
					[]) as unknown as AnyEntity[],
				availableEntities: (relationships.inventory?.available ||
					[]) as unknown as AnyEntity[],
				label: t("treasury.inventory.title"),
			},
			{
				relationBType: "minute" as const,
				linkedEntities: purchase.minutesId
					? ([
							{
								id: purchase.minutesId,
								name: purchase.minutesName,
								type: "minute",
							},
						] as any)
					: [],
				availableEntities: recentMinutes as unknown as AnyEntity[],
				maxItems: 1,
				label: t("minutes.title"),
			},
		],
		// Custom handlers to sync minutesId/minutesName back to hidden fields
		onLink: (type: string, id: string) => {
			if (type === "minute") {
				const minute = recentMinutes.find((m: any) => m.id === id);
				if (minute) {
					const mId = document.getElementsByName(
						"minutesId",
					)[0] as HTMLInputElement;
					const mName = document.getElementsByName(
						"minutesName",
					)[0] as HTMLInputElement;
					if (mId) mId.value = id;
					if (mName) mName.value = minute.name;
				}
			}
		},
		onUnlink: (type: string) => {
			if (type === "minute") {
				const mId = document.getElementsByName(
					"minutesId",
				)[0] as HTMLInputElement;
				const mName = document.getElementsByName(
					"minutesName",
				)[0] as HTMLInputElement;
				if (mId) mId.value = "";
				if (mName) mName.value = "";
			}
		},
	};

	const canSendRequest =
		purchase.purchaserName &&
		purchase.bankAccount &&
		purchase.minutesId &&
		relationships.receipt?.linked?.length > 0;

	return (
		<PageWrapper>
			<EditForm
				title={t("treasury.reimbursements.edit.title")}
				action=""
				inputFields={inputFields as any}
				hiddenFields={hiddenFields as any}
				readOnlyFields={readOnlyFields}
				entityType="reimbursement"
				entityId={purchase.id}
				returnUrl={returnUrl || "/treasury/reimbursements"}
				relationshipPicker={relationshipPickerProps as any}
				translationNamespace="treasury.reimbursements"
			>
				{/* Send Request Button */}
				<div className="pt-6 border-t mt-6 flex justify-between items-center">
					{canSendRequest && !purchase.emailSent && emailConfigured && (
						<Button
							type="submit"
							name="_action"
							value="sendRequest"
							variant="secondary"
							disabled={isSubmitting}
						>
							<span className="material-symbols-outlined mr-2 text-sm">
								send
							</span>
							{t("treasury.reimbursements.send_request")}
						</Button>
					)}

					<div className="flex-1" />

					{/* Delete is usually outside or handled by generic utility, 
					    but for now let's manually add it if needed or rely on the fact 
						standard EditForm has Cancel/Save. 
						Old code had a separate Delete Form below. 
					*/}
				</div>
			</EditForm>
		</PageWrapper>
	);
}
