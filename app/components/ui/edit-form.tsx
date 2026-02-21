import * as React from "react";
import { Save, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Form, useNavigate } from "react-router";
import { PageHeader } from "~/components/layout/page-header";
import {
	RelationshipPicker,
	type RelationshipPickerProps,
	type RelationshipSection,
} from "~/components/relationships/relationship-picker";
import { SmartAutofillButton } from "~/components/smart-autofill-button";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Field, type FieldOption, type FieldType } from "~/components/ui/field";
import type { RelationshipEntityType } from "~/db/types";
import type { AnyEntity } from "~/lib/entity-converters";
import { ENTITY_DEFINITIONS } from "~/lib/entity-definitions";
import { ENTITY_REGISTRY } from "~/lib/entity-registry";
import { cn } from "~/lib/utils";
import { ReadOnlyFields } from "./read-only-fields";

export type { FieldType, FieldOption };

export interface EditFormField {
	name: string;
	label?: string;
	type?: FieldType; // Optional, inferred from name if valid
	required?: boolean;
	placeholder?: string;
	options?: FieldOption[] | string[];
	description?: string;
	className?: string;
	valueClassName?: string; // For read-only/custom display
	disabled?: boolean;
	readOnly?: boolean;
	step?: string;
	min?: string;
	max?: string;
	value?: any; // For hidden fields or specific overrides
	hidden?: boolean;
	// Custom render function if absolutely needed (e.g. complex UI)
	render?: (
		field: EditFormField,
		value: any,
		onChange: (val: any) => void,
	) => React.ReactNode;
}

export type InputFieldConfig =
	| Omit<EditFormField, "name">
	| string
	| number
	| boolean
	| null
	| undefined;

export interface EditFormProps {
	title: string;
	action: string;
	method?: "post" | "put" | "patch" | "delete";

	// New Object-based API
	inputFields?: Record<string, InputFieldConfig>;
	hiddenFields?: Record<string, string | number | boolean | null | undefined>;
	readOnlyFields?: Record<string, string | number | boolean | null | undefined>;
	returnUrl?: string;
	deleteUrl?: string;
	onCancel?: () => void;
	children?: React.ReactNode; // For extra content before actions
	className?: string;
	encType?:
		| "application/x-www-form-urlencoded"
		| "multipart/form-data"
		| "text/plain";
	entityId?: string; // For auto-linking hidden fields if needed
	entityType?: string; // For auto-fill
	entityName?: string; // For relationship picker context
	relationshipPicker?: RelationshipPickerProps;
	relationships?: Record<
		string,
		{ linked: AnyEntity[]; available: AnyEntity[]; canWrite?: boolean }
	>;
	translationNamespace?: string; // e.g. "treasury.budgets" for auto-labels
	onFieldChange?: (name: string, value: any) => void;
	sourceLanguage?: string;
	targetLanguage?: string;
	submitDisabled?: boolean;
}

