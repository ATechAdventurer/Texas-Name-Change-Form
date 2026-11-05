import { PDFDocument, type PDFField, PDFHexString, PDFName } from "pdf-lib";

export interface PetitionData {
	curFirst?: string;
	curMiddle?: string;
	curLast?: string;
	bcFirst?: string;
	bcMiddle?: string;
	bcLast?: string;
	newFirst?: string;
	newMiddle?: string;
	newLast?: string;
	reason?: string;
	race?: string;
	dob?: string;
	birthCity?: string;
	birthCounty?: string;
	birthState?: string;
	birthCountry?: string;
	ssn3?: string;
	dl3?: string;
	dlState?: string;
	phone?: string;
	email?: string;
	street?: string;
	city?: string;
	state?: string;
	zip?: string;
	county?: string;
	country?: string;
	execCounty?: string;
	execState?: string;
	sex?: "" | "Male" | "Female";
	sexOffender?: "Yes" | "No";
	charges?: "Yes" | "No";
	felony?: "Yes" | "No";
	fingerprintExhibit?: boolean;
	/** PNG bytes of the drawn signature; omitted when left blank. */
	signature?: Uint8Array;
}

type TextKey = Exclude<
	keyof PetitionData,
	| "sex"
	| "sexOffender"
	| "charges"
	| "felony"
	| "fingerprintExhibit"
	| "signature"
>;

const TEXT_MAP: Record<TextKey, string[]> = {
	curFirst: ["legal-name1-first", "petitioner-name-first"],
	curMiddle: ["legal-name1-middle", "petitioner-name-middle"],
	curLast: ["legal-name1-last", "petitioner-name-last"],
	bcFirst: ["birth-cert-name-first"],
	bcMiddle: ["birth-cert-name-middle"],
	bcLast: ["birth-cert-name-last"],
	newFirst: ["new-name-first"],
	newMiddle: ["new-name-middle"],
	newLast: ["new-name-last"],
	reason: ["name-change-reason"],
	race: ["petitioner-race"],
	dob: ["petitioner-dob"],
	birthCity: ["birthplace-city"],
	birthCounty: ["birthplace-county"],
	birthState: ["birthplace-state"],
	birthCountry: ["birthplace-country"],
	ssn3: ["petitioner-ssn"],
	dl3: ["petitioner-dl1-last3"],
	dlState: ["petitioner-dl1-state"],
	phone: ["petitioner-phone"],
	email: ["petitioner-email"],
	street: ["address-street"],
	city: ["address-city"],
	state: ["address-state"],
	zip: ["address-zip-code"],
	county: ["address-county"],
	country: ["address-country"],
	execCounty: ["signature-county"],
	execState: ["signature-state"],
};

const OPTION_MAP = {
	sex: "chk-birth-cert-sex",
	sexOffender: "chk-sex-offender",
	charges: "chk-charges",
	felony: "chk-felony-conviction",
} as const;

/** Keep only the last 3 digits — full SSN/DL numbers never reach the PDF. */
export const last3 = (v: string): string => v.replace(/\D/g, "").slice(-3);

/** These option sets are multi-widget buttons where each widget has its own on-state (/Male, /Female, /Yes, /No). */
function selectOption(field: PDFField, value: string): void {
	const on = PDFName.of(value);
	field.acroField.dict.set(PDFName.of("V"), on);
	for (const w of field.acroField.getWidgets()) {
		const state = w.getOnValue();
		w.setAppearanceState(
			state && state.toString() === on.toString() ? on : PDFName.of("Off"),
		);
	}
}

/** pdf-lib has no signature-field API, so build the /Sig widget by hand. */
function addSignatureField(
	pdf: PDFDocument,
	pageIndex: number,
	rect: [number, number, number, number],
	name: string,
): void {
	const page = pdf.getPage(pageIndex);
	const widget = pdf.context.obj({
		Type: "Annot",
		Subtype: "Widget",
		FT: "Sig",
		T: PDFHexString.fromText(name),
		Rect: rect,
		F: 4,
		P: page.ref,
	});
	const ref = pdf.context.register(widget);
	page.node.addAnnot(ref);
	pdf.getForm().acroForm.addField(ref);
}

export async function fillPetition(
	templateBytes: ArrayBuffer | Uint8Array,
	d: PetitionData,
): Promise<Uint8Array> {
	const pdf = await PDFDocument.load(templateBytes);
	const form = pdf.getForm();
	for (const [k, names] of Object.entries(TEXT_MAP) as [TextKey, string[]][]) {
		let v = (d[k] ?? "").toString().trim();
		if ((k === "ssn3" || k === "dl3") && v) v = last3(v);
		if (k === "dob") v = v.replace(/^(\d{4})-(\d\d)-(\d\d)$/, "$2/$3/$1"); // date input gives ISO
		if (v) for (const n of names) form.getTextField(n).setText(v);
	}
	const printed = [d.curFirst, d.curMiddle, d.curLast]
		.filter(Boolean)
		.join(" ");
	if (printed) form.getTextField("petitioner-printed-name").setText(printed);
	for (const [k, n] of Object.entries(OPTION_MAP) as [
		keyof typeof OPTION_MAP,
		string,
	][]) {
		const v = d[k];
		if (v) selectOption(form.getField(n), v);
	}
	if (d.fingerprintExhibit) form.getCheckBox("chk-attached-document1").check();
	// Page 4 has two signature lines: the petition (section 6) and the perjury declaration (section 7).
	const slots = [
		{ name: "signature", x: 65, y: 594, w: 260, h: 30 },
		{ name: "signature2", x: 330, y: 272, w: 215, h: 28 },
	];
	const img = d.signature && (await pdf.embedPng(d.signature));
	if (img) {
		const today = new Date().toLocaleDateString("en-US", {
			month: "2-digit",
			day: "2-digit",
			year: "numeric",
		});
		for (const n of ["signature-date", "signature-date2"])
			form.getTextField(n).setText(today);
	}
	for (const { name, x, y, w, h } of slots) {
		if (img) {
			const { width, height } = img.scaleToFit(w, h);
			pdf.getPage(3).drawImage(img, { x, y, width, height });
		} else addSignatureField(pdf, 3, [x, y, x + w, y + h], name);
	}
	return pdf.save(); // fields stay editable
}
