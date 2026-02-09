import type { ReactNode } from "react";

import { ColoredStatusLinkBadge } from "~/components/colored-status-link-badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

type TreasuryDetailCardProps = {
	title: string;
	children: ReactNode;
	className?: string;
};

export function TreasuryDetailCard({
	title,
	children,
	className,
}: TreasuryDetailCardProps) {
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="text-lg">{title}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">{children}</CardContent>
		</Card>
	);
}

type TreasuryFieldOption = {
	value: string;
	label: string;
};

type TreasuryFieldBaseProps = {
	label: string;
	className?: string;
	valueClassName?: string;
};

type TreasuryFieldViewProps = TreasuryFieldBaseProps & {
	mode?: "view";
	children: ReactNode;
};

type TreasuryFieldEditProps = TreasuryFieldBaseProps & {
	mode: "edit";
	children?: ReactNode;
	name: string;
	type?: "text" | "number" | "date" | "select" | "textarea" | "currency";
	value?: string;
	onChange?: (value: string) => void;
	options?: TreasuryFieldOption[];
	required?: boolean;
	placeholder?: string;
	disabled?: boolean;
	min?: string;
	max?: string;
	step?: string;
};

export type TreasuryFieldProps = TreasuryFieldViewProps | TreasuryFieldEditProps;

export function TreasuryField(props: TreasuryFieldProps) {
	const { label, className, valueClassName } = props;

	if (props.mode === "edit") {
		return (
			<div className={cn("space-y-1", className)}>
				<Label htmlFor={props.name}>{label}</Label>
				<TreasuryFieldInput {...props} />
			</div>
		);
	}

	return (
		<div className={cn("space-y-1", className)}>
			<Label>{label}</Label>
			<div className={cn("text-sm text-muted-foreground", valueClassName)}>
				{props.children}
			</div>
		</div>
	);
}

function TreasuryFieldInput(props: TreasuryFieldEditProps) {
	const {
		name,
		type = "text",
		value,
		onChange,
		options,
		required,
		placeholder,
		disabled,
		min,
		max,
		step,
	} = props;

	if (type === "select" && options) {
		return (
			<Select
				name={name}
				value={value}
				onValueChange={onChange}
				disabled={disabled}
				required={required}
			>
				<SelectTrigger id={name}>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{options.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	}

	if (type === "textarea") {
		return (
			<Textarea
				id={name}
				name={name}
				value={value}
				onChange={(e) => onChange?.(e.target.value)}
				required={required}
				placeholder={placeholder}
				disabled={disabled}
				rows={3}
			/>
		);
	}

	if (type === "currency") {
		return (
			<div className="relative">
				<Input
					id={name}
					name={name}
					type="text"
					inputMode="decimal"
					value={value}
					onChange={(e) => onChange?.(e.target.value)}
					required={required}
					placeholder={placeholder || "0,00"}
					disabled={disabled}
					className="pr-8"
				/>
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
					€
				</span>
			</div>
		);
	}

	return (
		<Input
			id={name}
			name={name}
			type={type === "number" ? "number" : type === "date" ? "date" : "text"}
			value={value}
			onChange={(e) => onChange?.(e.target.value)}
			required={required}
			placeholder={placeholder}
			disabled={disabled}
			min={min}
			max={max}
			step={step}
		/>
	);
}

type TreasuryRelationItem = {
	to: string;
	title: string;
	status: string;
	id: string;
	variantMap?: Record<string, string>;
	subtitle?: string | null;
};

type TreasuryRelationListProps = {
	label: string;
	items: TreasuryRelationItem[];
	withSeparator?: boolean;
};

export function TreasuryRelationList({
	label,
	items,
	withSeparator = false,
}: TreasuryRelationListProps) {
	if (items.length === 0) return null;

	return (
		<>
			{withSeparator ? <Separator /> : null}
			<div className="space-y-2">
				<Label>{label}</Label>
				<div className="space-y-1">
					{items.map((item) => (
						<ColoredStatusLinkBadge
							key={item.id}
							to={item.to}
							title={item.title}
							status={item.status}
							id={item.id}
							variantMap={item.variantMap}
							subtitle={item.subtitle}
						/>
					))}
				</div>
			</div>
		</>
	);
}
