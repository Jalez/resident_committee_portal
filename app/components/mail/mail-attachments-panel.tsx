import { Paperclip, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { DraftManualAttachment } from "~/lib/mail-draft-attachments";

type RelationAttachmentItem = {
	key: `minute:${string}` | `receipt:${string}`;
	name: string;
	type: "minute" | "receipt";
};

type Props = {
	relationAttachmentItems: RelationAttachmentItem[];
	excludedKeys: Set<string>;
	manualAttachments: DraftManualAttachment[];
	includedRelationAttachmentCount: number;
	onUploadManualAttachment: (file: File | null) => void | Promise<void>;
	onIncludeRelationAttachment: (key: `minute:${string}` | `receipt:${string}`) => void;
	onExcludeRelationAttachment: (key: `minute:${string}` | `receipt:${string}`) => void;
	onRemoveManualAttachment: (attachmentId: string) => void | Promise<void>;
};

export function MailAttachmentsPanel({
	relationAttachmentItems,
	excludedKeys,
	manualAttachments,
	includedRelationAttachmentCount,
	onUploadManualAttachment,
	onIncludeRelationAttachment,
	onExcludeRelationAttachment,
	onRemoveManualAttachment,
}: Props) {
	return (
		<div className="bg-muted/30 mt-3 rounded-md border p-3 text-sm">
			<div className="flex items-center justify-between">
				<p className="font-medium">Email attachments</p>
				<label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs">
					<Paperclip className="size-3.5" />
					Attach file
					<input
						type="file"
						className="hidden"
						onChange={(event) => {
							void onUploadManualAttachment(event.target.files?.[0] || null);
							event.currentTarget.value = "";
						}}
					/>
				</label>
			</div>
			<p className="text-muted-foreground mt-1">
				Linked files are included unless excluded. Manual files are saved with
				this draft.
			</p>

			<div className="mt-3 space-y-2">
				{relationAttachmentItems.map((item) => {
					const excluded = excludedKeys.has(item.key);
					return (
						<div
							key={item.key}
							className="bg-background flex items-center justify-between rounded border px-2 py-1.5"
						>
							<div className="flex items-center gap-2">
								<span className="text-xs font-medium uppercase opacity-70">
									{item.type}
								</span>
								<span className={excluded ? "text-muted-foreground line-through" : ""}>
									{item.name}
								</span>
							</div>
							{excluded ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => onIncludeRelationAttachment(item.key)}
								>
									Include
								</Button>
							) : (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => onExcludeRelationAttachment(item.key)}
								>
									<X className="size-4" />
								</Button>
							)}
						</div>
					);
				})}

				{manualAttachments.map((attachment) => (
					<div
						key={attachment.id}
						className="bg-background flex items-center justify-between rounded border px-2 py-1.5"
					>
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium uppercase opacity-70">file</span>
							<span>{attachment.name}</span>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							onClick={() => void onRemoveManualAttachment(attachment.id)}
						>
							<X className="size-4" />
						</Button>
					</div>
				))}

				{relationAttachmentItems.length === 0 && manualAttachments.length === 0 && (
					<p className="text-muted-foreground">No attachments yet.</p>
				)}
			</div>
			<p className="text-muted-foreground mt-2 text-xs">
				Including {includedRelationAttachmentCount} linked file(s) and {manualAttachments.length} manual file(s).
			</p>
		</div>
	);
}
