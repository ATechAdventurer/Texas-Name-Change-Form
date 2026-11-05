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

const bcSame = document.querySelector<HTMLInputElement>("#bcSame");
const bcFields = document.querySelector<HTMLDivElement>("#bcFields");

if (!bcSame || !bcFields) {
	throw new Error("Birth certificate name elements not found");
}

const bcRequired = ["bcFirst", "bcLast"].map(
	(n) => f.elements.namedItem(n) as HTMLInputElement,
);

const syncBc = () => {
	bcFields.hidden = bcSame.checked;
	for (const el of bcRequired) el.required = !bcSame.checked;
};

bcSame.addEventListener("change", syncBc);

const sig = document.querySelector<HTMLCanvasElement>("#sig");
const sigCtx = sig?.getContext("2d");

if (!sig || !sigCtx) {
	throw new Error("Signature canvas not found");
}

sigCtx.lineWidth = 2;
sigCtx.lineCap = "round";
sigCtx.lineJoin = "round";

let signed = false;
let drawing = false;

const sigPoint = (e: PointerEvent) => {
	const r = sig.getBoundingClientRect();
	return {
		x: ((e.clientX - r.left) * sig.width) / r.width,
		y: ((e.clientY - r.top) * sig.height) / r.height,
	};
};

sig.addEventListener("pointerdown", (e) => {
	drawing = true;
	signed = true;
	sig.setPointerCapture(e.pointerId);
	const { x, y } = sigPoint(e);
	sigCtx.beginPath();
	sigCtx.moveTo(x, y);
	sigCtx.lineTo(x, y);
	sigCtx.stroke();
});

sig.addEventListener("pointermove", (e) => {
	if (!drawing) return;
	const { x, y } = sigPoint(e);
	sigCtx.lineTo(x, y);
	sigCtx.stroke();
});

for (const ev of ["pointerup", "pointercancel"]) {
	sig.addEventListener(ev, () => {
		drawing = false;
	});
}

const clearSig = () => {
	sigCtx.clearRect(0, 0, sig.width, sig.height);
	signed = false;
};

document
	.querySelector<HTMLButtonElement>("#sigClear")
	?.addEventListener("click", clearSig);

document
	.querySelector<HTMLButtonElement>("#clear")
	?.addEventListener("click", () => {
		f.reset();
		syncBc();
		clearSig();
		msg.textContent = "";
	});

f.addEventListener("submit", async (e) => {
	e.preventDefault();
	try {
		const d = Object.fromEntries(new FormData(f)) as unknown as PetitionData;
		if (bcSame.checked) {
			d.bcFirst = d.curFirst;
			d.bcMiddle = d.curMiddle;
			d.bcLast = d.curLast;
		}
		d.fingerprintExhibit = (
			f.elements.namedItem("fingerprintExhibit") as HTMLInputElement
		).checked;
		if (signed) {
			const blob = await new Promise<Blob | null>((r) => sig.toBlob(r));
			if (blob) d.signature = new Uint8Array(await blob.arrayBuffer());
		}
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
	} catch (_err) {
		msg.textContent = "Error generating petition PDF. Please try again.";
	}
});
