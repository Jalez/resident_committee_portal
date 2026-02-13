import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryStatusPill } from "~/components/treasury/treasury-status-pill";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import type { RelationshipEntityType } from "~/db/types";
import { ENTITY_DEFINITIONS } from "~/lib/entity-definitions";
import { ENTITY_REGISTRY } from "~/lib/entity-registry";
import { formatCurrency, formatDate } from "~/lib/format-utils";
import { cn } from "~/lib/utils";

export type DisplayFieldType =
	| "text"
	| "number"
	| "date"
	| "select"
	| "textarea"
	| "currency"
	| "checkbox"
	| "time"
	| "url";

export interface DisplayFieldConfig {
	value: any;
	type?: DisplayFieldType;
	label?: string;
	hide?: boolean;
	className?: string;
	valueClassName?: string;
	options?: { value: string; label: string }[];
	render?: (value: any, field: DisplayFieldConfig) => React.ReactNode;
}

export interface ViewFormProps {
	title: string;
	entityType: RelationshipEntityType;
	entityId: string;
	entityName?: string;
	displayFields: Record<string, DisplayFieldConfig | any>;
	variant?: "treasury" | "content";
	relationships?: Record<string, { linked: any[]; available?: any[] }>;
	returnUrl?: string;
	editUrl?: string;
	canEdit?: boolean;
	canDelete?: boolean;
	deleteUrl?: string;
	translationNamespace?: string;
	systemLanguages?: { primary: string; secondary: string | null };
	useSecondary?: boolean;
	children?: React.ReactNode;
	className?: string;
}

