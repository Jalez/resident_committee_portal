import { Loader2, Sparkles } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { useUser } from "~/contexts/user-context";
import { translateWithOllama } from "~/lib/ollama-client";
import { cn } from "~/lib/utils";

export type FieldOption = {
	value: string;
	label: string;
};

export type FieldType =
	| "text"
	| "number"
	| "date"
	| "select"
	| "textarea"
	| "currency"
	| "checkbox"
	| "time"
	| "hidden"
	| "url";

export interface FieldProps {
	name: string;
	label?: string;
	type?: FieldType;
	value?: string | number | boolean;
	onChange?: (value: string) => void;
	options?: FieldOption[] | string[];
	required?: boolean;
	placeholder?: string;
	disabled?: boolean;
	readOnly?: boolean;
	description?: string;
	className?: string; // Wrapper class
	valueClassName?: string; // Class for the input itself
	min?: string;
	max?: string;
	step?: string;
	error?: string;
	translationNamespace?: string;
	localModel?: string | null;
	sourceLanguage?: string;
	targetLanguage?: string;
}

export function Field({
	name,
	label,
	type = "text",
	value = "",
	onChange,
	options,
	required,
	placeholder,
	disabled,
	readOnly,
	description,
	className,
	valueClassName,
	min,
	max,
	step,
	error,
	translationNamespace,
	localModel,
	sourceLanguage,
	targetLanguage,
}: FieldProps) {
	const { t } = useTranslation();
	const { user } = useUser();
	const [isTranslating, setIsTranslating] = React.useState(false);
	const [isHovered, setIsHovered] = React.useState(false);

	if (type === "hidden") {
		return <input type="hidden" name={name} value={String(value ?? "")} />;
	}

	const canTranslate = !!(
		localModel &&
		user?.localOllamaEnabled &&
		(type === "text" || type === "textarea") &&
		sourceLanguage &&
		targetLanguage
	);

	const handleQuickTranslate = async () => {
		if (!localModel || !user?.localOllamaUrl) return;

		// How do we find the "source" field?
		// If this is questionSecondary, source is question.
		// If this is question, source is questionSecondary.
		const isSecondary = name.endsWith("Secondary");
		const sourceName = isSecondary
			? name.replace("Secondary", "")
			: `${name}Secondary`;

		const sourceInput = document.getElementById(sourceName) as
			| HTMLInputElement
			| HTMLTextAreaElement
			| null;
		const sourceValue = sourceInput?.value;

		if (!sourceValue) {
			toast.error(
				t("field.translation.no_source", {
					defaultValue: "Source field is empty",
				}),
			);
			return;
		}

		setIsTranslating(true);
		try {
			const result = await translateWithOllama(
				user.localOllamaUrl,
				localModel,
				sourceValue,
				isSecondary ? sourceLanguage || "Source" : targetLanguage || "Target",
				isSecondary ? targetLanguage || "Target" : sourceLanguage || "Source",
			);
			onChange?.(result);
			toast.success(
				t("field.translation.success", { defaultValue: "Translated!" }),
			);
		} catch (err) {
			console.error(err);
			toast.error(
				t("field.translation.error", { defaultValue: "Translation failed" }),
			);
		} finally {
			setIsTranslating(false);
		}
	};

	if (type === "checkbox") {
		// Value for checkbox is usually boolean or string "on"
		// If controlled via EditForm, value might be boolean.
		// Checkbox component expects `checked` (boolean).
		// If value is string "true", convert.
		const checked = value === true || value === "true" || value === "on";

		return (
			<div className={cn("flex items-center gap-3 space-y-0", className)}>
				<Checkbox
					id={name}
					name={name}
					checked={checked}
					onCheckedChange={(checked) => onChange?.(String(checked))}
					disabled={disabled}
					className={cn(error && "border-destructive", valueClassName)}
				/>
				{label && (
					<Label
						htmlFor={name}
						className={cn(
							"cursor-pointer font-normal",
							error ? "text-destructive" : "",
						)}
					>
						{label}
						{required && <span className="text-destructive ml-1">*</span>}
					</Label>
				)}
				{description && !error && (
					<p className="text-sm text-muted-foreground ml-2">{description}</p>
				)}
			</div>
		);
	}

	// If options are strings, we need translation context to generate labels
	const getOptionLabel = (opt: FieldOption | string) => {
		if (typeof opt !== "string") {
			if (!translationNamespace) return opt.label;
			return t(
				`${translationNamespace}.${name}es.${opt.value}`,
				opt.label,
			);
		}
		return translationNamespace
			? t(`${translationNamespace}.${name}es.${opt}`)
			: opt;
	};

	const getOptionValue = (opt: FieldOption | string) => {
		return typeof opt === "string" ? opt : opt.value;
	};

	return (
		<div
			className={cn("group min-w-0 space-y-1 relative", className)}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{label && (
				<div className="flex items-center justify-between">
					<Label htmlFor={name} className={error ? "text-destructive" : ""}>
						{label}
						{required && <span className="text-destructive ml-1">*</span>}
					</Label>

					{canTranslate && (isHovered || isTranslating) && (
						<button
							type="button"
							onClick={handleQuickTranslate}
							disabled={isTranslating}
							className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-opacity animate-in fade-in"
							title={t("field.translate_hint", {
								defaultValue: "Translate from other language",
							})}
						>
							{isTranslating ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<Sparkles className="w-3 h-3" />
							)}
							{t("common.actions.translate", { defaultValue: "Translate" })}
						</button>
					)}
				</div>
			)}

			<div className="relative min-w-0">
				{type === "select" && options ? (
					<>
						{readOnly && (
							<input type="hidden" name={name} value={String(value ?? "")} />
						)}
						<Select
							name={readOnly ? undefined : name}
							value={String(value)}
							onValueChange={onChange}
							disabled={disabled || readOnly}
							required={required}
						>
							<SelectTrigger
								id={name}
								className={cn(
									readOnly && "bg-muted/60 border-dashed",
									error && "border-destructive",
									valueClassName,
								)}
							>
								<SelectValue placeholder={placeholder} />
							</SelectTrigger>
							<SelectContent>
								{options.map((opt) => {
									const val = getOptionValue(opt);
									return (
										<SelectItem key={val} value={val}>
											{getOptionLabel(opt)}
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
					</>
				) : type === "textarea" ? (
					<Textarea
						id={name}
						name={name}
						value={String(value ?? "")}
						onChange={(e) => onChange?.(e.target.value)}
						required={required}
						placeholder={placeholder}
						disabled={disabled}
						readOnly={readOnly}
						rows={3}
						className={cn(
							readOnly && "bg-muted/60 border-dashed",
							error && "border-destructive",
							valueClassName,
						)}
					/>
				) : type === "currency" ? (
					<div className="relative">
						<Input
							id={name}
							name={name}
							type="text"
							inputMode="decimal"
							value={String(value ?? "")}
							onChange={(e) => onChange?.(e.target.value)}
							required={required}
							placeholder={placeholder || "0,00"}
							disabled={disabled}
							readOnly={readOnly}
							className={cn(
								"pr-8",
								readOnly && "bg-muted/60 border-dashed font-medium",
								error && "border-destructive",
								valueClassName,
							)}
						/>
						<span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
							€
						</span>
					</div>
				) : (
					<Input
						id={name}
						name={name}
						type={
							type === "number"
								? "number"
								: type === "date"
									? "date"
									: type === "time"
										? "time"
										: "text"
						}
						value={String(value ?? "")}
						onChange={(e) => onChange?.(e.target.value)}
						required={required}
						placeholder={placeholder}
						disabled={disabled}
						readOnly={readOnly}
						min={min}
						max={max}
						step={step}
						className={cn(
							readOnly && "bg-muted/60 border-dashed",
							error && "border-destructive",
							valueClassName,
						)}
					/>
				)}
			</div>

			{description && !error && (
				<p className="text-sm text-muted-foreground break-words">{description}</p>
			)}
			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}
