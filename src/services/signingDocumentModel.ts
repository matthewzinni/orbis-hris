export type SigningDocumentContent = {
  title: string;
  body: string;
  letterhead_name: string;
  letterhead_details: string;
  logo: string;
};
export type SigningDocument = {
  id: string;
  account_id: string;
  content: SigningDocumentContent;
  signer_name: string;
  signer_email: string;
  allow_recipient_edits: boolean;
  status: 'draft' | 'pending' | 'signed';
  signed_content?: SigningDocumentContent;
  signature?: string;
  signed_name?: string;
  signed_at?: string;
  signed_hash?: string;
  created_at: string;
};
export function validateDocumentContent(content: SigningDocumentContent): string | null {
  if (!content.title.trim() || content.title.length > 200) return 'Enter a document title (up to 200 characters).';
  if (!content.body.trim() || content.body.length > 100000) return 'Enter document text (up to 100,000 characters).';
  if (content.letterhead_name.length > 200 || content.letterhead_details.length > 2000) return 'The letterhead is too long.';
  if (content.logo && (!/^data:image\/(png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(content.logo) || content.logo.length > 700000)) return 'Use a PNG or JPG logo under 500 KB.';
  return null;
}
export const emptyDocumentContent = (): SigningDocumentContent => ({ title: '', body: '', letterhead_name: '', letterhead_details: '', logo: '' });
