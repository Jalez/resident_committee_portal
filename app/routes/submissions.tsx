import type { Route } from "./+types/submissions";
import { Form } from "react-router";
import { requirePermission, hasPermission } from "~/lib/auth.server";
import { getDatabase, type Submission, type SubmissionStatus } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import { SUBMISSION_STATUSES } from "~/lib/constants";
import { PageWrapper } from "~/components/layout/page-layout";
import { cn } from "~/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Yhteydenotot / Submissions` },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    const user = await requirePermission(request, "submissions:read", getDatabase);
    const db = getDatabase();
    const submissions = await db.getSubmissions();

    // Sort by createdAt descending (newest first)
    const sortedSubmissions = submissions.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
        siteConfig: SITE_CONFIG,
        session: user,
        submissions: sortedSubmissions,
        canDelete: hasPermission(user, "submissions:delete"),
    };
}

export async function action({ request }: Route.ActionArgs) {
    const user = await requirePermission(request, "submissions:write", getDatabase);
    const db = getDatabase();

    const formData = await request.formData();
    const actionType = formData.get("_action") as string;
    const submissionId = formData.get("submissionId") as string;

    if (actionType === "delete" && submissionId) {
        // Check for delete permission
        if (!hasPermission(user, "submissions:delete")) {
            throw new Response("Forbidden - Missing submissions:delete permission", { status: 403 });
        }
        await db.deleteSubmission(submissionId);
    } else if (actionType === "status" || !actionType) {
        const newStatus = formData.get("status") as SubmissionStatus;
        if (submissionId && newStatus) {
            await db.updateSubmissionStatus(submissionId, newStatus);
        }
    }

    return { success: true };
}

// Type badge colors
const TYPE_COLORS: Record<string, string> = {
    committee: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    events: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    purchases: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    questions: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

// Status badge colors
const STATUS_COLORS: Record<string, string> = {
    "Uusi / New": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    "Käsittelyssä / In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    "Hyväksytty / Approved": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    "Hylätty / Rejected": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    "Valmis / Done": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function Submissions({ loaderData }: Route.ComponentProps) {
    const { session, submissions, canDelete } = loaderData;

    return (
        <PageWrapper>
            <div className="w-full max-w-6xl mx-auto px-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                            Yhteydenotot
                        </h1>
                        <p className="text-lg text-gray-500">
                            Submissions
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {session.name || session.email}
                            </p>
                            <p className="text-xs text-gray-500">{session.email}</p>
                        </div>
                    </div>
                </div>

                {/* Submissions List - Card View for Mobile */}
                <div className="space-y-4 md:hidden mb-8">
                    {submissions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                            Ei vielä yhteydenottoja / No submissions yet
                        </div>
                    ) : (
                        submissions.map((submission) => (
                            <div key={submission.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500 font-medium">
                                        {new Date(submission.createdAt).toLocaleDateString("fi-FI", {
                                            day: "numeric",
                                            month: "short",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                    <span className={cn(
                                        "px-2 py-1 rounded-full text-xs font-bold uppercase",
                                        TYPE_COLORS[submission.type] || "bg-gray-100 text-gray-700"
                                    )}>
                                        {submission.type}
                                    </span>
                                </div>

                                <div>
                                    <h3 className="font-bold text-gray-900 dark:text-white">{submission.name}</h3>
                                    <p className="text-sm text-gray-500">{submission.email}</p>
                                    {submission.apartmentNumber && (
                                        <p className="text-xs text-gray-400 mt-0.5">Asunto: {submission.apartmentNumber}</p>
                                    )}
                                </div>

                                <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                                    {submission.message}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                                    <Form method="post" className="flex-1 mr-4">
                                        <input type="hidden" name="_action" value="status" />
                                        <input type="hidden" name="submissionId" value={submission.id} />
                                        <select
                                            name="status"
                                            defaultValue={submission.status}
                                            onChange={(e) => e.target.form?.requestSubmit()}
                                            className={cn(
                                                "w-full px-3 py-2 rounded-lg text-sm font-medium border-0 cursor-pointer transition-colors appearance-none",
                                                STATUS_COLORS[submission.status] || "bg-gray-100"
                                            )}
                                        >
                                            {SUBMISSION_STATUSES.map((status) => (
                                                <option key={status} value={status}>
                                                    {status.split(" / ")[0]}
                                                </option>
                                            ))}
                                        </select>
                                    </Form>

                                    {canDelete && (
                                        <Form method="post" onSubmit={(e) => {
                                            if (!confirm("Haluatko varmasti poistaa tämän yhteydenoton? / Are you sure you want to delete this submission?")) {
                                                e.preventDefault();
                                            }
                                        }}>
                                            <input type="hidden" name="_action" value="delete" />
                                            <input type="hidden" name="submissionId" value={submission.id} />
                                            <button
                                                type="submit"
                                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            >
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        </Form>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Submissions Table */}
                <div className="hidden md:block bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                                        Aika
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                                        Tyyppi
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                                        Lähettäjä
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                                        Viesti
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                                        Tila
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {submissions.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                                            Ei vielä yhteydenottoja / No submissions yet
                                        </td>
                                    </tr>
                                ) : (
                                    submissions.map((submission) => (
                                        <SubmissionRow key={submission.id} submission={submission} canDelete={canDelete} />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </PageWrapper>
    );
}

function SubmissionRow({ submission, canDelete }: { submission: Submission; canDelete?: boolean }) {
    const formattedDate = new Date(submission.createdAt).toLocaleDateString("fi-FI", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {formattedDate}
            </td>
            <td className="px-4 py-4 whitespace-nowrap">
                <span className={cn(
                    "px-2 py-1 rounded-full text-xs font-bold uppercase",
                    TYPE_COLORS[submission.type] || "bg-gray-100 text-gray-700"
                )}>
                    {submission.type}
                </span>
            </td>
            <td className="px-4 py-4">
                <p className="font-medium text-gray-900 dark:text-white">{submission.name}</p>
                <p className="text-sm text-gray-500">{submission.email}</p>
                {submission.apartmentNumber && (
                    <p className="text-xs text-gray-400">Asunto: {submission.apartmentNumber}</p>
                )}
            </td>
            <td className="px-4 py-4 max-w-md">
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {submission.message}
                </p>
            </td>
            <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                    <Form method="post" className="flex items-center">
                        <input type="hidden" name="_action" value="status" />
                        <input type="hidden" name="submissionId" value={submission.id} />
                        <select
                            name="status"
                            defaultValue={submission.status}
                            onChange={(e) => e.target.form?.requestSubmit()}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-sm font-medium border-0 cursor-pointer transition-colors",
                                STATUS_COLORS[submission.status] || "bg-gray-100"
                            )}
                        >
                            {SUBMISSION_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                    {status}
                                </option>
                            ))}
                        </select>
                    </Form>
                    {canDelete && (
                        <Form method="post" onSubmit={(e) => {
                            if (!confirm("Haluatko varmasti poistaa tämän yhteydenoton? / Are you sure you want to delete this submission?")) {
                                e.preventDefault();
                            }
                        }}>
                            <input type="hidden" name="_action" value="delete" />
                            <input type="hidden" name="submissionId" value={submission.id} />
                            <button
                                type="submit"
                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Poista / Delete"
                            >
                                <span className="material-symbols-outlined text-xl">delete</span>
                            </button>
                        </Form>
                    )}
                </div>
            </td>
        </tr>
    );
}
