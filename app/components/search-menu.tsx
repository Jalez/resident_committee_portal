import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { useInfoReel } from "~/contexts/info-reel-context";
import { cn } from "~/lib/utils";

export interface SearchField {
	/** Query param key (e.g., "location") */
	name: string;
	/** Display label (e.g., "Sijainti / Location") */
	label: string;
	/** Field type */
	type: "text" | "select";
	/** Placeholder text */
	placeholder?: string;
	/** Available options for select fields */
	options?: string[];
}

interface SearchMenuProps {
	/** Configurable search fields */
	fields: SearchField[];
	/** Optional className for the trigger button */
	className?: string;
}

/**
 * Reusable search dropdown that uses URL query parameters.
 * Hidden in info reel mode.
 * Routes can configure which fields to show.
 */
export function SearchMenu({ fields, className }: SearchMenuProps) {
	const { isInfoReel } = useInfoReel();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [open, setOpen] = useState(false);

	// Initialize form state from current URL params
	const [formState, setFormState] = useState<Record<string, string>>(() => {
		const initial: Record<string, string> = {};
		fields.forEach((field) => {
			initial[field.name] = searchParams.get(field.name) || "";
		});
		return initial;
	});

	// Check if any filters are currently active
	const hasActiveFilters = fields.some((field) => searchParams.get(field.name));

	// Don't render in info reel mode
	if (isInfoReel) return null;

	const handleFieldChange = (name: string, value: string) => {
		setFormState((prev) => ({ ...prev, [name]: value }));
	};

	const handleApply = () => {
		const params = new URLSearchParams();

		// Only add non-empty values
		Object.entries(formState).forEach(([key, value]) => {
			if (value?.trim()) {
				params.set(key, value.trim());
			}
		});

		// Navigate with new params (or clear all if no params)
		const queryString = params.toString();
		navigate(queryString ? `?${queryString}` : ".", { replace: true });
		setOpen(false);
	};

	const handleClear = () => {
		// Reset form state
		const clearedState: Record<string, string> = {};
		fields.forEach((field) => {
			clearedState[field.name] = "";
		});
		setFormState(clearedState);

		// Navigate without params (keep menu open)
		navigate(".", { replace: true });
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"group inline-flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300",
						hasActiveFilters
							? "bg-primary text-white shadow-lg shadow-primary/20"
							: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700",
						className,
					)}
				>
					<span className="material-symbols-outlined text-xl">
						{hasActiveFilters ? "filter_alt" : "search"}
					</span>
					<span className="text-sm font-bold hidden sm:inline">
						{hasActiveFilters ? "Suodata" : "Hae"}
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-80" align="end">
				<div className="space-y-4">
					<h4 className="font-bold text-sm uppercase tracking-wider text-gray-500 dark:text-gray-400">
						Haku / Search
					</h4>

					{fields.map((field) => (
						<div key={field.name} className="space-y-2">
							<Label htmlFor={field.name}>{field.label}</Label>

							{field.type === "text" ? (
								<Input
									id={field.name}
									placeholder={field.placeholder || ""}
									value={formState[field.name] || ""}
									onChange={(e) =>
										handleFieldChange(field.name, e.target.value)
									}
								/>
							) : field.type === "select" && field.options ? (
								<Select
									value={formState[field.name] || ""}
									onValueChange={(value) =>
										handleFieldChange(field.name, value)
									}
								>
									<SelectTrigger>
										<SelectValue
											placeholder={field.placeholder || "Valitse..."}
										/>
									</SelectTrigger>
									<SelectContent>
										{field.options.map((option) => (
											<SelectItem key={option} value={option}>
												{option}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : null}
						</div>
					))}

					<div className="flex gap-2 pt-2">
						<Button
							variant="outline"
							size="sm"
							onClick={handleClear}
							className="flex-1"
							disabled={!Object.values(formState).some((v) => v?.trim())}
						>
							<span>Tyhjennä</span>
							<span className="text-muted-foreground ml-1">/ Clear</span>
						</Button>
						<Button size="sm" onClick={handleApply} className="flex-1">
							<span>Hae</span>
							<span className="opacity-75 ml-1">/ Search</span>
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
