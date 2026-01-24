import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import type {
	EnvCategory,
	EnvStatus,
	EnvVariable,
} from "~/lib/env-config.server";
import { cn } from "~/lib/utils";

interface SetupGuideProps {
	envStatus: EnvStatus;
}

// Material icon component
function Icon({ name, className }: { name: string; className?: string }) {
	return (
		<span className={cn("material-symbols-outlined", className)}>{name}</span>
	);
}

// Progress bar component
function ProgressBar({ value, max }: { value: number; max: number }) {
	const percentage = max > 0 ? (value / max) * 100 : 0;

	return (
		<div className="w-full h-2 bg-muted rounded-full overflow-hidden">
			<div
				className={cn(
					"h-full transition-all duration-500 rounded-full",
					percentage === 100
						? "bg-green-500"
						: percentage > 50
							? "bg-yellow-500"
							: "bg-primary",
				)}
				style={{ width: `${percentage}%` }}
			/>
		</div>
	);
}

// Environment variable item
function EnvVariableItem({ variable }: { variable: EnvVariable }) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="flex flex-col gap-2 py-3 border-b border-border/50 last:border-0">
			<div className="flex items-start gap-3">
				<div className="pt-0.5">
					<Checkbox
						checked={variable.isSet}
						disabled
						className={cn(
							variable.isSet
								? "data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
								: variable.required
									? "border-destructive"
									: "",
						)}
					/>
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<code
							className={cn(
								"text-sm font-mono px-1.5 py-0.5 rounded",
								variable.isSet
									? "bg-green-500/10 text-green-700 dark:text-green-400"
									: "bg-muted text-foreground",
							)}
						>
							{variable.name}
						</code>
						{variable.required && !variable.isSet && (
							<span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
								Required / Pakollinen
							</span>
						)}
						{variable.isSet && (
							<Icon name="check_circle" className="text-green-500 !text-base" />
						)}
					</div>
					<p className="text-sm text-muted-foreground mt-1">
						{variable.description}
					</p>
					<p className="text-xs text-muted-foreground/70">
						{variable.descriptionFi}
					</p>

					{(variable.helpText || variable.helpLink) && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setExpanded(!expanded)}
							className="h-auto p-0 text-primary hover:underline hover:bg-transparent mt-1 flex items-center gap-1 font-normal"
						>
							<Icon
								name={expanded ? "expand_less" : "expand_more"}
								className="!text-sm"
							/>
							{expanded ? "Hide details" : "Show details"}
						</Button>
					)}

					{expanded && (
						<div className="mt-2 p-3 bg-muted/50 rounded-md text-sm space-y-2">
							{variable.helpText && (
								<p className="text-muted-foreground">{variable.helpText}</p>
							)}
							{variable.helpLink && (
								<a
									href={variable.helpLink}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 text-primary hover:underline"
								>
									<Icon name="open_in_new" className="!text-sm" />
									Open setup guide
								</a>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// Category card component
function CategoryCard({
	category,
	defaultExpanded = false,
}: {
	category: EnvCategory;
	defaultExpanded?: boolean;
}) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const hasMissingRequired = category.variables.some(
		(v) => v.required && !v.isSet,
	);

	return (
		<Card
			className={cn(
				"transition-all",
				hasMissingRequired && "border-destructive/30",
			)}
		>
			<CardHeader
				className="cursor-pointer select-none"
				onClick={() => setExpanded(!expanded)}
			>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div
							className={cn(
								"p-2 rounded-lg",
								category.isFullyConfigured
									? "bg-green-500/10 text-green-600 dark:text-green-400"
									: hasMissingRequired
										? "bg-destructive/10 text-destructive"
										: "bg-muted text-muted-foreground",
							)}
						>
							<Icon name={category.icon} />
						</div>
						<div>
							<CardTitle className="text-base flex items-center gap-2">
								{category.name}
								{category.isFullyConfigured && (
									<Icon name="verified" className="text-green-500 !text-lg" />
								)}
							</CardTitle>
							<CardDescription className="text-xs">
								{category.nameFi} — {category.description}
							</CardDescription>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<div className="text-right">
							<span
								className={cn(
									"text-sm font-medium",
									category.isFullyConfigured
										? "text-green-600 dark:text-green-400"
										: "",
								)}
							>
								{category.configuredCount}/{category.totalCount}
							</span>
						</div>
						<Icon
							name={expanded ? "expand_less" : "expand_more"}
							className="text-muted-foreground"
						/>
					</div>
				</div>
				<div className="mt-3">
					<ProgressBar
						value={category.configuredCount}
						max={category.totalCount}
					/>
				</div>
			</CardHeader>

			{expanded && (
				<CardContent className="pt-0">
					{category.variables.map((variable) => (
						<EnvVariableItem key={variable.name} variable={variable} />
					))}
				</CardContent>
			)}
		</Card>
	);
}

// Main setup guide component
export function SetupGuide({ envStatus }: SetupGuideProps) {
	const percentage =
		envStatus.totalVariables > 0
			? Math.round((envStatus.totalConfigured / envStatus.totalVariables) * 100)
			: 0;

	return (
		<div className="min-h-screen bg-background p-4 md:p-8">
			<div className="max-w-3xl mx-auto space-y-6">
				{/* Header */}
				<div className="text-center space-y-4 py-8">
					<div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full">
						<Icon name="settings" className="!text-5xl text-primary" />
					</div>
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight">
						Setup Guide
					</h1>
					<p className="text-muted-foreground max-w-lg mx-auto">
						Welcome! Configure your environment variables to get started.
						<br />
						<span className="text-sm">
							Tervetuloa! Määritä ympäristömuuttujat aloittaaksesi.
						</span>
					</p>
				</div>

				{/* Overall Progress */}
				<Card className="bg-gradient-to-br from-card to-muted/30">
					<CardContent className="pt-6">
						<div className="flex items-center justify-between mb-3">
							<span className="text-sm font-medium">
								Configuration Progress / Määrityksen edistyminen
							</span>
							<span
								className={cn(
									"text-lg font-bold",
									percentage === 100 ? "text-green-500" : "",
								)}
							>
								{percentage}%
							</span>
						</div>
						<ProgressBar
							value={envStatus.totalConfigured}
							max={envStatus.totalVariables}
						/>
						<p className="text-xs text-muted-foreground mt-2">
							{envStatus.totalConfigured} of {envStatus.totalVariables}{" "}
							variables configured
						</p>
					</CardContent>
				</Card>

				{/* Critical Warning */}
				{envStatus.missingCritical.length > 0 && (
					<Alert variant="destructive">
						<AlertTriangle className="size-4" />
						<AlertTitle>
							Missing Required Variables / Puuttuvat pakolliset muuttujat
						</AlertTitle>
						<AlertDescription>
							The following variables are required to start the app:
							<div className="mt-2 flex flex-wrap gap-2">
								{envStatus.missingCritical.map((name) => (
									<code
										key={name}
										className="bg-destructive/20 px-2 py-0.5 rounded text-xs"
									>
										{name}
									</code>
								))}
							</div>
						</AlertDescription>
					</Alert>
				)}

				{/* Ready to Start */}
				{envStatus.canStart && (
					<Alert className="border-green-500/30 bg-green-500/5">
						<CheckCircle2 className="size-4 text-green-500" />
						<AlertTitle className="text-green-700 dark:text-green-400">
							Ready to Start / Valmis käynnistettäväksi
						</AlertTitle>
						<AlertDescription>
							Core configuration is complete. You can start the app with{" "}
							<code className="bg-muted px-1.5 py-0.5 rounded">bun dev</code>.
							Optional features may require additional configuration.
						</AlertDescription>
					</Alert>
				)}

				{/* Quick Start Instructions */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base flex items-center gap-2">
							<Icon name="terminal" className="text-primary" />
							Quick Start / Pikaohje
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<p className="text-sm text-muted-foreground">
								1. Copy the template file:
							</p>
							<code className="block bg-muted p-3 rounded-md text-sm font-mono">
								cp .env.template .env
							</code>
						</div>
						<div className="space-y-2">
							<p className="text-sm text-muted-foreground">
								2. Edit <code className="bg-muted px-1 rounded">.env</code> and
								fill in your values
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm text-muted-foreground">
								3. Run database migrations:
							</p>
							<code className="block bg-muted p-3 rounded-md text-sm font-mono">
								bun run db:push
							</code>
						</div>
						<div className="space-y-2">
							<p className="text-sm text-muted-foreground">
								4. Seed the database with initial data:
							</p>
							<code className="block bg-muted p-3 rounded-md text-sm font-mono">
								bun run db:seed
							</code>
						</div>
						<div className="space-y-2">
							<p className="text-sm text-muted-foreground">
								5. Start the development server:
							</p>
							<code className="block bg-muted p-3 rounded-md text-sm font-mono">
								bun dev
							</code>
						</div>
					</CardContent>
				</Card>

				{/* Category Cards */}
				<div className="space-y-4">
					<h2 className="text-lg font-semibold">
						Environment Variables / Ympäristömuuttujat
					</h2>
					{envStatus.categories.map((category, index) => (
						<CategoryCard
							key={category.name}
							category={category}
							// Expand first category or categories with missing required vars
							defaultExpanded={
								index === 0 ||
								category.variables.some((v) => v.required && !v.isSet)
							}
						/>
					))}
				</div>

				{/* Footer */}
				<div className="text-center py-8 text-sm text-muted-foreground">
					<p>
						Need help? Check the{" "}
						<a
							href="https://github.com"
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary hover:underline"
						>
							README.md
						</a>{" "}
						or open an issue.
					</p>
					<p className="mt-1 text-xs">
						Refresh this page after updating your{" "}
						<code className="bg-muted px-1 rounded">.env</code> file.
					</p>
				</div>
			</div>
		</div>
	);
}
