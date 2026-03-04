import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold,
	Eraser,
	Italic,
	Link2,
	List,
	ListOrdered,
	Underline as UnderlineIcon,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type Props = {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
};

export function RichTextEditor({ value, onChange, placeholder, className }: Props) {
	const editor = useEditor({
		editorProps: {
			attributes: {
				class:
					"min-h-[260px] w-full rounded-b-md border border-t-0 bg-transparent px-3 py-2 text-sm outline-none",
			},
		},
		extensions: [
			StarterKit,
			Underline,
			Link.configure({
				autolink: true,
				openOnClick: false,
			}),
		],
		content: value,
		onUpdate: ({ editor: nextEditor }) => {
			onChange(nextEditor.getHTML());
		},
		immediatelyRender: false,
	});

	useEffect(() => {
		if (!editor) return;
		if (editor.getHTML() === value) return;
		editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
	}, [editor, value]);

	if (!editor) return null;

	const setLink = () => {
		const previousUrl = editor.getAttributes("link").href;
		const url = window.prompt("URL", previousUrl || "https://");
		if (url === null) return;
		if (!url.trim()) {
			editor.chain().focus().unsetLink().run();
			return;
		}
		editor.chain().focus().setLink({ href: url.trim() }).run();
	};

	return (
		<div className={cn("w-full", className)}>
			<div className="bg-muted/50 flex flex-wrap items-center gap-1 rounded-t-md border p-1">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => editor.chain().focus().toggleBold().run()}
					className={cn(editor.isActive("bold") && "bg-accent")}
				>
					<Bold className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => editor.chain().focus().toggleItalic().run()}
					className={cn(editor.isActive("italic") && "bg-accent")}
				>
					<Italic className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => editor.chain().focus().toggleUnderline().run()}
					className={cn(editor.isActive("underline") && "bg-accent")}
				>
					<UnderlineIcon className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => editor.chain().focus().toggleBulletList().run()}
					className={cn(editor.isActive("bulletList") && "bg-accent")}
				>
					<List className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => editor.chain().focus().toggleOrderedList().run()}
					className={cn(editor.isActive("orderedList") && "bg-accent")}
				>
					<ListOrdered className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={setLink}
					className={cn(editor.isActive("link") && "bg-accent")}
				>
					<Link2 className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
				>
					<Eraser className="size-4" />
				</Button>
			</div>
			<EditorContent editor={editor} />
			{placeholder && !value?.replace(/<[^>]+>/g, "").trim() && (
				<p className="text-muted-foreground mt-1 text-xs">{placeholder}</p>
			)}
		</div>
	);
}