export function EditForm({
	title,
	action,
	method = "post",
	inputFields = {},
	hiddenFields = {},
	returnUrl,
	deleteUrl,
	onCancel,
	children,
	className,
	encType,
	entityId,
	entityType,
	entityName,
	relationshipPicker,
	relationships,
	readOnlyFields,
	translationNamespace,
	onFieldChange,
	sourceLanguage,
	targetLanguage,
	submitDisabled,
}: EditFormProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const formId = React.useId();
	const formRef = React.useRef<HTMLFormElement | null>(null);

	const resolvedDeleteUrl = React.useMemo(() => {
		if (deleteUrl) return deleteUrl;
		if (entityType && entityId && entityType in ENTITY_REGISTRY) {
			return ENTITY_REGISTRY[entityType as RelationshipEntityType]?.deleteUrl(
				entityId,
			);
		}
		return null;
	}, [deleteUrl, entityType, entityId]);

	// Local model state management
	const [localModel, setLocalModel] = React.useState<string | null>(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("local-ollama-model");
		}
		return null;
	});

	// Transform object props to flat array for internal rendering
	const fields = React.useMemo(() => {
		const list: EditFormField[] = [];

		// 1. Determine base fields (Schema + Overrides)
		const schema = entityType
			? ENTITY_DEFINITIONS[entityType as RelationshipEntityType]
			: null;
		const schemaFields = schema?.fields || {};

		// Combine keys from schema and prop (prop takes precedence if null to remove)
		const allKeys = new Set([
			...Object.keys(schemaFields),
			...Object.keys(inputFields),
		]);

		for (const name of allKeys) {
			const propConfig = inputFields[name];

			// If explicit null/undefined in inputFields AND it's a key in inputFields, skip (exclude)
			// This allows removing schema fields by passing { fieldName: null }
			if (
				name in inputFields &&
				(propConfig === null || propConfig === undefined)
			) {
				continue;
			}

			// Default to schema config, then merge prop config
			const schemaConfig = schemaFields[name] || {};
			let field: EditFormField = { name, ...schemaConfig };

			if (propConfig && typeof propConfig === "object") {
				// It's a full config object
				field = { ...field, ...propConfig } as EditFormField;
			} else if (propConfig !== undefined) {
				// It's a primitive value, treat as value
				field.value = propConfig;
			}

			// If not in schema and not in inputFields (shouldn't happen with set logic), skip
			if (!Object.keys(schemaConfig).length && propConfig === undefined)
				continue;

			list.push(field);
		}

		// Sort relying on insertion order which is mostly predictable for now.
		// We might want to enforce schema order.
		const sortedList = list.sort((a, b) => {
			const indexA = Object.keys(schemaFields).indexOf(a.name);
			const indexB = Object.keys(schemaFields).indexOf(b.name);
			// If both in schema, usage schema order.
			if (indexA !== -1 && indexB !== -1) return indexA - indexB;
			// If only A in schema, A comes first
			if (indexA !== -1) return -1;
			if (indexB !== -1) return 1;
			return 0;
		});

		// 2. Hidden fields from hiddenFields prop
		for (const [name, value] of Object.entries(hiddenFields)) {
			if (value !== undefined && value !== null) {
				// Overwrite if exists, or push new
				const existingIdx = sortedList.findIndex((f) => f.name === name);
				if (existingIdx !== -1) {
					sortedList[existingIdx] = {
						...sortedList[existingIdx],
						type: "hidden",
						value,
					};
				} else {
					sortedList.push({ name, type: "hidden", value });
				}
			}
		}

		return sortedList;
	}, [hiddenFields, inputFields, entityType]);

	const getInitialValues = React.useCallback(() => {
		const defaults: Record<string, any> = {};
		for (const field of fields) {
			if (field.value !== undefined) {
				defaults[field.name] = field.value;
			}
		}
		return defaults;
	}, [fields]);

	const [values, setValues] =
		React.useState<Record<string, any>>(getInitialValues);

	const handleChange = (name: string, value: any) => {
		setValues((prev) => ({ ...prev, [name]: value }));
		onFieldChange?.(name, value);
	};

	const inferFieldType = (name: string): FieldType => {
		if (name.startsWith("_")) return "hidden";
		if (name === "description") return "textarea";
		if (name === "amount") return "currency";
		// Add more heuristics here if needed (e.g. "date", "email" etc)
		return "text";
	};

	const handleAutofillSuggestions = (
		suggestions: Record<string, string | number | null>,
	) => {
		setValues((prev) => {
			const next = { ...prev };
			for (const [key, value] of Object.entries(suggestions)) {
				// Convert numbers to matching string format if possible, otherwise just set
				if (value != null) {
					next[key] = String(value);
					// Special handling for currency fields
					if (typeof value === "number") {
						const field = fields.find((f) => f.name === key);
						const type = field?.type || inferFieldType(key);
						if (type === "currency") {
							next[key] = String(value).replace(".", ",");
						}
					}
					onFieldChange?.(key, next[key]);
				}
			}
			return next;
		});
	};

	const handleCancel = () => {
		if (onCancel) {
			onCancel();
		} else if (returnUrl) {
			navigate(returnUrl);
		} else {
			navigate("..");
		}
	};

	// Relationship Sections Logic
	const relationshipPickerProps =
		React.useMemo<RelationshipPickerProps | null>(() => {
			if (relationshipPicker) return relationshipPicker;

			if (!entityType || !relationships || !entityId) return null;

			const schema = ENTITY_DEFINITIONS[entityType as RelationshipEntityType];
			const configuredRelationships = schema?.relationships || {};

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

			const sections: RelationshipSection[] = allEntityTypes
				.filter((type) => type !== entityType)
				.flatMap((type) => {
					const relData = relationships[type];
					if (!relData) return [];
					const config = configuredRelationships[type];

					return [{
						relationBType: type,
						linkedEntities: relData?.linked || [],
						availableEntities: relData?.available || [],
						canWrite: relData?.canWrite ?? false,
						maxItems: config?.maxItems,
						label: config?.labelKey ? t(config.labelKey) : undefined,
					}];
				});

			if (sections.length === 0) return null;

			const currentPath =
				typeof window !== "undefined"
					? `${window.location.pathname}${window.location.search}`
					: returnUrl
						? returnUrl.startsWith("http")
							? new URL(returnUrl).pathname + new URL(returnUrl).search
							: returnUrl
						: "";

			return {
				relationAType: entityType as RelationshipEntityType,
				relationAId: entityId,
				relationAName: entityName || "",
				sections,
				mode: "edit",
				currentPath,
			};
		}, [
			relationshipPicker,
			entityType,
			relationships,
			entityId,
			entityName,
			returnUrl,
			t,
		]);

	return (
		<div className={cn("w-full max-w-7xl mx-auto px-4 md:px-6 pb-12", className)}>
			<div className="py-3 sticky top-0 z-30 bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur border-b">
				<PageHeader
					title={title}
					className="mb-0"
					actions={
						<div className="flex w-full sm:w-auto min-w-0 items-center justify-between sm:justify-end gap-3 flex-nowrap">
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-10 w-10 p-0 sm:h-8 sm:w-auto sm:px-3 sm:max-w-[7.5rem] md:max-w-[9rem] lg:max-w-[10.5rem] xl:max-w-none overflow-hidden sm:shrink sm:min-w-0"
								onClick={handleCancel}
							>
								<X className="size-4 sm:mr-1.5" />
								<span className="hidden sm:inline truncate max-w-full">
									{t("common.actions.cancel")}
								</span>
							</Button>
							{entityType && entityId ? (
								<SmartAutofillButton
									entityType={entityType as any}
									entityId={entityId}
									getCurrentValues={() => {
										const currentValues = {
											...Object.fromEntries(
												Object.entries(values).map(([key, value]) => [
													key,
													value == null ? "" : String(value),
												]),
											),
										};

										if (formRef.current) {
											const formData = new FormData(formRef.current);
											for (const [key, value] of formData.entries()) {
												if (typeof value === "string") {
													currentValues[key] = value;
												}
											}
										}

										return currentValues;
									}}
									onSuggestions={handleAutofillSuggestions}
									localModel={localModel}
									onLocalModelChange={setLocalModel}
									sourceLanguage={sourceLanguage}
									targetLanguage={targetLanguage}
									iconOnlyOnMobile
								/>
							) : null}
							{resolvedDeleteUrl && (
								<Form
									action={resolvedDeleteUrl}
									method="post"
									onSubmit={(e) => {
										if (!confirm(t("common.actions.delete_confirm"))) {
											e.preventDefault();
										}
									}}
								>
									<input type="hidden" name="_method" value="DELETE" />
									<Button
										variant="destructive"
										type="submit"
										size="sm"
										className="h-10 w-10 p-0 sm:h-8 sm:w-auto sm:px-3 sm:max-w-[7.5rem] md:max-w-[9rem] lg:max-w-[10.5rem] xl:max-w-none overflow-hidden sm:shrink sm:min-w-0"
									>
										<Trash2 className="size-4 sm:mr-1.5" />
										<span className="hidden sm:inline truncate max-w-full">
											{t("common.actions.delete")}
										</span>
									</Button>
								</Form>
							)}
							<Button
								type="submit"
								form={formId}
								size="sm"
								className="h-10 w-10 p-0 sm:h-8 sm:w-auto sm:px-3 sm:max-w-[7.5rem] md:max-w-[9rem] lg:max-w-[10.5rem] xl:max-w-none overflow-hidden sm:shrink sm:min-w-0"
								disabled={submitDisabled}
							>
								<Save className="size-4 sm:mr-1.5" />
								<span className="hidden sm:inline truncate max-w-full">
									{t("common.actions.save")}
								</span>
							</Button>
						</div>
					}
				/>
			</div>
			<Card>
				<CardContent className="space-y-4">
					{/* ReadOnly Fields */}
					<ReadOnlyFields
						fields={{
							id: entityId || null,
							...readOnlyFields,
						}}
						translationNamespace={translationNamespace}
					/>
					{/* Main Edit Form */}

					<Form
						ref={formRef}
						id={formId}
						method={method}
						action={action}
						className="min-w-0"
						encType={encType}
					>
						{/* Hidden Fields */}
						{fields
							.filter((f) => f.type === "hidden")
							.map((field) => (
								<input
									key={field.name}
									type="hidden"
									name={field.name}
									value={
										field.value !== undefined ? field.value : values[field.name]
									}
								/>
							))}

						<div
							className={cn(
								"grid gap-6 min-w-0",
								relationshipPickerProps
									? "xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]"
									: "grid-cols-1",
							)}
						>
							<div className="space-y-6 min-w-0">
								{fields
									.filter((f) => f.type !== "hidden")
									.map((field) => {
										const val = values[field.name] ?? "";

										// Infer label and placeholder
										const displayLabel =
											field.label ||
											(translationNamespace
												? t(`${translationNamespace}.${field.name}`)
												: field.name);
										const displayPlaceholder =
											field.placeholder ||
											(translationNamespace
												? t(`${translationNamespace}.${field.name}_placeholder`)
												: undefined);

										if (field.render) {
											return (
												<React.Fragment key={field.name}>
													{field.render(field, val, (v) =>
														handleChange(field.name, v),
													)}
												</React.Fragment>
											);
										}

										return (
											<Field
												key={field.name}
												name={field.name}
												label={displayLabel}
												type={field.type || inferFieldType(field.name)}
												required={field.required !== false}
												placeholder={displayPlaceholder}
												value={val}
												onChange={(v) => handleChange(field.name, v)}
												options={field.options}
												description={field.description}
												translationNamespace={translationNamespace}
												className={field.hidden ? "hidden" : field.className}
												valueClassName={field.valueClassName}
												disabled={field.disabled}
												readOnly={field.readOnly}
												min={field.min}
												max={field.max}
												step={field.step}
												localModel={localModel}
												sourceLanguage={sourceLanguage}
												targetLanguage={targetLanguage}
											/>
										);
									})}

								{/* In-Form Children */}
								{children}
							</div>

							{/* Relationship Picker */}
							{relationshipPickerProps && (
								<div className="space-y-4 min-w-0 xl:sticky xl:top-24 self-start">
									<RelationshipPicker {...relationshipPickerProps} />
								</div>
							)}
						</div>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
