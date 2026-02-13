import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

interface HiddenQuestionsSettingsProps {
	settings: {
		hiddenQuestions: string[];
	};
	allQuestions?: string[];
}

export function HiddenQuestionsSettings({
	settings,
	allQuestions = [],
}: HiddenQuestionsSettingsProps) {
	const [hiddenQuestions, setHiddenQuestions] = useState<Set<string>>(
		new Set(settings.hiddenQuestions),
	);
	const [questionFilter, setQuestionFilter] = useState("");
	const formFetcher = useFetcher();
	const questionsFetcher = useFetcher();
	const [availableQuestions, setAvailableQuestions] = useState(allQuestions);
	const isLoadingQuestions =
		questionsFetcher.state !== "idle" && availableQuestions.length === 0;

	useEffect(() => {
		if (
			allQuestions.length === 0 &&
			questionsFetcher.state === "idle" &&
			!questionsFetcher.data
		) {
			questionsFetcher.load("/api/analytics/questions");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [allQuestions.length, questionsFetcher.state, questionsFetcher.data]);

	useEffect(() => {
		if (questionsFetcher.data && "allQuestions" in questionsFetcher.data) {
			setAvailableQuestions(questionsFetcher.data.allQuestions as string[]);
		}
	}, [questionsFetcher.data]);

	useEffect(() => {
		if (formFetcher.data) {
			if ("error" in formFetcher.data) {
				toast.error(formFetcher.data.error, { id: "hidden-questions-error" });
			} else if ("message" in formFetcher.data) {
				toast.success(formFetcher.data.message, {
					id: "hidden-questions-success",
				});
			}
		}
	}, [formFetcher.data]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<span className="material-symbols-outlined">visibility_off</span>
					Hidden Questions
				</CardTitle>
				<CardDescription>
					Select questions that should be hidden by default when viewing
					analytics. These columns will be unchecked in the "Columns" dropdown
					across all sheets.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<formFetcher.Form method="post" className="space-y-4">
					<input type="hidden" name="intent" value="save-hidden-questions" />
					<input
						type="hidden"
						name="hiddenQuestions"
						value={JSON.stringify(Array.from(hiddenQuestions))}
					/>

					{isLoadingQuestions ? (
						<p className="text-sm text-muted-foreground">
							Loading questions...
						</p>
					) : availableQuestions.length > 0 ? (
						<>
							<div className="space-y-2">
								<Label>Filter questions</Label>
								<Input
									placeholder="Search questions..."
									value={questionFilter}
									onChange={(e) => setQuestionFilter(e.target.value)}
									className="max-w-sm"
								/>
							</div>

							<div className="border rounded-lg max-h-80 overflow-y-auto">
								<div className="p-2 space-y-1">
									{availableQuestions
										.filter((q) =>
											q.toLowerCase().includes(questionFilter.toLowerCase()),
										)
										.map((question) => (
											<div
												key={question}
												className="flex items-start gap-2 p-2 hover:bg-muted/50 rounded"
											>
												<Checkbox
													id={`q-${question}`}
													checked={hiddenQuestions.has(question)}
													onCheckedChange={(checked) => {
														setHiddenQuestions((prev) => {
															const newSet = new Set(prev);
															if (checked) {
																newSet.add(question);
															} else {
																newSet.delete(question);
															}
															return newSet;
														});
													}}
													className="mt-0.5"
												/>
												<label
													htmlFor={`q-${question}`}
													className="text-sm cursor-pointer flex-1 leading-tight"
												>
													{question}
												</label>
											</div>
										))}
								</div>
							</div>

							<p className="text-xs text-muted-foreground">
								{hiddenQuestions.size} question
								{hiddenQuestions.size !== 1 ? "s" : ""} selected to hide •{" "}
								{availableQuestions.length} total question
								{availableQuestions.length !== 1 ? "s" : ""} found across all
								sheets
							</p>
						</>
					) : questionsFetcher.data && "error" in questionsFetcher.data ? (
						<p className="text-sm text-muted-foreground">
							Failed to load questions. Please try again.
						</p>
					) : (
						<p className="text-sm text-muted-foreground">
							No analytics sheets found. Questions will appear here once you
							have sheets in your analytics folder.
						</p>
					)}

					<Button
						type="submit"
						disabled={
							formFetcher.state !== "idle" ||
							isLoadingQuestions ||
							availableQuestions.length === 0
						}
					>
						{formFetcher.state === "idle"
							? "Save Hidden Questions"
							: "Saving..."}
					</Button>
				</formFetcher.Form>
			</CardContent>
		</Card>
	);
}
