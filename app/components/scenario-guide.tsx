import type { TFunction } from "i18next";

export interface ScenarioGuideProps {
	/** i18n key prefix for the guide content (e.g., "treasury.guide") */
	i18nPrefix: string;
	t: TFunction;
}

// Entity type to Material Icon mapping
const ENTITY_ICONS: Record<string, string> = {
	reimbursement: "request_quote",
	receipt: "receipt_long",
	minute: "description",
	transaction: "swap_horiz",
	budget: "bookmark",
	mail_thread: "mail",
	mail: "mail",
	inventory: "inventory_2",
	event: "event",
	news: "newspaper",
	faq: "help",
	poll: "poll",
	social: "share",
	submission: "contact_mail",
};

function EntityBadge({
	icon,
	label,
	optional,
}: { icon: string; label: string; optional?: boolean }) {
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
				optional
					? "bg-muted text-muted-foreground"
					: "bg-primary/10 text-primary dark:bg-primary/20"
			}`}
		>
			<span className="material-symbols-outlined text-sm">{icon}</span>
			{label}
		</span>
	);
}

function ScenarioCard({
	number,
	scenarioKey,
	i18nPrefix,
	t,
}: {
	number: number;
	scenarioKey: string;
	i18nPrefix: string;
	t: TFunction;
}) {
	const prefix = `${i18nPrefix}.scenarios.${scenarioKey}`;
	const title = t(`${prefix}.title`);
	const goal = t(`${prefix}.goal`);
	const steps = t(`${prefix}.steps`, { returnObjects: true }) as string[];
	const relations = t(`${prefix}.relations`, {
		returnObjects: true,
	}) as string[];
	const tips = t(`${prefix}.tips`, { returnObjects: true }) as
		| string[]
		| string;

	return (
		<div className="bg-card rounded-2xl border border-border p-5 space-y-4">
			<div className="space-y-2">
				<h2 className="text-lg font-semibold">
					{number}. {title}
				</h2>
				<p className="text-sm text-muted-foreground italic">"{goal}"</p>
			</div>

			<ol className="list-decimal list-inside space-y-2 text-sm">
				{Array.isArray(steps) &&
					steps.map((step, i) => (
						<li key={i} className="leading-relaxed">
							{step}
						</li>
					))}
			</ol>

			{Array.isArray(tips) && tips.length > 0 && (
				<div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 space-y-2">
					<h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
						<span className="material-symbols-outlined text-base">lightbulb</span>
						{t(`${i18nPrefix}.autofill_tip`)}
					</h3>
					<ul className="list-disc list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
						{tips.map((tip, i) => (
							<li key={i} className="leading-relaxed">
								{tip}
							</li>
						))}
					</ul>
				</div>
			)}

			<div className="space-y-2">
				<h3 className="text-sm font-semibold text-muted-foreground">
					{t(`${i18nPrefix}.required_relations`)}
				</h3>
				<div className="flex flex-wrap gap-2">
					{Array.isArray(relations) &&
						relations.map((rel, i) => {
							const isOptional =
								rel.includes("valinnainen") || rel.includes("optional");
							const icons = Object.entries(ENTITY_ICONS).filter(
								([key]) =>
									rel.toLowerCase().includes(key.replace("_", " ")) ||
									rel.toLowerCase().includes(key),
							);
							const mainIcon = icons[0]?.[1] || "link";
							return (
								<EntityBadge
									key={i}
									icon={mainIcon}
									label={rel}
									optional={isOptional}
								/>
							);
						})}
				</div>
			</div>
		</div>
	);
}

export function ScenarioGuide({
	i18nPrefix,
	t,
}: ScenarioGuideProps) {
	const scenarios = t(`${i18nPrefix}.scenarios`, {
		returnObjects: true,
	}) as Record<string, unknown>;
	const scenarioKeys = typeof scenarios === "object" && scenarios !== null
		? Object.keys(scenarios)
		: [];

	return (
		<div className="space-y-6">
			<div className="bg-card rounded-2xl border border-border p-5">
				<p className="text-sm text-muted-foreground">
					{t(`${i18nPrefix}.subtitle`)}
				</p>
			</div>

			{scenarioKeys.map((key, index) => (
				<ScenarioCard key={key} number={index + 1} scenarioKey={key} i18nPrefix={i18nPrefix} t={t} />
			))}
		</div>
	);
}
