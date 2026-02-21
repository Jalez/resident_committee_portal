import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "~/components/layout/page-header";
import { SplitLayout } from "~/components/layout/page-layout";
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
	headerActionButtons?: React.ReactNode;
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
	headerActionButtons,
	children,
	className,
}: ViewFormProps) {
	const { t, i18n } = useTranslation();
	const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
	const deleteFetcher = useFetcher();
	const revalidator = useRevalidator();
	const deleteProcessedRef = React.useRef(false);

	React.useEffect(() => {
		if (
			deleteFetcher.state === "idle" &&
			deleteFetcher.data &&
			!deleteProcessedRef.current
		) {
			deleteProcessedRef.current = true;
			const data = deleteFetcher.data as any;
			if (data.success) {
				toast.success(t("common.actions.deleted", "Deleted successfully"));
				revalidator.revalidate();
			} else if (data.error) {
				const relationRows = Array.isArray(data.blockingRelationships)
					? data.blockingRelationships
							.map(
								(rel: any) =>
									`${rel.id}: ${rel.relationAType}:${rel.relationId} -> ${rel.relationBType}:${rel.relationBId}`,
							)
							.join("\n")
					: "";
				const dependencyRows = Array.isArray(data.blockingDependencies)
					? data.blockingDependencies.join("\n")
					: "";
				const messageParts = [data.error as string];
				if (relationRows) {
					messageParts.push(relationRows);
				}
				if (dependencyRows) {
					messageParts.push(dependencyRows);
				}
				const message = messageParts.filter(Boolean).join("\n");
				toast.error(message);
			}
		}
	}, [deleteFetcher.state, deleteFetcher.data, revalidator, t]);

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

		list.push({
			name: "id",
			config: { value: entityId },
		});

		const schemaFields = definition?.fields || {};
		const allKeys = new Set([
			...Object.keys(schemaFields),
			...Object.keys(displayFields),
		]);

		for (const name of allKeys) {
			if (name === "id") continue;

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
	}, [displayFields, definition, entityId]);

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
		if (name === "id") return "ID";
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
			"submission",
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
	const hasRelationshipSections = Boolean(
		relationshipSections && relationshipSections.length > 0,
	);

	if (variant === "content") {
		const primaryTitle =
			useSecondary && displayFields.titleSecondary
				? (displayFields.titleSecondary as DisplayFieldConfig).value
				: displayFields.title
					? (displayFields.title as DisplayFieldConfig).value
					: title;

		const contentFields = fields.filter(
			(f) => !["id", "title", "titleSecondary", "createdAt"].includes(f.name),
		);
		const createdAtField = fields.find((f) => f.name === "createdAt");

		return (
			<SplitLayout
				header={{
					primary: String(primaryTitle || title),
					secondary: "",
				}}
			>
				<div className="w-full space-y-12 relative">

					{hasRelationshipSections && (
						<div className="flex flex-wrap gap-2 pb-2">
							<RelationshipPicker
								relationAType={entityType}
								relationAId={entityId}
								relationAName={entityName || ""}
								mode="view"
								sections={relationshipSections || []}
							/>
						</div>
					)}

					<div className="space-y-10">
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
										"prose dark:prose-invert max-w-none whitespace-pre-wrap text-gray-800 dark:text-gray-200 text-2xl md:text-3xl leading-relaxed font-serif",
										isSummary &&
										"text-3xl md:text-4xl text-gray-600 dark:text-gray-400 font-bold border-l-8 border-primary/30 pl-8 py-3 italic leading-tight",
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
					</div>

					<div className="pt-12 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-base text-gray-500">
						{createdAtField && (
							<div className="flex items-center gap-2">
								<span className="material-symbols-outlined">
									calendar_today
								</span>
								<span className="font-bold tracking-tight">
									{formatDate(createdAtField.config.value, i18n.language)}
								</span>
							</div>
						)}
						<div className="flex items-center gap-4">
							{canEdit && resolvedEditUrl && (
								<Button variant="ghost" size="sm" asChild className="rounded-xl hover:bg-primary/10 hover:text-primary transition-all text-base px-6 h-12">
									<Link to={resolvedEditUrl}>
										<span className="material-symbols-outlined mr-2">
											edit
										</span>
										{t("common.actions.edit")}
									</Link>
								</Button>
							)}
						</div>
					</div>
				</div>

				{children}

				<div className="flex justify-start pt-4">
					<Button variant="ghost" asChild className="hover:bg-primary/5 rounded-xl px-4 group transition-all">
						<Link to={resolvedReturnUrl} className="flex items-center">
							<span className="material-symbols-outlined mr-2 group-hover:-translate-x-1 transition-transform">
								arrow_back
							</span>
							<span className="font-semibold tracking-tight">{t("common.actions.back")}</span>
						</Link>
					</Button>
				</div>
			</SplitLayout>
		);
	}

	return (
		<div className={cn("w-full mx-auto px-4 pb-12", className)}>
			<div className="py-3 sticky top-0 z-30 bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur border-b">
				<PageHeader
					title={title}
					className="mb-0"
					actions={
						<div className="flex w-full sm:w-auto min-w-0 items-center justify-between sm:justify-end gap-3 flex-nowrap">
							<Button
								variant="outline"
								size="sm"
								className="h-10 w-10 p-0 sm:h-8 sm:w-auto sm:px-3 sm:max-w-[7.5rem] md:max-w-[9rem] lg:max-w-[10.5rem] xl:max-w-none overflow-hidden sm:shrink sm:min-w-0"
								asChild
							>
								<Link to={resolvedReturnUrl}>
									<span className="material-symbols-outlined text-base sm:mr-1.5">
										arrow_back
									</span>
									<span className="hidden sm:inline truncate max-w-full">
										{t("common.actions.back_to_list", "Back")}
									</span>
								</Link>
							</Button>

							{headerActionButtons}

							{canDelete && resolvedDeleteUrl && (
								<Button
									type="button"
									variant="destructive"
									size="sm"
									className="h-10 w-10 p-0 sm:h-8 sm:w-auto sm:px-3 sm:max-w-[7.5rem] md:max-w-[9rem] lg:max-w-[10.5rem] xl:max-w-none overflow-hidden sm:shrink sm:min-w-0"
									onClick={() => setShowDeleteConfirm(true)}
									disabled={deleteFetcher.state !== "idle"}
								>
									<span className="material-symbols-outlined text-base sm:mr-1.5">
										delete
									</span>
									<span className="hidden sm:inline truncate max-w-full">
										{t("common.actions.delete")}
									</span>
								</Button>
							)}

							{canEdit && resolvedEditUrl && (
								<Button
									variant="outline"
									size="sm"
									className="h-10 w-10 p-0 sm:h-8 sm:w-auto sm:px-3 sm:max-w-[7.5rem] md:max-w-[9rem] lg:max-w-[10.5rem] xl:max-w-none overflow-hidden sm:shrink sm:min-w-0"
									asChild
								>
									<Link to={resolvedEditUrl}>
										<span className="material-symbols-outlined text-base sm:mr-1.5">
											edit
										</span>
										<span className="hidden sm:inline truncate max-w-full">
											{t("common.actions.edit")}
										</span>
									</Link>
								</Button>
							)}
						</div>
					}
				/>
			</div>

			<div className="space-y-6">
				<div
					className={cn(
						hasRelationshipSections && "grid gap-6 lg:grid-cols-3",
					)}
				>
					<TreasuryDetailCard
						title={title}
						className={cn(hasRelationshipSections && "lg:col-span-2")}
					>
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
									deleteProcessedRef.current = false;
									deleteFetcher.submit(null, {
										method: "DELETE",
										action: resolvedDeleteUrl,
									});
									setShowDeleteConfirm(false);
								}}
								loading={deleteFetcher.state !== "idle"}
							/>
						)}
					</TreasuryDetailCard>

					{hasRelationshipSections && relationshipSections && (
						<TreasuryDetailCard
							title={t("common.relations.title", "Relations")}
							className="lg:col-span-1"
						>
							<RelationshipPicker
								relationAType={entityType}
								relationAId={entityId}
								relationAName={entityName || ""}
								mode="view"
								sections={relationshipSections}
							/>
						</TreasuryDetailCard>
					)}
				</div>

				{children}

			</div>
		</div>
	);
}
