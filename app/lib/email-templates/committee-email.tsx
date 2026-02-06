import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import { render } from "@react-email/components";

interface CommitteeEmailProps {
	bodyHtml: string;
	previewText?: string;
	quotedReply?: {
		date: string;
		fromName: string;
		fromEmail: string;
		bodyHtml: string;
	};
	signature?: string;
}

export function CommitteeEmail({
	bodyHtml,
	previewText,
	quotedReply,
	signature,
}: CommitteeEmailProps) {
	return (
		<Html>
			<Head />
			{previewText && <Preview>{previewText}</Preview>}
			<Body style={bodyStyle}>
				<Container style={containerStyle}>
					<Section
						// biome-ignore lint/security/noDangerouslySetInnerHtml: committee email body content
						dangerouslySetInnerHTML={{ __html: bodyHtml }}
					/>
					{signature && (
						<>
							<Hr style={hrStyle} />
							<Text style={signatureStyle}>{signature}</Text>
						</>
					)}
					{quotedReply && (
						<>
							<Hr style={hrStyle} />
							<Text style={quotedHeaderStyle}>
								On {quotedReply.date}, {quotedReply.fromName || quotedReply.fromEmail}{" "}
								&lt;{quotedReply.fromEmail}&gt; wrote:
							</Text>
							<Section
								style={quotedBodyStyle}
								// biome-ignore lint/security/noDangerouslySetInnerHtml: quoted reply from original email
								dangerouslySetInnerHTML={{
									__html: quotedReply.bodyHtml,
								}}
							/>
						</>
					)}
				</Container>
			</Body>
		</Html>
	);
}

const bodyStyle = {
	backgroundColor: "#ffffff",
	fontFamily:
		'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
	fontSize: "14px",
	lineHeight: "1.6",
	color: "#333333",
};

const containerStyle = {
	maxWidth: "600px",
	margin: "0 auto",
	padding: "20px",
};

const hrStyle = {
	borderTop: "1px solid #e0e0e0",
	margin: "16px 0",
};

const signatureStyle = {
	color: "#666666",
	fontSize: "13px",
	margin: "0",
};

const quotedHeaderStyle = {
	color: "#666666",
	fontSize: "12px",
	margin: "0 0 8px",
};

const quotedBodyStyle = {
	borderLeft: "2px solid #cccccc",
	paddingLeft: "12px",
	color: "#666666",
};

/**
 * Render the committee email template to an HTML string.
 */
export async function renderCommitteeEmail(
	props: CommitteeEmailProps,
): Promise<string> {
	return render(<CommitteeEmail {...props} />);
}