export function ViewForm({
	title,
	entityType,
	entityId,
	entityName,
	displayFields,
	variant = "treasury",
	relationships,
	returnUrl,
	editUrl,
	canEdit = false,
	canDelete = false,
	deleteUrl,
	translationNamespace,
	systemLanguages,
	useSecondary,
	children,
	className,
}: ViewFormProps) {
	const { t, i18n } = useTranslation();
	const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
	const deleteFetcher = useFetcher();

	const definition = ENTITY_DEFINITIONS[entityType];
	const registry = ENTITY_REGISTRY[entityType];

	const resolvedEditUrl =
		editUrl || (registry ? registry.editUrl(entityId) : undefined);
	const resolvedDeleteUrl =
		deleteUrl || (registry ? registry.deleteUrl(entityId) : undefined);
	const defaultReturnUrl =
		registry?.detailUrl(entityId).split("/").slice(0, -1).join("/") || "/";
	const resolvedReturnUrl = returnUrl || defaultReturnUrl;

	const fields = React.useMemo(() => {
		const list: Array<{
			name: string;
			config: DisplayFieldConfig;
			schemaConfig?: any;
		}> = [];

		const schemaFields = definition?.fields || {};
		const allKeys = new Set([
			...Object.keys(schemaFields),
			...Object.keys(displayFields),
		]);

		for (const name of allKeys) {
			const propConfig = displayFields[name];

			if (propConfig === null || propConfig === undefined) continue;

			let config: DisplayFieldConfig;
			if (
				propConfig &&
				typeof propConfig === "object" &&
				("value" in propConfig ||
					"type" in propConfig ||
					"render" in propConfig ||
					"hide" in propConfig ||
					"label" in propConfig)
			) {
				config = propConfig as DisplayFieldConfig;
			} else {
				config = { value: propConfig };
			}

			if (config.hide) continue;

			list.push({
				name,
				config,
				schemaConfig: schemaFields[name],
			});
		}

		return list;
	}, [displayFields, definition]);

	const renderFieldValue = (
		field: DisplayFieldConfig,
		schemaConfig: any,
		name: string,
	): React.ReactNode => {
		if (field.render) {
			return field.render(field.value, field);
		}

		const type = field.type || schemaConfig?.type || "text";
		const value = field.value;

		if (value === null || value === undefined || value === "") {
			return "—";
		}

		switch (type) {
			case "currency":
				return formatCurrency(value);
			case "date":
				return formatDate(value, i18n.language);
			case "checkbox":
				return (
					<Badge variant="secondary">
						{value ? t("common.yes", "Yes") : t("common.no", "No")}
					</Badge>
				);
			case "select": {
				const options = field.options || schemaConfig?.options || [];
				const option = options.find(
					(o: any) => (typeof o === "string" ? o : o.value) === value,
				);
				const label =
					typeof option === "string" ? option : option?.label || value;
				const statusVariants = registry?.statusVariants || {};
				if (statusVariants[value]) {
					return (
						<TreasuryStatusPill
							value={value}
							variantMap={statusVariants}
							label={label}
						/>
					);
				}
				return label;
			}
			case "textarea":
				return <span className="whitespace-pre-wrap">{String(value)}</span>;
			case "url":
				return (
					<a
						href={value}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline break-all"
					>
						{value}
					</a>
				);
			default:
				return String(value);
		}
	};

	const getLabel = (name: string, field: DisplayFieldConfig): string => {
		if (field.label) return field.label;
		if (translationNamespace) {
			return t(
				`${translationNamespace}.${name}_label`,
				t(`${translationNamespace}.${name}`, name),
			);
		}
		return t(`common.fields.${name}`, name);
	};

	const relationshipSections = React.useMemo(() => {
		if (!relationships) return null;

		const configuredRelationships = definition?.relationships || {};

		const allEntityTypes: RelationshipEntityType[] = [
			"receipt",
			"transaction",
			"reimbursement",
			"budget",
			"inventory",
			"minute",
			"news",
			"faq",
			"poll",
			"social",
			"event",
			"mail",
		];

		return allEntityTypes
			.filter((type) => type !== entityType && relationships[type])
			.map((type) => {
				const config = configuredRelationships[type];
				return {
					relationBType: type,
					linkedEntities: relationships[type]?.linked || [],
					availableEntities: [],
					maxItems: (config as any)?.maxItems,
					label: (config as any)?.labelKey
						? t((config as any).labelKey)
						: undefined,
				};
			});
	}, [relationships, definition, t, entityType]);

	if (variant === "content") {
		const primaryTitle =
			useSecondary && displayFields.titleSecondary
				? (displayFields.titleSecondary as DisplayFieldConfig).value
				: displayFields.title
					? (displayFields.title as DisplayFieldConfig).value
					: title;

		const contentFields = fields.filter(
			(f) => !["title", "titleSecondary", "createdAt"].includes(f.name),
		);
		const createdAtField = fields.find((f) => f.name === "createdAt");

		return (
			<PageWrapper>
				<SplitLayout
					header={{
						primary: String(primaryTitle || title),
						secondary: "",
					}}
				>
					<div className={cn("max-w-2xl space-y-6", className)}>
						<div className="bg-card rounded-2xl p-8 shadow-sm border border-border space-y-6">
							{contentFields.map((field) => {
								const isContent =
									field.name === "content" ||
									field.name === "contentSecondary" ||
									field.name === "answer" ||
									field.name === "answerSecondary";
								const isSummary =
									field.name === "summary" || field.name === "summarySecondary";

								return (
									<div
										key={field.name}
										className={cn(
											isContent &&
												"prose dark:prose-invert max-w-none whitespace-pre-wrap text-gray-700 dark:text-gray-300 text-lg leading-relaxed",
											isSummary &&
												"text-lg text-gray-600 dark:text-gray-400 font-medium border-l-4 border-primary pl-4 py-1",
											field.config.className,
										)}
									>
										{renderFieldValue(
											field.config,
											field.schemaConfig,
											field.name,
										)}
									</div>
								);
							})}

							<div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-sm text-gray-500">
								{createdAtField && (
									<span>
										{formatDate(createdAtField.config.value, i18n.language)}
									</span>
								)}
								{canEdit && resolvedEditUrl && (
									<Button variant="outline" size="sm" asChild>
										<Link to={resolvedEditUrl}>
											<span className="material-symbols-outlined mr-2 text-sm">
												edit
											</span>
											{t("common.actions.edit")}
										</Link>
									</Button>
								)}
							</div>
						</div>

						{children}

						<div className="flex justify-start">
							<Button variant="ghost" asChild>
								<Link to={resolvedReturnUrl} className="flex items-center">
									<span className="material-symbols-outlined mr-2">
										arrow_back
									</span>
									{t("common.actions.back")}
								</Link>
							</Button>
						</div>
					</div>
				</SplitLayout>
			</PageWrapper>
		);
	}

	return (
		<PageWrapper>
			<div className={cn("w-full max-w-2xl mx-auto px-4 pb-12", className)}>
				<div className="flex items-center justify-between mb-4">
					<PageHeader title={title} />
					<div className="flex gap-2">
						{canEdit && resolvedEditUrl && (
							<Button variant="default" asChild>
								<Link to={resolvedEditUrl}>
									<span className="material-symbols-outlined mr-2 text-sm">
										edit
									</span>
									{t("common.actions.edit")}
								</Link>
							</Button>
						)}
					</div>
				</div>

				<div className="space-y-6">
					<TreasuryDetailCard title={title}>
						<div className="grid gap-4">
							{fields.map((field) => (
								<TreasuryField
									key={field.name}
									label={getLabel(field.name, field.config)}
									className={field.config.className}
									valueClassName={field.config.valueClassName}
								>
									{renderFieldValue(
										field.config,
										field.schemaConfig,
										field.name,
									)}
								</TreasuryField>
							))}
						</div>

						{relationshipSections && relationshipSections.length > 0 && (
							<RelationshipPicker
								relationAType={entityType}
								relationAId={entityId}
								relationAName={entityName || ""}
								mode="view"
								sections={relationshipSections}
							/>
						)}

						{canDelete && resolvedDeleteUrl && (
							<div className="flex gap-2 pt-4">
								<Button
									type="button"
									variant="destructive"
									onClick={() => setShowDeleteConfirm(true)}
									disabled={deleteFetcher.state !== "idle"}
								>
									<span className="material-symbols-outlined mr-2 text-sm">
										delete
									</span>
									{t("common.actions.delete")}
								</Button>
							</div>
						)}
						{canDelete && resolvedDeleteUrl && (
							<ConfirmDialog
								open={showDeleteConfirm}
								onOpenChange={setShowDeleteConfirm}
								title={t("common.actions.delete")}
								description={t("common.actions.delete_confirm")}
								confirmLabel={t("common.actions.delete")}
								cancelLabel={t("common.actions.cancel")}
								variant="destructive"
								onConfirm={() => {
									deleteFetcher.submit(
										{ _method: "DELETE" },
										{
											method: "post",
											action: resolvedDeleteUrl,
										},
									);
									setShowDeleteConfirm(false);
								}}
								loading={deleteFetcher.state !== "idle"}
							/>
						)}
					</TreasuryDetailCard>

					{children}

					<div className="flex gap-3">
						<Link to={resolvedReturnUrl}>
							<Button variant="outline">
								<span className="material-symbols-outlined mr-2">
									arrow_back
								</span>
								{t("common.actions.back_to_list", "Back")}
							</Button>
						</Link>
					</div>
				</div>
			</div>
		</PageWrapper>
	);
}
