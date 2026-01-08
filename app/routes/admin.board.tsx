import type { Route } from "./+types/admin.board";
import { Form, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { getSubmissions, updateSubmissionStatus, type Submission } from "~/lib/google.server";
import { SUBMISSION_STATUSES } from "~/lib/constants";
import { PageWrapper } from "~/components/layout/page-layout";
import { cn } from "~/lib/utils";

export function meta() {
    return [
        { title: "Toas Hippos - Admin Board" },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    const session = await requireAdmin(request);
    const submissions = await getSubmissions();

    return {
        session,
        submissions: submissions.reverse(), // Latest first
    };
}

export async function action({ request }: Route.ActionArgs) {
    await requireAdmin(request);

    const formData = await request.formData();
    const rowIndex = Number(formData.get("rowIndex"));
    const newStatus = formData.get("status") as string;

    if (rowIndex && newStatus) {
        await updateSubmissionStatus(rowIndex, newStatus);
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

export default function AdminBoard({ loaderData }: Route.ComponentProps) {
    const { session, submissions } = loaderData;

    return (
        <PageWrapper>
            <div className="w-full max-w-6xl mx-auto px-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                            Hallintapaneeli
                        </h1>
                        <p className="text-lg text-gray-500">
                            Admin Board
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {session.name || session.email}
                            </p>
                            <p className="text-xs text-gray-500">{session.email}</p>
                        </div>
                        <a
                            href="/auth/logout"
                            className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-primary transition-colors"
                        >
                            Kirjaudu ulos / Logout
                        </a>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                    {SUBMISSION_STATUSES.map((status) => {
                        const count = submissions.filter(s => s.status === status).length;
                        return (
                            <div
                                key={status}
                                className={cn(
                                    "p-4 rounded-xl text-center",
                                    STATUS_COLORS[status] || "bg-gray-100"
                                )}
                            >
                                <p className="text-3xl font-black">{count}</p>
                                <p className="text-xs font-bold uppercase tracking-wide opacity-75">
                                    {status.split(" / ")[0]}
                                </p>
                            </div>
                        );
                    })}
                </div>

                {/* Submissions Table */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
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
                                        <SubmissionRow key={submission.rowIndex} submission={submission} />
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

function SubmissionRow({ submission }: { submission: Submission }) {
    const formattedDate = new Date(submission.timestamp).toLocaleDateString("fi-FI", {
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
            </td>
            <td className="px-4 py-4 max-w-md">
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {submission.message}
                </p>
            </td>
            <td className="px-4 py-4">
                <Form method="post" className="flex items-center gap-2">
                    <input type="hidden" name="rowIndex" value={submission.rowIndex} />
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
            </td>
        </tr>
    );
}
