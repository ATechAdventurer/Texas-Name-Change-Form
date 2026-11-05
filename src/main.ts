import "./style.css";

import { fillPetition, type PetitionData } from "./fill";

const f = document.querySelector<HTMLFormElement>("#f");
const msg = document.querySelector<HTMLDivElement>("#msg");

if (!f) {
	throw new Error("Form not found");
}

if (!msg) {
	throw new Error("Message element not found");
}

f.addEventListener("submit", async (e) => {
	e.preventDefault();
	try {
		const d = Object.fromEntries(new FormData(f)) as unknown as PetitionData;
		d.fingerprintExhibit = (
			f.elements.namedItem("fingerprintExhibit") as HTMLInputElement
		).checked;
		const tpl = await (
			await fetch(`${import.meta.env.BASE_URL}template.pdf`)
		).arrayBuffer();
		const bytes = await fillPetition(tpl, d);
		const a = document.createElement("a");
		a.href = URL.createObjectURL(
			new Blob([bytes as BlobPart], { type: "application/pdf" }),
		);
		a.download = `Petition_${[d.newFirst, d.newMiddle, d.newLast].filter(Boolean).join("_") || "name_change"}.pdf`;
		a.click();
    msg.textContent = "Petition PDF generated successfully!";
	} catch (err) {
    msg.textContent = "Error generating petition PDF. Please try again.";
	}
});
